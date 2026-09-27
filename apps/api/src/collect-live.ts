import { PipelineError, domainOf, intentDefinition, slug, normalizeDate } from "@dig/core";
import type { CollectedRecord, ProvenanceSource } from "@dig/core";
import type { CollectionBlueprint } from "@dig/schemas";
import { env } from "./env.js";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

/**
 * One search call. Dig's live path is deliberately a single Tavily
 * request per run — enough coverage for a collection job without the
 * cost or latency of fanning out a query per entity.
 */
async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.tavilyKey,
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!response.ok) {
    throw new PipelineError("SOURCE_UNAVAILABLE", `Tavily search failed (${response.status}).`, response.status >= 500);
  }
  const body = (await response.json()) as TavilyResponse;
  return body.results ?? [];
}

interface ExtractedRecord {
  sourceIndex: number;
  fields: Record<string, string>;
}

interface ExtractionResponse {
  records?: ExtractedRecord[];
}

/**
 * One LLM call. It reads every search result at once and returns
 * structured fields per record, each tagged with which result it came
 * from. Grounding is enforced afterwards, not trusted from the model:
 * a field value only survives if it is an exact substring of that
 * result's own text (see groundedFieldNames below).
 */
async function extractRecords(
  blueprint: CollectionBlueprint,
  results: TavilyResult[],
): Promise<ExtractedRecord[]> {
  if (env.llmProvider !== "openai" || !env.llmKey) {
    throw new PipelineError(
      "LLM_UNAVAILABLE",
      "Live collection needs LLM_PROVIDER=openai and LLM_API_KEY set in .env to extract structured records from search results.",
    );
  }
  const definition = intentDefinition(blueprint.intent);
  const catalog = results
    .map((result, index) => {
      const published = result.published_date ? ` | published ${result.published_date}` : "";
      const content = result.content.slice(0, 700);
      return `[${index}] ${result.title}\nURL: ${result.url}${published}\n${content}`;
    })
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.llmKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.llmModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract structured business records from web search results. " +
            "Only use facts that literally appear in the given content — copy values verbatim, " +
            "never paraphrase, infer, or fill in a value that is not written in the text. " +
            "If a field is not stated in any result, leave it out entirely. " +
            "Skip a result if it does not name a real, identifiable entity for this request. " +
            `Return strict JSON: {"records":[{"sourceIndex": <index of the result it came from>, "fields": {<only these keys: ${definition.fields.join(", ")}>}}]}.`,
        },
        {
          role: "user",
          content: `Request: "${blueprint.query}"\nIntent: ${blueprint.intent} — ${definition.description}\nIdentity fields required: ${definition.identityFields.join(", ")}\n\nSearch results:\n\n${catalog}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new PipelineError("LLM_UNAVAILABLE", `Extraction call failed (${response.status}).`, response.status >= 500);
  }
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as ExtractionResponse;
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

const EXEMPT_FROM_GROUNDING = new Set(["website", "last_verified", "source_url"]);
const IDENTITY_PRIORITY = ["company_name", "event_name", "program_name", "product_name", "segment"];

function groundedFields(fields: Record<string, string>, content: string): { fields: Record<string, string>; fieldNames: string[] } {
  const haystack = content.toLowerCase();
  const kept: Record<string, string> = {};
  const fieldNames: string[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    if (EXEMPT_FROM_GROUNDING.has(key) || haystack.includes(value.toLowerCase())) {
      kept[key] = value;
      fieldNames.push(key);
    }
  }
  return { fields: kept, fieldNames };
}

function authorityFor(url: string, fields: Record<string, string>): ProvenanceSource["authority"] {
  const domain = domainOf(url);
  const nameSlug = slug(fields.company_name || fields.vendor || fields.organization || "");
  if (nameSlug && domain.replace(/\./g, "").includes(nameSlug.replace(/-/g, ""))) return "official";
  if (/\.(gov|edu)$/.test(domain)) return "official";
  if (/news|times|tribune|herald|express|economictimes|business-standard/.test(domain)) return "press";
  return "secondary";
}

function entityLabel(fields: Record<string, string>): string | null {
  for (const key of IDENTITY_PRIORITY) {
    if (fields[key]?.trim()) return fields[key].trim();
  }
  return null;
}

/**
 * Live collection: one search call, one extraction call, then the same
 * strict grounding rule the rest of the pipeline already assumes —
 * every field a record carries must be traceable, verbatim, to the
 * excerpt attached as its evidence. Returns the same CollectedRecord[]
 * shape collectDemo produces, so normalize/dedupe/validate/rank/diff
 * and Jev don't need to know collection was real this time.
 */
export async function collectLive(blueprint: CollectionBlueprint, collectedAt: string): Promise<CollectedRecord[]> {
  if (!env.tavilyKey) {
    throw new PipelineError("SOURCE_UNAVAILABLE", "Live collection needs TAVILY_API_KEY set in .env.");
  }
  const results = await tavilySearch(blueprint.query);
  if (results.length === 0) {
    throw new PipelineError("SOURCE_UNAVAILABLE", "The search returned no results for this query.", true);
  }
  const extracted = await extractRecords(blueprint, results);

  const records: CollectedRecord[] = [];
  const seen = new Set<string>();
  for (const item of extracted) {
    const source = results[item.sourceIndex];
    if (!source) continue;
    const withUrl: Record<string, string> = { ...item.fields, source_url: source.url };
    if (!withUrl.last_verified) {
      withUrl.last_verified = source.published_date ? normalizeDate(source.published_date) : collectedAt.slice(0, 10);
    }
    const { fields, fieldNames } = groundedFields(withUrl, source.content);
    const label = entityLabel(fields);
    if (!label || fieldNames.length === 0) continue;

    const canonicalEntityId = slug(label);
    if (seen.has(canonicalEntityId)) continue;
    seen.add(canonicalEntityId);

    const provenance: ProvenanceSource = {
      url: source.url,
      title: source.title,
      domain: domainOf(source.url),
      publishedAt: fields.last_verified,
      sourceType: "web_search",
      authority: authorityFor(source.url, fields),
      excerpt: source.content.slice(0, 500),
      fieldNames,
      extractionMethod: "tavily+llm",
      demo: false,
    };

    records.push({ canonicalEntityId, fields, sources: [provenance] });
  }
  return records;
}
