import type { CollectedRecord, ContactChannelStatus } from "../types.js";
import { applyChannelToFields, channel, emptyContactability, fieldForChannel, scoreContactability, type ChannelKey } from "./contactability.js";
import { cleanPersonName, isPatternGuess, literalOnPage, matchIdentity, type IdentityEntity, type IdentityProfile } from "./identity.js";
import { evaluateTrustMany, mockTrustProvider, type TrustInput, type TrustProvider } from "./trust.js";

export type EnrichProviderName = "tavily" | "github" | "hunter" | "pdl" | "apollo";

export interface ProviderCandidate {
  provider: EnrichProviderName;
  channel: ChannelKey;
  value: string;
  sourceUrl: string | null;
  /** Page text when the provider returned one. An email with text is kept only if the value is on that text. */
  pageText: string | null;
  confidence: number;
  verificationStatus: string | null;
  /** Hunter-style source URIs. An email with none of these, and no page text, is treated as a guess. */
  sources: string[];
  profile: IdentityProfile;
}

export interface EnrichProviders {
  tavily?: (entity: IdentityEntity, signal: AbortSignal) => Promise<ProviderCandidate[]>;
  github?: (entity: IdentityEntity, signal: AbortSignal) => Promise<ProviderCandidate[]>;
  hunter?: (entity: IdentityEntity, signal: AbortSignal) => Promise<ProviderCandidate[]>;
  pdl?: (entity: IdentityEntity, signal: AbortSignal) => Promise<ProviderCandidate[]>;
  apollo?: (entity: IdentityEntity, signal: AbortSignal) => Promise<ProviderCandidate[]>;
}

export interface EnrichCache {
  get(key: string): ProviderCandidate[] | null;
  set(key: string, value: ProviderCandidate[]): void;
}

export interface EnrichOptions {
  demo?: boolean;
  now: string;
  timeoutMs: number;
  trust?: TrustProvider;
  providers?: EnrichProviders;
  cache?: EnrichCache;
  evidenceConfidence?: (record: CollectedRecord) => number;
  /** How many entities, and how many calls per provider, may be in flight together. */
  concurrency?: Partial<Record<EnrichProviderName | "entities", number>>;
  onStage?: (stage: "ENRICHING" | "IDENTITY_RESOLUTION" | "TRUST_EVALUATION") => void;
}

const RANK: Record<ContactChannelStatus, number> = {
  VERIFIED: 6,
  IDENTITY_MATCHED: 5,
  PROVIDER_MATCHED: 4,
  LIKELY: 3,
  NEEDS_REVIEW: 2,
  NOT_FOUND: 1,
};

export function entityOf(record: CollectedRecord): IdentityEntity {
  const fields = record.fields;
  const person = fields.person_name || fields.contact || "";
  return {
    name: person ? cleanPersonName(person) : fields.company_name || "",
    company: fields.company_name || fields.affiliation || "",
    location: fields.location || "",
    website: fields.website || "",
    email: fields.email || "",
    kind: person ? "person" : "company",
  };
}

/** Bump when lookups change, so results cached under the old rules (including empty ones) are not reused. */
const LOOKUP_VERSION = "v2";

function groundedChannels(record: CollectedRecord, now: string) {
  const book = emptyContactability(now);
  const source = record.sources[0];
  const take = (key: ChannelKey, field: string, status: ContactChannelStatus) => {
    const value = record.fields[field];
    if (!value) return;
    book.channels[key] = channel({
      value,
      status,
      confidence: status === "VERIFIED" ? 0.95 : 0.8,
      provider: "research",
      sourceUrl: source?.url ?? null,
      fetchedAt: now,
      verificationStatus: "grounded",
      matchingEvidence: "Already on the research record from a quoted page.",
    });
  };
  take("email", "email", "VERIFIED");
  take("phone", "phone", "VERIFIED");
  take("website", "website", "VERIFIED");
  take("linkedin", "linkedin", "VERIFIED");
  take("github", "github", "VERIFIED");
  return book;
}

function decideCandidate(entity: IdentityEntity, candidate: ProviderCandidate, now: string) {
  if (candidate.channel === "email") {
    const pageText = candidate.pageText;
    const onPage = Boolean(pageText && literalOnPage(candidate.value, pageText));
    const hasSource = candidate.sources.length > 0 || onPage;
    if (!hasSource) return null;
    if (isPatternGuess(candidate.value, entity.name) && candidate.sources.length === 0 && !onPage) return null;
    if (pageText && !onPage) return null;
    if (onPage && pageText && entity.name && !literalOnPage(entity.name, pageText) && !literalOnPage(entity.company, pageText)) return null;
  }
  if ((candidate.channel === "linkedin" || candidate.channel === "github" || candidate.channel === "contactPage") && candidate.pageText) {
    if (!literalOnPage(entity.name, candidate.pageText) && !literalOnPage(candidate.value, candidate.pageText)) return null;
  }
  const profilePath = candidate.channel === "linkedin" || candidate.channel === "github";
  const quoted = Boolean(candidate.provider === "tavily" && candidate.pageText && literalOnPage(candidate.value, candidate.pageText));
  const fit = quoted && !profilePath
    ? "accept"
    : matchIdentity(entity, candidate.profile.name ? candidate.profile : { ...candidate.profile, name: entity.name });
  if (fit === "reject") return null;
  const verified = candidate.channel === "email" && (candidate.verificationStatus === "valid" || candidate.verificationStatus === "grounded" || quoted);
  const status: ContactChannelStatus = fit === "review" ? "NEEDS_REVIEW" : verified ? "VERIFIED" : profilePath ? "IDENTITY_MATCHED" : "PROVIDER_MATCHED";
  return channel({
    value: candidate.value,
    status,
    confidence: fit === "review" ? Math.min(candidate.confidence, 0.6) : candidate.confidence,
    provider: candidate.provider,
    sourceUrl: candidate.sourceUrl ?? candidate.sources[0] ?? null,
    fetchedAt: now,
    verificationStatus: candidate.verificationStatus,
    matchingEvidence: fit === "review" ? "Name matches, but company, location, and site do not confirm it." : "Identity signals agree, and the value was returned by the provider.",
    sourceType: candidate.provider === "tavily" && quoted ? "secondary" : "provider_enrichment",
  });
}

