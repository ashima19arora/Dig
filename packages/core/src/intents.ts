import type { IntentId } from "@dig/schemas";

export interface IntentDefinition {
  id: IntentId;
  description: string;
  primaryField: string;
  identityFields: string[];
  protectedFields: string[];
  requiredFields: string[];
  optionalFields: string[];
  fields: string[];
  supportedSources: string[];
  rankingStrategy: string;
  collectionStrategy: string;
  keywords: Array<{ phrase: string; weight: number }>;
}

const sponsorFields = [
  "company_name",
  "event_name",
  "sponsorship_type",
  "website",
  "contact",
  "email",
  "phone",
  "last_verified",
  "source_url",
];

export const INTENTS: Record<IntentId, IntentDefinition> = {
  SPONSOR_LOOKUP: {
    id: "SPONSOR_LOOKUP",
    description: "Organizations actively sponsoring events, with evidence of the sponsorship.",
    primaryField: "company_name",
    identityFields: ["company_name", "event_name"],
    protectedFields: ["contact", "email", "sponsorship_type"],
    requiredFields: ["company_name", "event_name", "source_url"],
    optionalFields: ["sponsorship_type", "website", "contact", "email", "phone", "last_verified"],
    fields: sponsorFields,
    supportedSources: ["search", "event_pages", "company_pages", "press_releases"],
    rankingStrategy: "activity",
    collectionStrategy: "event_and_company_pages",
    keywords: [
      { phrase: "sponsors", weight: 8 },
      { phrase: "sponsor", weight: 8 },
      { phrase: "sponsorship", weight: 8 },
      { phrase: "event partner", weight: 5 },
    ],
  },
  JOB_LOOKUP: {
    id: "JOB_LOOKUP",
    description: "Open roles at named employers, with a source for each posting.",
    primaryField: "company_name",
    identityFields: ["company_name", "role_title"],
    protectedFields: ["role_title", "location"],
    requiredFields: ["company_name", "role_title", "source_url"],
    optionalFields: ["location", "workplace", "website", "last_verified"],
    fields: ["company_name", "role_title", "location", "workplace", "website", "last_verified", "source_url"],
    supportedSources: ["search", "careers_pages", "company_pages"],
    rankingStrategy: "freshness",
    collectionStrategy: "careers_pages",
    keywords: [
      { phrase: "job opening", weight: 8 },
      { phrase: "job openings", weight: 8 },
      { phrase: "hiring", weight: 6 },
      { phrase: "jobs", weight: 5 },
      { phrase: "role", weight: 2 },
    ],
  },
  LEAD_LOOKUP: {
    id: "LEAD_LOOKUP",
    description: "Named accounts and public contact points for outbound research.",
    primaryField: "company_name",
    identityFields: ["company_name"],
    protectedFields: ["contact", "email"],
    requiredFields: ["company_name", "source_url"],
    optionalFields: ["contact", "email", "website", "last_verified"],
    fields: ["company_name", "contact", "email", "website", "last_verified", "source_url"],
    supportedSources: ["search", "company_pages", "press_releases"],
    rankingStrategy: "corroboration",
    collectionStrategy: "company_pages",
    keywords: [
      { phrase: "sales lead", weight: 8 },
      { phrase: "leads", weight: 6 },
      { phrase: "prospects", weight: 6 },
    ],
  },
  EVENT_LOOKUP: {
    id: "EVENT_LOOKUP",
    description: "Upcoming or recent events with organizer, place, and date.",
    primaryField: "event_name",
    identityFields: ["event_name"],
    protectedFields: ["start_date", "organizer"],
    requiredFields: ["event_name", "source_url"],
    optionalFields: ["organizer", "location", "start_date", "website"],
    fields: ["event_name", "organizer", "location", "start_date", "website", "source_url"],
    supportedSources: ["search", "event_pages", "rss"],
    rankingStrategy: "freshness",
    collectionStrategy: "event_pages",
    keywords: [
      { phrase: "events", weight: 5 },
      { phrase: "conferences", weight: 6 },
      { phrase: "conference", weight: 5 },
      { phrase: "summit", weight: 4 },
    ],
  },
  COMPANY_LOOKUP: {
    id: "COMPANY_LOOKUP",
    description: "Company profiles with headquarters, industry, and a canonical site.",
    primaryField: "company_name",
    identityFields: ["company_name"],
    protectedFields: ["headquarters", "industry"],
    requiredFields: ["company_name", "source_url"],
    optionalFields: ["industry", "headquarters", "website"],
    fields: ["company_name", "industry", "headquarters", "website", "source_url"],
    supportedSources: ["search", "company_pages"],
    rankingStrategy: "source_authority",
    collectionStrategy: "company_pages",
    keywords: [
      { phrase: "company profile", weight: 7 },
      { phrase: "companies", weight: 4 },
      { phrase: "headquarters", weight: 3 },
    ],
  },
  COMPETITOR_LOOKUP: {
    id: "COMPETITOR_LOOKUP",
    description: "Competing products in a category, with a public pricing or packaging signal.",
    primaryField: "company_name",
    identityFields: ["company_name", "category"],
    protectedFields: ["pricing_signal", "category"],
    requiredFields: ["company_name", "source_url"],
    optionalFields: ["category", "pricing_signal", "website", "last_verified"],
    fields: ["company_name", "category", "pricing_signal", "website", "last_verified", "source_url"],
    supportedSources: ["search", "company_pages", "press_releases"],
    rankingStrategy: "corroboration",
    collectionStrategy: "company_pages",
    keywords: [
      { phrase: "competitor", weight: 8 },
      { phrase: "landscape", weight: 4 },
      { phrase: "alternatives", weight: 5 },
    ],
  },
  PRODUCT_LOOKUP: {
    id: "PRODUCT_LOOKUP",
    description: "Products in a category, tied to a vendor and a public page.",
    primaryField: "product_name",
    identityFields: ["product_name", "vendor"],
    protectedFields: ["vendor", "category"],
    requiredFields: ["product_name", "source_url"],
    optionalFields: ["vendor", "category", "website"],
    fields: ["product_name", "vendor", "category", "website", "source_url"],
    supportedSources: ["search", "company_pages"],
    rankingStrategy: "source_authority",
    collectionStrategy: "product_pages",
    keywords: [
      { phrase: "products", weight: 6 },
      { phrase: "product", weight: 4 },
    ],
  },
  MARKET_LOOKUP: {
    id: "MARKET_LOOKUP",
    description: "Market signals for a segment and region, each tied to a source.",
    primaryField: "segment",
    identityFields: ["segment", "region"],
    protectedFields: ["signal"],
    requiredFields: ["segment", "source_url"],
    optionalFields: ["region", "signal", "last_verified"],
    fields: ["segment", "region", "signal", "last_verified", "source_url"],
    supportedSources: ["search", "press_releases", "rss"],
    rankingStrategy: "freshness",
    collectionStrategy: "public_sources",
    keywords: [
      { phrase: "market", weight: 6 },
      { phrase: "landscape", weight: 2 },
      { phrase: "industry trend", weight: 5 },
    ],
  },
  FUNDING_LOOKUP: {
    id: "FUNDING_LOOKUP",
    description: "Funding programs and grants with an amount signal and a deadline when published.",
    primaryField: "program_name",
    identityFields: ["program_name", "organization"],
    protectedFields: ["amount", "deadline"],
    requiredFields: ["program_name", "source_url"],
    optionalFields: ["organization", "amount", "deadline", "website"],
    fields: ["program_name", "organization", "amount", "deadline", "website", "source_url"],
    supportedSources: ["search", "company_pages", "press_releases"],
    rankingStrategy: "freshness",
    collectionStrategy: "program_pages",
    keywords: [
      { phrase: "funding", weight: 8 },
      { phrase: "grant", weight: 6 },
      { phrase: "investment", weight: 3 },
    ],
  },
  VENDOR_LOOKUP: {
    id: "VENDOR_LOOKUP",
    description: "Vendors that sell a capability, with a public site and contact where available.",
    primaryField: "company_name",
    identityFields: ["company_name", "capability"],
    protectedFields: ["capability", "contact"],
    requiredFields: ["company_name", "source_url"],
    optionalFields: ["capability", "website", "contact", "last_verified"],
    fields: ["company_name", "capability", "website", "contact", "last_verified", "source_url"],
    supportedSources: ["search", "company_pages", "press_releases"],
    rankingStrategy: "activity",
    collectionStrategy: "company_pages",
    keywords: [
      { phrase: "vendors", weight: 8 },
      { phrase: "vendor", weight: 6 },
      { phrase: "suppliers", weight: 5 },
    ],
  },
};

