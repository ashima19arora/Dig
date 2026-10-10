import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  acceptedHunterDomain,
  bestSourcedEmail,
  hunterLinkedin,
  planHunterLookup,
  rankedHunterContacts,
  type HunterContact,
  type HunterEmailHit,
  type HunterPlan,
  type IdentityEntity,
  type ProviderCandidate,
  type SourcedHunterEmail,
} from "@dig/core";
import { env } from "./env.js";

const DAY = 86_400_000;
const BASE = "https://api.hunter.io/v2";

/**
 * Free Hunter plan: 50 credits a month.
 * A named person uses Email Finder (Found): only an address seen on the web, and a miss is free.
 * A company uses one Domain Search, cached by domain. Domain Finder (free) runs only when
 * research has a company name and no website.
 * Discover, the verifier, and company/person/combined enrichment are not called.
 * The key is sent as X-API-KEY and never placed in the URL.
 */

class HunterUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "HunterUnavailable";
  }
}

interface CacheEntry<T> {
  at: number;
  ttl: number;
  value: T;
}

interface CacheFile {
  lookups?: Record<string, CacheEntry<ProviderCandidate[]>>;
  domains?: Record<string, CacheEntry<string>>;
  /** Everyone a domain search returned, best first, for "Find another contact". */
  contacts?: Record<string, CacheEntry<HunterContact[]>>;
}

const memory = new Map<string, ProviderCandidate[]>();
const domains = new Map<string, string>();
const inflight = new Map<string, Promise<ProviderCandidate[]>>();
const domainInflight = new Map<string, Promise<string>>();

const budget = {
  remaining: null as number | null,
  spent: 0,
  inFlight: 0,
  paused: false,
  cooldownUntil: 0,
};

/** Starts a fresh per-run allowance. The account balance is not reset. */
export function beginHunterRun(): void {
  budget.spent = 0;
}

let accountOnce: Promise<void> | null = null;