function semaphore(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

async function runProvider(
  name: EnrichProviderName,
  entity: IdentityEntity,
  fn: ((entity: IdentityEntity, signal: AbortSignal) => Promise<ProviderCandidate[]>) | undefined,
  signal: AbortSignal,
  cache: EnrichCache | undefined,
): Promise<ProviderCandidate[]> {
  if (!fn) return [];
  const key = [name, entity.name, entity.company, entity.website, entity.email ?? "", LOOKUP_VERSION].join(":").toLowerCase();
  const cached = cache?.get(key);
  if (cached) return cached;
  try {
    const found = await fn(entity, signal);
    cache?.set(key, found);
    return found;
  } catch {
    return [];
  }
}

export async function enrichRecords<T extends CollectedRecord>(records: T[], options: EnrichOptions): Promise<T[]> {
  const trust = options.trust ?? mockTrustProvider;
  const seen = new Set<string>();
  const prepared = new Map<string, { record: T; trustInput: TrustInput }>();

  const work = records.filter((record) => {
    if (seen.has(record.canonicalEntityId)) return false;
    seen.add(record.canonicalEntityId);
    return true;
  });

  options.onStage?.("ENRICHING");
  const deadline = Date.now() + options.timeoutMs;
  const signal = AbortSignal.timeout(Math.max(1, options.timeoutMs));
  const names: EnrichProviderName[] = ["tavily", "github", "hunter", "pdl", "apollo"];
  const gates = Object.fromEntries(names.map((name) => [name, semaphore(options.concurrency?.[name] ?? 6)])) as Record<
    EnrichProviderName,
    ReturnType<typeof semaphore>
  >;
  const entities = semaphore(options.concurrency?.entities ?? 8);

  await Promise.all(
    work.map((record) =>
      entities(async () => {
        const entity = entityOf(record);
        let book = groundedChannels(record, options.now);
        const stillTime = Date.now() <= deadline;
        if (!options.demo && options.providers && stillTime) {
          options.onStage?.("IDENTITY_RESOLUTION");
          const settled = await Promise.allSettled(
            names.map((name) => gates[name](() => runProvider(name, entity, options.providers?.[name], signal, options.cache))),
          );
          for (const outcome of settled) {
            const list = outcome.status === "fulfilled" ? outcome.value : [];
            for (const candidate of list) {
              const next = decideCandidate(entity, candidate, options.now);
              if (!next) continue;
              const current = book.channels[candidate.channel];
              if (RANK[next.status] > RANK[current.status]) book.channels[candidate.channel] = next;
            }
          }
        }
        book = scoreContactability(book);
        let fields = record.fields;
        for (const key of Object.keys(book.channels) as ChannelKey[]) {
          fields = applyChannelToFields(fields, key, book.channels[key]);
        }
        const evidenceConfidence = options.evidenceConfidence?.(record) ?? (record.sources.length > 0 ? 0.8 : 0.4);
        const identityConfidence = book.channels.github.status === "IDENTITY_MATCHED" || book.channels.linkedin.status === "IDENTITY_MATCHED" ? 0.9 : entity.name ? 0.7 : 0.4;
        prepared.set(record.canonicalEntityId, {
          record: { ...record, fields, contactability: book },
          trustInput: { identityConfidence, evidenceConfidence, contactability: book, timestamp: options.now },
        });
      }),
    ),
  );

  options.onStage?.("TRUST_EVALUATION");
  const ordered = work.map((record) => prepared.get(record.canonicalEntityId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const decisions = await evaluateTrustMany(
    trust,
    ordered.map((item) => item.trustInput),
  );
  const byId = new Map<string, T>();
  ordered.forEach((item, index) => {
    const decision = decisions[index];
    if (!decision) return;
    byId.set(item.record.canonicalEntityId, { ...item.record, trust: decision });
  });

  return records.map((record) => byId.get(record.canonicalEntityId) ?? record);
}

export function acceptedFieldNames(): string[] {
  return (["email", "phone", "linkedin", "github", "website", "contactPage"] as ChannelKey[]).map(fieldForChannel);
}
