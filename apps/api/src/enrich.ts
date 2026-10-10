import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  acceptDescription,
  applyDescription,
  describePrompt,
  domainOf,
  enrichRecords,
  entityOf,
  entityOrganization,
  mockTrustProvider,
  noteSnippet,
  profileLinkCandidates,
  relevantNotes,
  type CollectedRecord,
  type EnrichCache,
  type IdentityEntity,
  type PageNote,
  type ProviderCandidate,
} from "@dig/core";
import { chatJson, findContact, llmLanes, tavilySearch, type TavilyResult } from "./collect-live.js";
import { beginHunterRun, lookupHunter } from "./hunter.js";
import { jevTrustProvider } from "./jev-client.js";
import type { Progress } from "./db.js";
import { env } from "./env.js";

const DAY = 86_400_000;

interface CacheEntry {
  at: number;
  ttl: number;
  value: unknown;
}

function cacheFile() {
  return path.join(env.cacheDir, "enrichment.json");
}

function readCache(): Map<string, CacheEntry> {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(), "utf8")) as Record<string, CacheEntry>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeCache(cache: Map<string, CacheEntry>) {
  mkdirSync(env.cacheDir, { recursive: true });
  const body: Record<string, CacheEntry> = {};
  for (const [key, entry] of cache) {
    if (Date.now() - entry.at > entry.ttl) continue;
    body[key] = entry;
  }
  writeFileSync(cacheFile(), JSON.stringify(body));
}

function ttlFor(provider: string) {
  if (env.enrichmentCacheTtlMs > 0) return env.enrichmentCacheTtlMs;
  return provider === "pdl" || provider === "apollo" ? 5 * DAY : 7 * DAY;
}

/** Provider results only. A cache hit never invents a value the provider did not return. */
export function enrichmentCache(): EnrichCache {
  return {
    get(key) {
      const entry = readCache().get(key);
      if (!entry || Date.now() - entry.at > entry.ttl) return null;
      return entry.value as ProviderCandidate[];
    },
    set(key, value) {
      const provider = key.slice(0, key.indexOf(":")) || "tavily";
      const cache = readCache();
      cache.set(key, { at: Date.now(), ttl: ttlFor(provider), value });
      writeCache(cache);
    },
  };
}

function profileOf(entity: IdentityEntity, extra: Partial<IdentityEntity> = {}): ProviderCandidate["profile"] {
  return {
    name: extra.name || entity.name,
    company: extra.company || entity.company,
    location: extra.location || entity.location,
    website: extra.website || entity.website,
  };
}

function candidate(partial: Omit<ProviderCandidate, "profile"> & { profile?: ProviderCandidate["profile"] }, entity: IdentityEntity): ProviderCandidate {
  return { profile: profileOf(entity), ...partial };
}

async function tavilyCandidates(entity: IdentityEntity, signal: AbortSignal): Promise<ProviderCandidate[]> {
  if (!env.tavilyKey) return [];
  const found: ProviderCandidate[] = [];
  const org = entityOrganization(entity);
  if (org || entity.website) {
    const contacts = await findContact(org || entity.name, signal);
    if (signal.aborted) return found;
    for (const page of contacts) {
      const pageText = `${page.title}\n${page.text}`;
      if (page.fields.email) {
        found.push(candidate({
          provider: "tavily",
          channel: "email",
          value: page.fields.email,
          sourceUrl: page.url,
          pageText,
          confidence: 0.9,
          verificationStatus: "grounded",
          sources: [page.url],
        }, entity));
      }
      if (page.fields.phone) {
        found.push(candidate({
          provider: "tavily",
          channel: "phone",
          value: page.fields.phone,
          sourceUrl: page.url,
          pageText,
          confidence: 0.8,
          verificationStatus: "grounded",
          sources: [page.url],
        }, entity));
      }
      if (page.fields.website) {
        found.push(candidate({
          provider: "tavily",
          channel: "website",
          value: page.fields.website,
          sourceUrl: page.url,
          pageText,
          confidence: 0.85,
          verificationStatus: "grounded",
          sources: [page.url],
        }, entity));
      }
      if (/\/contact\b/i.test(page.url)) {
        found.push(candidate({
          provider: "tavily",
          channel: "contactPage",
          value: page.url,
          sourceUrl: page.url,
          pageText,
          confidence: 0.8,
          verificationStatus: null,
          sources: [page.url],
        }, entity));
      }
    }
  }

  const company = entity.kind === "company";
  const terms = company ? [entity.name, "LinkedIn"] : [entity.name, org, "LinkedIn OR GitHub"];
  const query = [...new Set(terms.filter(Boolean))].join(" ");
  const results = await tavilySearch({ query, depth: "basic", maxResults: 5, rawContent: false }, signal);
  if (signal.aborted) return found;
  rememberNotes(entity, results);
  found.push(...profileLinkCandidates(entity, results));
  return found;
}

