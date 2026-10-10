import { literalOnPage, organizationHint, type IdentityEntity } from "./identity.js";
import type { ProviderCandidate } from "./orchestrator.js";

/** One web search result: the page address, its title, and the snippet text. */
export interface SearchHit {
  url: string;
  title: string;
  content: string;
}

const LINKEDIN_PERSON = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/gi;
const LINKEDIN_COMPANY = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/company\/[A-Za-z0-9\-_%]+/gi;
const GITHUB_USER = /https?:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?![A-Za-z0-9/-])/gi;
const GITHUB_RESERVED = new Set([
  "about", "apps", "collections", "customer-stories", "enterprise", "events", "explore", "features", "login",
  "marketplace", "orgs", "pricing", "readme", "search", "security", "settings", "site", "sponsors", "topics", "trending",
]);

/** The organization to look for on a page: pulled out of a person's affiliation, a company's own name as is. */
export function entityOrganization(entity: IdentityEntity): string {
  return entity.kind === "company" ? entity.company.trim() : organizationHint(entity.company);
}

function slugOf(url: string): string {
  return (url.replace(/\/+$/, "").split("/").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** linkedin.com/in/alex-kuefler-12ab fits "Alex Kuefler": some part of the name is in the address. */
export function slugFitsName(url: string, name: string): boolean {
  const slug = slugOf(url);
  if (!slug) return false;
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3)
    .some((part) => slug.includes(part));
}

/**
 * LinkedIn and GitHub profile links for one person or company, from search results.
 * A result that is itself the profile page counts when the name is on it. A link that only
 * appears inside a page's text (a judges list, say) must also carry part of the name in its
 * address, so one person's link is never handed to someone else on the same page.
 */
export function profileLinkCandidates(entity: IdentityEntity, hits: SearchHit[]): ProviderCandidate[] {
  const person = entity.kind !== "company";
  const org = entityOrganization(entity);
  const found: ProviderCandidate[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const text = `${hit.title}\n${hit.content}`;
    const nameOnPage = Boolean(entity.name) && literalOnPage(entity.name, text);
    const orgOnPage = Boolean(org) && literalOnPage(org, text);
    if (!nameOnPage && !orgOnPage) continue;
    const pageText = `${hit.url}\n${text}`;
    const profile = { name: entity.name, company: orgOnPage ? org : "", location: "", website: "" };

    const add = (channel: "linkedin" | "github", raw: string, isResultPage: boolean) => {
      const value = raw.replace(/\/+$/, "");
      if (channel === "github" && GITHUB_RESERVED.has(slugOf(value))) return;
      if (!(isResultPage && nameOnPage) && !slugFitsName(value, entity.name)) return;
      const key = `${channel}:${value.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        provider: "tavily",
        channel,
        value,
        sourceUrl: hit.url,
        pageText,
        confidence: orgOnPage ? 0.86 : 0.55,
        verificationStatus: null,
        sources: [hit.url],
        profile,
      });
    };

    const linkedin = person ? LINKEDIN_PERSON : LINKEDIN_COMPANY;
    for (const value of hit.url.match(linkedin) ?? []) add("linkedin", value, true);
    for (const value of text.match(linkedin) ?? []) add("linkedin", value, false);
    if (person) {
      for (const value of hit.url.match(GITHUB_USER) ?? []) add("github", value, true);
      for (const value of text.match(GITHUB_USER) ?? []) add("github", value, false);
    }
  }
  return found;
}