export async function lookupHunter(entity: IdentityEntity, signal: AbortSignal): Promise<ProviderCandidate[]> {
  if (!env.hunterEnabled || !env.hunterKey) return [];
  const plan = planHunterLookup(entity);
  if (plan.action === "skip") return [];
  const key = planKey(plan);
  const cached = recall(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = runPlan(plan, entity, signal).then((found) => {
    remember(key, found);
    return found;
  });
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

/** Free call. Used to confirm the key and to stop before the balance hits zero. */
export async function hunterAccountSummary(): Promise<{ plan: string | null; remaining: number | null }> {
  if (!env.hunterKey) return { plan: null, remaining: null };
  const response = await hunterGet("/account", {}, AbortSignal.timeout(8000));
  return readAccount(response.body);
}

async function runPlan(plan: Exclude<HunterPlan, { action: "skip" }>, entity: IdentityEntity, signal: AbortSignal): Promise<ProviderCandidate[]> {
  await ensureAccount();
  const domain = plan.domain || (plan.company.length >= 3 ? await resolveDomain(plan.company, signal) : "");
  if (!domain) return [];
  if (plan.action === "person") return findPerson(entity, domain, plan.first, plan.last, signal);
  return findCompany(entity, domain, signal);
}

async function findPerson(entity: IdentityEntity, domain: string, first: string, last: string, signal: AbortSignal): Promise<ProviderCandidate[]> {
  const paid = await paidCall(signal, async () => {
    const response = await hunterGet("/email-finder/found", {
      domain,
      first_name: first,
      last_name: last,
      max_duration: "6",
    }, signal);
    if (!response.ok) return { charged: false, candidates: [] as ProviderCandidate[] };
    const data = record(record(response.body)?.data);
    const email = typeof data?.email === "string" ? data.email : "";
    const hit: HunterEmailHit = {
      value: email,
      score: typeof data?.score === "number" ? data.score : null,
      verification: verificationOf(data?.verification),
      sources: Array.isArray(data?.sources) ? data.sources as HunterEmailHit["sources"] : [],
    };
    const sourced = email ? bestSourcedEmail([hit]) : null;
    const candidates = sourced ? [emailCandidate(entity, sourced)] : [];
    const linkedin = hunterLinkedin(data?.linkedin_url);
    if (linkedin && sourced) candidates.push(linkCandidate(entity, linkedin));
    return { charged: Boolean(email), candidates };
  });
  return paid;
}

async function findCompany(entity: IdentityEntity, domain: string, signal: AbortSignal): Promise<ProviderCandidate[]> {
  const executive = await domainSearch(entity, domain, { limit: "5", seniority: "executive", type: "personal" }, signal);
  if (executive.hit) return executive.candidates;
  const broader = await domainSearch(entity, domain, { limit: "5", type: "personal" }, signal);
  return broader.candidates;
}

async function domainSearch(
  entity: IdentityEntity,
  domain: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<{ hit: boolean; candidates: ProviderCandidate[] }> {
  let hit = false;
  const candidates = await paidCall(signal, async () => {
    const response = await hunterGet("/domain-search", { domain, ...params }, signal);
    if (!response.ok) return { charged: false, candidates: [] };
    const rows = emailRows(response.body);
    hit = rows.some((row) => Boolean(row.value?.trim()));
    const best = bestSourcedEmail(rows);
    const people = rankedHunterContacts(rows);
    if (people.length > 0) saveContacts(domain, people);
    return { charged: hit, candidates: best ? [emailCandidate(entity, best)] : [] };
  });
  return { hit, candidates };
}

async function paidCall(signal: AbortSignal, work: () => Promise<{ charged: boolean; candidates: ProviderCandidate[] }>): Promise<ProviderCandidate[]> {
  if (signal.aborted || budget.paused || Date.now() < budget.cooldownUntil) throw new HunterUnavailable("Hunter paused");
  if (!reserve()) throw new HunterUnavailable("Hunter credit cap");
  let charged = false;
  try {
    const result = await work();
    charged = result.charged;
    return result.candidates;
  } finally {
    settle(charged);
  }
}

async function resolveDomain(company: string, signal: AbortSignal): Promise<string> {
  const key = company.toLowerCase();
  const cached = domains.get(key) ?? recallDomain(key);
  if (cached !== null) return cached;
  const pending = domainInflight.get(key);
  if (pending) return pending;
  const run = (async () => {
    const response = await hunterGet("/domain-finder", {
      company: company.slice(0, 100),
      limit: "1",
      perfect_match: "true",
    }, signal);
    const domain = response.ok ? acceptedHunterDomain(domainFrom(response.body)) : "";
    saveDomain(key, domain);
    return domain;
  })();
  domainInflight.set(key, run);
  try {
    return await run;
  } finally {
    domainInflight.delete(key);
  }
}

async function ensureAccount(): Promise<void> {
  accountOnce ??= (async () => {
    try {
      const response = await hunterGet("/account", {}, AbortSignal.timeout(4000));
      const summary = readAccount(response.body);
      if (summary.remaining !== null) budget.remaining = summary.remaining;
    } catch (error) {
      if (budget.paused) throw error;
    }
  })();
  await accountOnce;
}

function reserve(): boolean {
  if (budget.paused || Date.now() < budget.cooldownUntil) return false;
  if (budget.remaining !== null && budget.remaining < 1) return false;
  if (env.hunterMaxCallsPerRun > 0 && budget.spent + budget.inFlight >= env.hunterMaxCallsPerRun) return false;
  budget.inFlight += 1;
  if (budget.remaining !== null) budget.remaining -= 1;
  return true;
}

function settle(charged: boolean): void {
  budget.inFlight = Math.max(0, budget.inFlight - 1);
  if (charged) budget.spent += 1;
  else if (budget.remaining !== null) budget.remaining += 1;
}

async function hunterGet(path: string, params: Record<string, string>, signal: AbortSignal): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "X-API-KEY": env.hunterKey },
    signal,
  });
  if (response.status === 401 || response.status === 429) {
    budget.paused = true;
    throw new HunterUnavailable(`Hunter ${response.status}`);
  }
  if (response.status === 403) {
    budget.cooldownUntil = Date.now() + 60_000;
    throw new HunterUnavailable("Hunter 403");
  }
  if (response.status === 400 || response.status === 404 || response.status === 422 || response.status === 451) {
    return { ok: false, status: response.status, body: null };
  }
  if (!response.ok) throw new HunterUnavailable(`Hunter ${response.status}`);
  return { ok: true, status: response.status, body: await response.json() };
}

function emailCandidate(entity: IdentityEntity, email: SourcedHunterEmail): ProviderCandidate {
  return {
    provider: "hunter",
    channel: "email",
    value: email.value,
    sourceUrl: email.sources[0] ?? null,
    pageText: null,
    confidence: email.confidence,
    verificationStatus: email.status,
    sources: email.sources,
    profile: {
      name: entity.name,
      company: entity.company,
      location: entity.location,
      website: entity.website,
    },
  };
}