// ---------------------------------------------------------------------------
// Pages about each row, kept so an empty "What they do" or "Expertise" can be filled
// with words copied from them. Cached beside the provider results, for the same 7 days.
// ---------------------------------------------------------------------------

function noteKey(entity: IdentityEntity) {
  return `notes:${entity.name}:${entity.company}`.toLowerCase();
}

function rememberNotes(entity: IdentityEntity, results: TavilyResult[]): PageNote[] {
  const notes = relevantNotes(
    entity,
    results.map((result) => ({ url: result.url, title: result.title, text: result.content })),
  ).slice(0, 3);
  const cache = readCache();
  cache.set(noteKey(entity), { at: Date.now(), ttl: 7 * DAY, value: notes });
  writeCache(cache);
  return notes;
}

function storedNotes(entity: IdentityEntity): PageNote[] | null {
  const entry = readCache().get(noteKey(entity));
  if (!entry || Date.now() - entry.at > entry.ttl) return null;
  return entry.value as PageNote[];
}

async function inPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++] as T;
        await task(item);
      }
    }),
  );
}

const DESCRIBE_BATCH = 20;

/**
 * Fill an empty description column from pages enrichment already found about each row.
 * The phrase must be copied from the page, and the page is cited as the field's source.
 * Anything that fails leaves the row as it was.
 */
async function describeMissing(records: CollectedRecord[], field: string, budgetMs: number): Promise<CollectedRecord[]> {
  const deadline = Date.now() + budgetMs;
  const missing = records.filter((record) => !record.fields[field]?.trim());
  if (missing.length === 0) return records;

  const items: Array<{ id: string; entity: IdentityEntity; notes: PageNote[] }> = [];
  await inPool(missing, env.enrichmentConcurrency.tavily, async (record) => {
    const entity = entityOf(record);
    if (!entity.name) return;
    let notes = storedNotes(entity);
    if (!notes && env.tavilyKey && Date.now() < deadline) {
      const org = entityOrganization(entity);
      const query = [...new Set([entity.name, org].filter(Boolean))].join(" ");
      const results = await tavilySearch({ query, depth: "basic", maxResults: 3, rawContent: false }, AbortSignal.timeout(8_000)).catch(() => []);
      notes = rememberNotes(entity, results);
    }
    const snippets = relevantNotes(entity, notes ?? []).slice(0, 2).map((note) => noteSnippet(entity, note));
    if (snippets.length) items.push({ id: record.canonicalEntityId, entity, notes: snippets });
  });
  if (items.length === 0) return records;

  const lanes = llmLanes();
  const chosen = new Map<string, { value: string; note: PageNote }>();
  for (let start = 0, batch = 0; start < items.length && Date.now() < deadline; start += DESCRIBE_BATCH, batch += 1) {
    const slice = items.slice(start, start + DESCRIBE_BATCH);
    const user = slice
      .map((item, index) => {
        const pages = item.notes.map((note) => `${note.title} — ${note.text}`).join("\n");
        return `[${index + 1}] ${item.entity.name}${item.entity.company && item.entity.company !== item.entity.name ? ` (${item.entity.company})` : ""}\n${pages}`;
      })
      .join("\n\n");
    const lane = lanes[batch % lanes.length]!;
    const parsed = await chatJson<{ items?: Array<{ id?: string | number; value?: unknown }> }>(lane, {
      system: describePrompt(field),
      user,
      maxTokens: 1500,
      deadline,
      label: `describe ${field} batch ${batch + 1}`,
      // Extraction has usually just spent the rate budget: wait it out inside this step's own deadline.
      handBack: false,
    });
    for (const answer of parsed?.items ?? []) {
      const item = slice[Number(answer.id) - 1];
      if (!item) continue;
      const accepted = acceptDescription(answer.value, item.entity, item.notes);
      if (accepted) chosen.set(item.id, accepted);
    }
  }
  console.log(`[enrich] ${field}: filled ${chosen.size} of ${missing.length} empty rows (${items.length} had pages about them)`);
  return records.map((record) => {
    const accepted = chosen.get(record.canonicalEntityId);
    return accepted ? applyDescription(record, field, accepted.value, accepted.note) : record;
  });
}

