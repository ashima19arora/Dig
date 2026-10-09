import type { IdentityEntity } from "./identity.js";

/**
 * Which Hunter call, if any, is worth a credit.
 * Discover, the verifier, and company/person/combined enrichment are never selected:
 * each spends another credit and does not add a sourced address Dig is allowed to keep.
 */
export type HunterPlan =
  | { action: "skip"; reason: "has-email" | "webmail" | "no-target" }
  | { action: "person"; domain: string; first: string; last: string; company: string }
  | { action: "company"; domain: string; company: string };

const WEBMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "outlook.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "msn.com",
  "gmx.com",
  "mail.com",
  "zoho.com",
]);

/** Hosts that are not a company's own domain. Searching them returns the platform's staff. */
const DIRECTORY = new Set([
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "github.com",
  "youtube.com",
  "youtu.be",
  "linktr.ee",
  "t.me",
  "medium.com",
  "wikipedia.org",
  "google.com",
  "bit.ly",
]);

const TITLE = new Set(["dr", "mr", "mrs", "ms", "prof", "sir", "jr", "sr", "phd"]);
const ORG = new Set(["inc", "llc", "ltd", "pvt", "corp", "co", "company", "limited", "gmbh", "plc", "llp", "lp"]);
const STOP = new Set(["the", "and", "of", "at", "for"]);

export interface HunterEmailHit {
  value?: string | null;
  confidence?: number | null;
  score?: number | null;
  verification?: { status?: string | null } | null;
  sources?: Array<{ uri?: string | null }> | null;
}

export interface SourcedHunterEmail {
  value: string;
  sources: string[];
  status: string | null;
  confidence: number;
}

/** A company domain Dig may search. Webmail and social hosts are refused. */
export function acceptedHunterDomain(value: string): string {
  const host = hunterHost(value);
  if (!host || blockedHost(host)) return "";
  return host;
}

export function hunterHost(website: string): string {
  const raw = website.trim();
  if (!raw) return "";
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

export function planHunterLookup(entity: Pick<IdentityEntity, "name" | "company" | "website"> & { email?: string }): HunterPlan {
  if (entity.email?.trim()) return { action: "skip", reason: "has-email" };
  const host = hunterHost(entity.website);
  const blocked = host ? blockedHost(host) : null;
  const domain = host && !blocked ? host : "";
  const company = cleanCompany(entity.company);
  const person = personName(entity.name, company);
  if (person && (domain || company.length >= 3)) {
    return { action: "person", domain, first: person.first, last: person.last, company };
  }
  const named = company || cleanCompany(entity.name);
  if (!person && (domain || named.length >= 3)) {
    return { action: "company", domain, company: named };
  }
  if (blocked === "webmail") return { action: "skip", reason: "webmail" };
  return { action: "skip", reason: "no-target" };
}

/** Keeps one address that has a public source URL. Unsourced rows are guesses and are dropped. */
export function bestSourcedEmail(rows: HunterEmailHit[]): SourcedHunterEmail | null {
  let best: SourcedHunterEmail | null = null;
  for (const row of rows) {
    const next = sourcedEmail(row);
    if (!next) continue;
    if (!best || rank(next) > rank(best)) best = next;
  }
  return best;
}

export function hunterLinkedin(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (url.protocol !== "https:" || host !== "linkedin.com" || !url.pathname.startsWith("/in/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sourcedEmail(row: HunterEmailHit): SourcedHunterEmail | null {
  const value = row.value?.trim() ?? "";
  if (!value.includes("@")) return null;
  const sources = (row.sources ?? [])
    .map((source) => source?.uri?.trim() ?? "")
    .filter((uri) => /^https?:\/\//i.test(uri));
  if (sources.length === 0) return null;
  const status = row.verification?.status?.trim() || null;
  const raw = typeof row.confidence === "number" ? row.confidence : typeof row.score === "number" ? row.score : 0;
  const scaled = raw > 1 ? raw / 100 : raw;
  const confidence = status === "valid"
    ? Math.min(0.95, Math.max(0.9, scaled))
    : Math.min(0.75, Math.max(0.5, scaled || 0.6));
  return { value, sources, status, confidence };
}

function rank(email: SourcedHunterEmail): number {
  return (email.status === "valid" ? 2 : 0) + email.confidence;
}

function blockedHost(host: string): "webmail" | "directory" | null {
  if (WEBMAIL.has(host) || [...WEBMAIL].some((item) => host.endsWith(`.${item}`))) return "webmail";
  if ([...DIRECTORY].some((item) => host === item || host.endsWith(`.${item}`))) return "directory";
  return null;
}

function cleanCompany(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

function compact(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|pvt|corp|co|company|limited|gmbh|plc)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function personName(name: string, company: string): { first: string; last: string } | null {
  const head = name.split(/[,|/]/)[0] ?? "";
  const tokens = head
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z]/g, ""))
    .filter((token) => token.length >= 2);
  if (tokens.some((token) => ORG.has(token.toLowerCase()))) return null;
  const parts = tokens.filter((token) => !TITLE.has(token.toLowerCase()) && !STOP.has(token.toLowerCase()));
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last || parts.length < 2) return null;
  if (compact(name) && compact(name) === compact(company)) return null;
  if (compact(`${first} ${last}`) === compact(company)) return null;
  return { first, last };
}
