import type { CollectionBlueprint, IntentId } from "@dig/schemas";
import { intentDefinition, matchIntent, type IntentMatch } from "./intents.js";

const PLACES: Array<[string, string]> = [
  ["delhi ncr", "Delhi NCR"],
  ["bengaluru", "Bengaluru"],
  ["bangalore", "Bangalore"],
  ["new delhi", "New Delhi"],
  ["hyderabad", "Hyderabad"],
  ["mumbai", "Mumbai"],
  ["chennai", "Chennai"],
  ["pune", "Pune"],
  ["delhi", "Delhi"],
  ["india", "India"],
  ["ncr", "NCR"],
];

export function extractLocation(query: string): string | null {
  const text = query.toLowerCase();
  const found = PLACES.find(([needle]) => text.includes(needle));
  return found ? found[1] : null;
}

export function extractCategory(query: string): string | null {
  const text = query.toLowerCase();
  if (text.includes("project management")) return "SaaS";
  if (text.includes("machine learning") || (/\bai\b/.test(text) && /\bml\b/.test(text))) return "AI/ML";
  if (text.includes("technology")) return "technology";
  if (text.includes("fintech")) return "fintech";
  if (/\bsaas\b/.test(text)) return "SaaS";
  if (text.includes("analytics")) return "analytics";
  if (/\bai\b/.test(text)) return "AI";
  if (text.includes("enterprise")) return "enterprise";
  return null;
}

export function suggestJobName(blueprint: CollectionBlueprint): string {
  const location = blueprint.entities.location;
  const category = blueprint.entities.category;
  const place = location ? ` — ${location}` : "";
  switch (blueprint.intent) {
    case "SPONSOR_LOOKUP": {
      const kind = /hackathon/i.test(blueprint.query) ? "Hackathon" : "Event";
      if (!category) return `${kind} Sponsors${place}`;
      return `${category === "technology" ? "Technology" : category} ${kind} Sponsors${place}`;
    }
    case "JOB_LOOKUP":
      return `${category ?? "Open"} Jobs${place}`;
    case "COMPETITOR_LOOKUP":
      return category === "SaaS" ? "SaaS Competitor Landscape" : `${category ?? "Market"} Competitor Landscape`;
    case "FUNDING_LOOKUP":
      return "Startup Funding Opportunities";
    case "VENDOR_LOOKUP":
      return /enterprise/i.test(blueprint.query) || category === "AI" ? "Enterprise AI Vendors" : `${category ?? "Enterprise"} Vendors`;
    case "LEAD_LOOKUP":
      return `Sales Leads${place}`;
    case "EVENT_LOOKUP":
      return `Technology Events${place}`;
    case "COMPANY_LOOKUP":
      return category === "SaaS" ? `SaaS Companies${place}` : `Companies${place}`;
    case "PRODUCT_LOOKUP":
      return /enterprise/i.test(blueprint.query) ? "Enterprise AI Products" : `${category ?? "Product"} Products`;
    case "MARKET_LOOKUP":
      return `${category ?? "Market"} Landscape${place}`;
    default:
      return "Collection";
  }
}

export function buildBlueprint(query: string, intentOverride?: IntentId): {
  blueprint: CollectionBlueprint;
  match: IntentMatch;
} {
  const match = matchIntent(query);
  const intent = intentOverride ?? match.intent;
  const definition = intentDefinition(intent);
  const freshnessRequired = /\b(active|current|open|upcoming)\b/i.test(query);
  const blueprint: CollectionBlueprint = {
    intent,
    query,
    entities: {
      category: extractCategory(query),
      location: extractLocation(query),
    },
    fields: definition.fields,
    freshness: {
      required: freshnessRequired,
      maxAgeDays: freshnessRequired ? 90 : 365,
    },
    sources: definition.supportedSources,
    ranking: { strategy: definition.rankingStrategy },
  };
  return { blueprint, match: intentOverride ? { ...match, intent } : match };
}

export function withLocation(blueprint: CollectionBlueprint, location: string): CollectionBlueprint {
  return {
    ...blueprint,
    entities: { ...blueprint.entities, location },
    query: blueprint.query.replace(blueprint.entities.location ?? "______", location),
  };
}