async function githubCandidates(entity: IdentityEntity, signal: AbortSignal): Promise<ProviderCandidate[]> {
  if (!env.githubEnabled || !entity.name) return [];
  // Name only: "in:name" needs every word in the profile name. The company is checked afterwards by identity matching.
  const query = entity.name;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "dig-research",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.githubToken) headers.Authorization = `Bearer ${env.githubToken}`;
  const search = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(`${query} in:name`)}&per_page=3`, {
    headers,
    signal,
  });
  if (!search.ok) throw new Error(`GitHub search ${search.status}`);
  const body = (await search.json()) as { items?: Array<{ login?: string }> };
  const found: ProviderCandidate[] = [];
  for (const item of (body.items ?? []).slice(0, 3)) {
    if (!item.login || signal.aborted) continue;
    const profile = await fetch(`https://api.github.com/users/${encodeURIComponent(item.login)}`, { headers, signal });
    if (!profile.ok) continue;
    const user = (await profile.json()) as {
      html_url?: string;
      name?: string | null;
      login?: string;
      company?: string | null;
      location?: string | null;
      blog?: string | null;
    };
    if (!user.html_url) continue;
    found.push({
      provider: "github",
      channel: "github",
      value: user.html_url,
      sourceUrl: user.html_url,
      pageText: null,
      confidence: 0.75,
      verificationStatus: null,
      sources: [user.html_url],
      profile: {
        name: user.name || user.login || "",
        company: (user.company ?? "").replace(/^@/, ""),
        location: user.location ?? "",
        website: user.blog ?? "",
      },
    });
  }
  return found;
}

async function pdlCandidates(entity: IdentityEntity, signal: AbortSignal): Promise<ProviderCandidate[]> {
  if (!env.pdlEnabled || !env.pdlKey || !entity.name) return [];
  const params = new URLSearchParams({ name: entity.name, api_key: env.pdlKey });
  if (entity.company) params.set("company", entity.company);
  const response = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, { signal });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`People Data Labs ${response.status}`);
  const body = (await response.json()) as { data?: { linkedin_url?: string | null; github_url?: string | null; job_company_name?: string | null; location_name?: string | null; full_name?: string | null } };
  return profileUrls("pdl", body.data ?? {}, entity);
}

