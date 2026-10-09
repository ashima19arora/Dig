import { similarity } from "../normalize.js";
import { domainOf } from "../util.js";

export interface IdentityEntity {
  name: string;
  company: string;
  location: string;
  website: string;
  /** Set when research already grounded an email. Hunter must not spend a credit on it. */
  email?: string;
}

export interface IdentityProfile {
  name: string;
  company: string;
  location: string;
  website: string;
}

export type IdentityFit = "accept" | "review" | "reject";

function compact(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|pvt|corp|co|company)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function related(left: string, right: string): boolean {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return similarity(a, b) >= 0.86;
}

/**
 * A same display name is not enough. Two people named Alex Kim at different companies are rejected.
 * A strong name with no company, location, or site to confirm stays in review.
 */
export function matchIdentity(entity: IdentityEntity, profile: IdentityProfile): IdentityFit {
  const nameScore = similarity(entity.name, profile.name);
  const nameOk = nameScore >= 0.9 || related(entity.name, profile.name);
  if (!entity.name.trim() || !profile.name.trim() || nameScore < 0.72) return "reject";

  const companyKnown = Boolean(compact(entity.company) && compact(profile.company));
  const companyOk = related(entity.company, profile.company);
  if (companyKnown && !companyOk) return "reject";

  const locationOk = related(entity.location, profile.location);
  const siteOk = Boolean(entity.website && profile.website && domainOf(entity.website) === domainOf(profile.website));
  const corroborated = companyOk || locationOk || siteOk;

  if (nameOk && corroborated) return "accept";
  if (nameOk && !companyKnown && !compact(profile.company) && !compact(profile.location)) return "review";
  if (nameScore >= 0.9 && !corroborated) return "review";
  return "reject";
}

/** True only when the value is literally on the page. This is the same rule as collection grounding. */
export function literalOnPage(value: string, pageText: string): boolean {
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  return pageText.toLowerCase().includes(needle);
}

/**
 * A local-part built from the person's name (jane.doe@, jdoe@) with no page behind it is a guess.
 * A provider result that includes a real source URL is not a guess, even if the shape looks similar.
 */
export function isPatternGuess(email: string, personName: string): boolean {
  const local = (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const parts = personName.toLowerCase().split(/[^a-z]+/).filter((part) => part.length > 1);
  if (!local || parts.length < 2) return false;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const patterns = new Set([
    `${first}${last}`,
    `${first[0] ?? ""}${last}`,
    `${first}`,
    `${last}`,
    `${first}${last[0] ?? ""}`,
  ]);
  return patterns.has(local);
}