function linkCandidate(entity: IdentityEntity, url: string): ProviderCandidate {
  return {
    provider: "hunter",
    channel: "linkedin",
    value: url,
    sourceUrl: url,
    pageText: null,
    confidence: 0.7,
    verificationStatus: null,
    sources: [url],
    profile: {
      name: entity.name,
      company: entity.company,
      location: entity.location,
      website: entity.website,
    },
  };
}

function emailRows(body: unknown): HunterEmailHit[] {
  const emails = record(record(body)?.data)?.emails;
  if (!Array.isArray(emails)) return [];
  return emails.filter((row): row is HunterEmailHit => Boolean(row) && typeof row === "object");
}

function domainFrom(body: unknown): string {
  const data = record(body)?.data;
  const row = Array.isArray(data) ? data[0] : data;
  const domain = record(row)?.domain;
  return typeof domain === "string" ? domain : "";
}

function verificationOf(value: unknown): HunterEmailHit["verification"] {
  const status = record(value)?.status;
  return typeof status === "string" ? { status } : null;
}

function readAccount(body: unknown): { plan: string | null; remaining: number | null } {
  const data = record(record(body)?.data);
  const requests = record(data?.requests);
  const raw = record(requests?.credits)?.remaining ?? record(requests?.searches)?.remaining;
  return {
    plan: typeof data?.plan_name === "string" ? data.plan_name : null,
    remaining: typeof raw === "number" ? raw : null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function planKey(plan: Exclude<HunterPlan, { action: "skip" }>): string {
  if (plan.action === "person") return `person:${plan.domain}:${plan.company}:${plan.first}:${plan.last}`.toLowerCase();
  return `company:${plan.domain}:${plan.company}`.toLowerCase();
}

function ttl(): number {
  return env.enrichmentCacheTtlMs > 0 ? env.enrichmentCacheTtlMs : 7 * DAY;
}

function cacheFile(): string {
  return path.join(env.cacheDir, "hunter.json");
}

function readFile(): CacheFile {
  try {
    return JSON.parse(readFileSync(cacheFile(), "utf8")) as CacheFile;
  } catch {
    return {};
  }
}

function writeFile(file: CacheFile): void {
  mkdirSync(env.cacheDir, { recursive: true });
  writeFileSync(cacheFile(), JSON.stringify(file));
}

function recall(key: string): ProviderCandidate[] | null {
  const hit = memory.get(key);
  if (hit) return hit;
  const entry = readFile().lookups?.[key];
  if (!entry || Date.now() - entry.at > entry.ttl || !Array.isArray(entry.value)) return null;
  memory.set(key, entry.value);
  return entry.value;
}

function remember(key: string, value: ProviderCandidate[]): void {
  memory.set(key, value);
  const file = readFile();
  file.lookups ??= {};
  file.lookups[key] = { at: Date.now(), ttl: ttl(), value };
  writeFile(file);
}

function recallDomain(key: string): string | null {
  const entry = readFile().domains?.[key];
  if (!entry || Date.now() - entry.at > entry.ttl || typeof entry.value !== "string") return null;
  domains.set(key, entry.value);
  return entry.value;
}

const CONTACTS_TTL = 30 * DAY;

/** Merge newly seen people into what this domain already has, keeping the best-first order. */
function saveContacts(domain: string, people: HunterContact[]): void {
  const file = readFile();
  file.contacts ??= {};
  const key = domain.toLowerCase();
  const known = file.contacts[key]?.value ?? [];
  const merged = [...known];
  for (const person of people) {
    if (!merged.some((item) => item.email.toLowerCase() === person.email.toLowerCase())) merged.push(person);
  }
  file.contacts[key] = { at: Date.now(), ttl: CONTACTS_TTL, value: merged };
  writeFile(file);
}

/** People Hunter already returned for this domain. Reading them costs nothing. */
export function savedHunterContacts(domain: string): HunterContact[] {
  const entry = readFile().contacts?.[domain.toLowerCase()];
  if (!entry || Date.now() - entry.at > entry.ttl || !Array.isArray(entry.value)) return [];
  return entry.value;
}

function saveDomain(key: string, value: string): void {
  domains.set(key, value);
  const file = readFile();
  file.domains ??= {};
  file.domains[key] = { at: Date.now(), ttl: ttl(), value };
  writeFile(file);
}