async function apolloCandidates(entity: IdentityEntity, signal: AbortSignal): Promise<ProviderCandidate[]> {
  if (!env.apolloEnabled || !env.apolloKey || !entity.name) return [];
  const response = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.apolloKey },
    body: JSON.stringify({
      name: entity.name,
      organization_name: entity.company || undefined,
      domain: domainOf(entity.website) || undefined,
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Apollo ${response.status}`);
  const body = (await response.json()) as { person?: { linkedin_url?: string | null; github_url?: string | null; organization_name?: string | null; city?: string | null; name?: string | null } };
  return profileUrls("apollo", {
    linkedin_url: body.person?.linkedin_url,
    github_url: body.person?.github_url,
    job_company_name: body.person?.organization_name,
    location_name: body.person?.city,
    full_name: body.person?.name,
  }, entity);
}

function profileUrls(
  provider: "pdl" | "apollo",
  data: { linkedin_url?: string | null; github_url?: string | null; job_company_name?: string | null; location_name?: string | null; full_name?: string | null },
  entity: IdentityEntity,
): ProviderCandidate[] {
  const profile = {
    name: data.full_name || entity.name,
    company: data.job_company_name || "",
    location: data.location_name || "",
    website: "",
  };
  const found: ProviderCandidate[] = [];
  if (data.linkedin_url && /^https?:\/\//i.test(data.linkedin_url)) {
    found.push({
      provider,
      channel: "linkedin",
      value: data.linkedin_url,
      sourceUrl: data.linkedin_url,
      pageText: null,
      confidence: 0.7,
      verificationStatus: null,
      sources: [data.linkedin_url],
      profile,
    });
  }
  if (data.github_url && /^https?:\/\//i.test(data.github_url)) {
    found.push({
      provider,
      channel: "github",
      value: data.github_url,
      sourceUrl: data.github_url,
      pageText: null,
      confidence: 0.7,
      verificationStatus: null,
      sources: [data.github_url],
      profile,
    });
  }
  return found;
}

export function trustProvider() {
  return jevTrustProvider();
}

function bounded(timeoutMs: number, parent: AbortSignal) {
  return AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]);
}

export async function enrichCollected(
  records: CollectedRecord[],
  options: { demo: boolean; now: string; describeField?: string | null; onStage?: (stage: string, progress: Progress) => void },
): Promise<CollectedRecord[]> {
  if (!options.demo && env.hunterEnabled) beginHunterRun();
  const progress = (stage: "ENRICHING" | "IDENTITY_RESOLUTION" | "TRUST_EVALUATION") => {
    options.onStage?.(stage, {
      stage,
      percent: stage === "ENRICHING" ? 34 : stage === "IDENTITY_RESOLUTION" ? 38 : 42,
      sourcesPlanned: records.length,
      sourcesScanned: records.length,
      documents: records.length,
      records: records.length,
      valid: 0,
      duplicates: 0,
      conflicts: 0,
    });
  };
  const enriched = await enrichRecords(records, {
    demo: options.demo,
    now: options.now,
    timeoutMs: env.enrichmentTimeoutMs,
    trust: options.demo ? mockTrustProvider : trustProvider(),
    cache: options.demo ? undefined : enrichmentCache(),
    concurrency: env.enrichmentConcurrency,
    onStage: progress,
    providers: options.demo
      ? undefined
      : {
          tavily: (entity, signal) => tavilyCandidates(entity, bounded(8_000, signal)),
          ...(env.githubEnabled ? { github: (entity: IdentityEntity, signal: AbortSignal) => githubCandidates(entity, bounded(6_000, signal)) } : {}),
          ...(env.hunterEnabled ? { hunter: (entity: IdentityEntity, signal: AbortSignal) => lookupHunter(entity, bounded(14_000, signal)) } : {}),
          ...(env.pdlEnabled ? { pdl: (entity: IdentityEntity, signal: AbortSignal) => pdlCandidates(entity, bounded(6_000, signal)) } : {}),
          ...(env.apolloEnabled ? { apollo: (entity: IdentityEntity, signal: AbortSignal) => apolloCandidates(entity, bounded(6_000, signal)) } : {}),
        },
  });
  if (options.demo || !options.describeField) return enriched;
  try {
    return await describeMissing(enriched, options.describeField, 25_000);
  } catch (error) {
    console.log("[enrich] describe step skipped:", error instanceof Error ? error.message : error);
    return enriched;
  }
}