export function intentDefinition(id: IntentId): IntentDefinition {
  return INTENTS[id];
}

export interface IntentMatch {
  intent: IntentId;
  confidence: number;
  method: "keyword";
  alternatives: Array<{ intent: IntentId; confidence: number }>;
}

export function matchIntent(query: string): IntentMatch {
  const text = query.toLowerCase();
  const scored = (Object.values(INTENTS) as IntentDefinition[]).map((intent) => {
    let score = 0;
    for (const keyword of intent.keywords) {
      const pattern = new RegExp(`\\b${keyword.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(text)) score += keyword.weight;
    }
    if (intent.id === "EVENT_LOOKUP" && /\bsponsor/.test(text)) score -= 4;
    if (intent.id === "MARKET_LOOKUP" && /\bcompetitor/.test(text)) score -= 3;
    if (intent.id === "PRODUCT_LOOKUP" && /\bvendor/.test(text)) score -= 3;
    return { intent: intent.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0] ?? { intent: "MARKET_LOOKUP" as IntentId, score: 0 };
  const alternatives = scored
    .filter((item) => item.intent !== top.intent && item.score > 0)
    .slice(0, 3)
    .map((item) => ({ intent: item.intent, confidence: roundConfidence(item.score / (item.score + 6)) }));
  return {
    intent: top.score > 0 ? top.intent : "MARKET_LOOKUP",
    confidence: top.score > 0 ? roundConfidence(Math.min(0.97, 0.45 + top.score / 16)) : 0.32,
    method: "keyword",
    alternatives,
  };
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
