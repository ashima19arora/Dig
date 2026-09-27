import type { CollectionBlueprint } from "@dig/schemas";
import { domainOf, slug } from "./util.js";
import type { CollectedRecord, ProvenanceSource } from "./types.js";

export const DEMO_NOW = new Date("2026-09-26T10:32:00.000Z");

const EVENTS: Array<[string, string]> = [
  ["India Mobile Congress 2026", "indiamobilecongress.com"],
  ["TechSparks Delhi 2026", "techsparks.com"],
  ["NASSCOM Technology Forum", "nasscom.in"],
  ["AWS Summit New Delhi", "aws.amazon.com"],
  ["TiECON Delhi 2026", "delhi.tie.org"],
  ["India AI Impact Summit", "indiaai.gov.in"],
  ["ET Soonicorns Summit", "economictimes.indiatimes.com"],
  ["Startup Mahakumbh", "startupmahakumbh.org"],
  ["Delhi Technology Week", "delhitechweek.in"],
  ["Google Cloud Delhi Connect", "cloud.google.com"],
];

const TYPES = ["Title", "Gold", "Silver", "Associate", "Innovation Partner"];

const FIRST = ["Aanya", "Kabir", "Meera", "Rohit", "Sana", "Vikram", "Leela", "Arjun", "Neha", "Imran", "Tara", "Dev"];
const LAST = ["Iyer", "Khan", "Gupta", "Nair", "Reddy", "Singh", "Bose", "Kapoor", "Jain", "Malhotra", "Chopra", "Bhatt"];

type Company = { id: string; name: string; domain: string };

const SPONSORS: Company[] = [
  ["snapdeal", "Snapdeal", "snapdeal.com"],
  ["hike", "Hike", "hike.in"],
  ["tcs", "Tata Consultancy Services", "tcs.com"],
  ["wipro", "Wipro", "wipro.com"],
  ["hcltech", "HCLTech", "hcltech.com"],
  ["techmahindra", "Tech Mahindra", "techmahindra.com"],
  ["accenture", "Accenture", "accenture.com"],
  ["deloitte", "Deloitte", "deloitte.com"],
  ["ibm", "IBM", "ibm.com"],
  ["oracle", "Oracle", "oracle.com"],
  ["microsoft", "Microsoft", "microsoft.com"],
  ["google", "Google", "google.com"],
  ["infosys", "Infosys", "infosys.com"],
  ["adobe", "Adobe", "adobe.com"],
  ["aws", "Amazon Web Services", "aws.amazon.com"],
  ["salesforce", "Salesforce", "salesforce.com"],
  ["nvidia", "NVIDIA", "nvidia.com"],
  ["intel", "Intel", "intel.com"],
  ["cisco", "Cisco", "cisco.com"],
  ["samsung", "Samsung", "samsung.com"],
  ["airtel", "Airtel", "airtel.in"],
  ["jio", "Jio", "jio.com"],
  ["razorpay", "Razorpay", "razorpay.com"],
  ["zoho", "Zoho", "zoho.com"],
  ["freshworks", "Freshworks", "freshworks.com"],
  ["postman", "Postman", "postman.com"],
  ["atlassian", "Atlassian", "atlassian.com"],
  ["phonepe", "PhonePe", "phonepe.com"],
  ["paytm", "Paytm", "paytm.com"],
  ["flipkart", "Flipkart", "flipkart.com"],
  ["zomato", "Zomato", "zomato.com"],
  ["swiggy", "Swiggy", "swiggy.com"],
  ["ola", "Ola", "ola.com"],
  ["ericsson", "Ericsson", "ericsson.com"],
  ["nokia", "Nokia", "nokia.com"],
  ["dell", "Dell Technologies", "dell.com"],
  ["hp", "HP", "hp.com"],
  ["servicenow", "ServiceNow", "servicenow.com"],
  ["snowflake", "Snowflake", "snowflake.com"],
  ["databricks", "Databricks", "databricks.com"],
].map(([id, name, domain]) => ({ id, name, domain }));

const REMOVED = new Set(["snapdeal", "hike"]);
const SOFT = new Set(["tcs", "wipro", "hcltech", "techmahindra", "accenture", "deloitte", "ibm", "oracle"]);
const ADDS: Company[] = [
  ["openai", "OpenAI", "openai.com"],
  ["anthropic", "Anthropic", "anthropic.com"],
  ["stripe", "Stripe", "stripe.com"],
  ["figma", "Figma", "figma.com"],
  ["canva", "Canva", "canva.com"],
  ["uber", "Uber", "uber.com"],
  ["mastercard", "Mastercard", "mastercard.com"],
].map(([id, name, domain]) => ({ id, name, domain }));

function person(index: number): string {
  return `${FIRST[index % FIRST.length]} ${LAST[(index * 3) % LAST.length]}`;
}

function sponsorExcerpt(fields: Record<string, string>): string {
  const article = /^[aeiou]/i.test(fields.sponsorship_type ?? "") ? "an" : "a";
  return `${fields.company_name} is listed as ${article} ${fields.sponsorship_type} sponsor of ${fields.event_name}. Sponsorship contact: ${fields.contact}. Email: ${fields.email}.`;
}

function source(input: {
  url: string;
  title: string;
  publishedAt: string;
  sourceType: string;
  authority: ProvenanceSource["authority"];
  excerpt: string;
  fieldNames: string[];
}): ProvenanceSource {
  return {
    ...input,
    domain: domainOf(input.url),
    extractionMethod: "demo_source_adapter",
    demo: true,
  };
}

function sponsorRecord(company: Company, index: number, run: number, added = false): CollectedRecord {
  const event = EVENTS[index % EVENTS.length] ?? EVENTS[0];
  if (!event) throw new Error("Missing demo event");
  const [eventName, eventDomain] = event;
  const changed = added || SOFT.has(company.id) || ["microsoft", "google", "infosys", "adobe"].includes(company.id);
  let sponsorship = TYPES[index % TYPES.length] ?? "Gold";
  let contact = person(index);
  let email = `sponsors@${company.domain}`;
  if (company.id === "google") sponsorship = "Silver";
  if (company.id === "microsoft") contact = "John Sharma";
  if (company.id === "adobe") contact = "A. Mehta";
  if (company.id === "infosys") email = "priya.nair@infosys.com";
  if (run >= 2 && company.id === "google") sponsorship = "Gold";
  if (run >= 2 && company.id === "microsoft") contact = "Sarah Sharma";
  if (run >= 2 && company.id === "adobe") contact = "Anika Mehta";
  if (run >= 2 && company.id === "infosys") email = "campus@infosys.com";

  const verified = run >= 2 && changed ? "2026-09-26" : "2026-09-10";
  const publishedAt = run >= 2 && changed ? "2026-09-26" : "2026-09-10";
  const fields: Record<string, string> = {
    company_name: company.name,
    event_name: eventName,
    sponsorship_type: sponsorship,
    website: `https://${company.domain}`,
    contact,
    email,
    last_verified: verified,
    source_url: `https://${eventDomain}/sponsors/${company.id}`,
  };
  const excerpt = sponsorExcerpt(fields);
  const fieldNames = ["company_name", "event_name", "sponsorship_type", "contact", "email", "website"];
  const sources: ProvenanceSource[] = [
    source({
      url: fields.source_url ?? "",
      title: `${eventName} sponsor registry`,
      publishedAt,
      sourceType: "event_page",
      authority: "secondary",
      excerpt,
      fieldNames,
    }),
  ];
  if (index % 2 === 0) {
    sources.push(
      source({
        url: `https://${company.domain}/newsroom/events/${company.id}`,
        title: `${company.name} newsroom`,
        publishedAt,
        sourceType: "company_page",
        authority: "official",
        excerpt,
        fieldNames,
      }),
    );
  }
  if (index % 3 === 0) {
    sources.push(
      source({
        url: `https://press.example.com/${company.id}-${slug(eventName)}`,
        title: `${company.name} sponsorship note`,
        publishedAt,
        sourceType: "press_release",
        authority: "press",
        excerpt,
        fieldNames,
      }),
    );
  }
  if (run >= 2 && company.id === "microsoft") {
    sources.unshift(
      source({
        url: "https://microsoft.com/events/india-mobile-congress",
        title: "Microsoft official event page",
        publishedAt: "2026-09-26",
        sourceType: "company_page",
        authority: "official",
        excerpt: "Microsoft is a Gold Sponsor of India Mobile Congress 2026. Sponsorship contact: Sarah Sharma.",
        fieldNames,
      }),
    );
  }
  if (run >= 2 && company.id === "google") {
    sources.unshift(
      source({
        url: "https://events.withgoogle.com/techsparks-delhi-2026",
        title: "Official TechSparks sponsor page",
        publishedAt: "2026-09-26",
        sourceType: "event_page",
        authority: "official",
        excerpt: "Google is a Gold sponsor of TechSparks Delhi 2026.",
        fieldNames: ["company_name", "event_name", "sponsorship_type"],
      }),
    );
  }

  const ambiguousFields =
    run >= 2 && company.id === "infosys" ? ["email"] : run >= 2 && company.id === "adobe" ? ["contact"] : [];

  return {
    canonicalEntityId: company.id,
    fields,
    sources,
    ambiguousFields,
  };
}

function sponsorCollection(run: number): CollectedRecord[] {
  const base = SPONSORS.filter((company) => run === 1 || !REMOVED.has(company.id)).map((company, index) => {
    const originalIndex = SPONSORS.findIndex((item) => item.id === company.id);
    return sponsorRecord(company, originalIndex, run);
  });
  if (run < 2) return base;
  const added = ADDS.map((company, index) => sponsorRecord(company, 40 + index, 2, true));
  return [...base, ...added];
}

interface GenericRow {
  id: string;
  fields: Record<string, string>;
}

function genericCollection(blueprint: CollectionBlueprint, run: number): CollectedRecord[] {
  const rows = genericRows(blueprint.intent);
  const dropped = run > 1 ? rows[0]?.id : undefined;
  const kept = rows.filter((row) => row.id !== dropped);
  const mutated = kept.map((row, index) => {
    const fields = { ...row.fields };
    let ambiguous: string[] = [];
    if (run > 1 && index < 2) fields.last_verified = "2026-09-26";
    if (run > 1 && index === 2) {
      const field = protectedField(blueprint.intent);
      if (field && fields[field]) fields[field] = clearUpdate(field, fields[field] ?? "");
    }
    if (run > 1 && index === 3) {
      const field = protectedField(blueprint.intent);
      if (field && fields[field]) {
        fields[field] = ambiguousUpdate(field, fields[field] ?? "");
        ambiguous = [field];
      }
    }
    return toGenericRecord(row.id, fields, run > 1 && index < 4, ambiguous, index === 2 && run > 1);
  });
  if (run < 2) return mutated;
  const extras = [0, 1].map((offset) => {
    const template = rows[1] ?? rows[0];
    if (!template) throw new Error("Missing generic template");
    const fields = { ...template.fields };
    const primary = primaryKey(fields);
    fields[primary] = `${fields[primary]} ${run === 2 ? "North" : "East"} ${offset + 1}`;
    if (fields.last_verified) fields.last_verified = "2026-09-26";
    return toGenericRecord(`${template.id}-new-${offset + 1}`, fields, true, [], true);
  });
  return [...mutated, ...extras];
}

function primaryKey(fields: Record<string, string>): string {
  return (
    ["company_name", "event_name", "program_name", "product_name", "segment"].find((key) => fields[key]) ??
    "company_name"
  );
}

function clearUpdate(field: string, value: string): string {
  if (field === "headquarters") return "Bengaluru";
  if (field === "start_date" || field === "deadline") return "2026-11-02";
  if (field === "location") return "Hyderabad";
  if (field === "amount") return "Revised published amount";
  if (field === "pricing_signal") return `${value}; enterprise quote`;
  if (field === "role_title") return value.startsWith("Senior ") ? value : `Senior ${value}`;
  if (field === "contact") return "Neha Rao";
  return `${value} (updated)`;
}

function ambiguousUpdate(field: string, value: string): string {
  if (field === "headquarters") return "Bengaluru, India";
  if (field === "start_date" || field === "deadline") return "2026-11-09";
  if (field === "amount") return "Amount under revision";
  if (field === "location") return "Hyderabad / Bengaluru";
  return `${value} — alternate`;
}

function protectedField(intent: CollectionBlueprint["intent"]): string | null {
  switch (intent) {
    case "JOB_LOOKUP":
      return "role_title";
    case "LEAD_LOOKUP":
      return "contact";
    case "EVENT_LOOKUP":
      return "start_date";
    case "COMPANY_LOOKUP":
      return "headquarters";
    case "COMPETITOR_LOOKUP":
      return "pricing_signal";
    case "PRODUCT_LOOKUP":
      return "category";
    case "MARKET_LOOKUP":
      return "signal";
    case "FUNDING_LOOKUP":
      return "amount";
    case "VENDOR_LOOKUP":
      return "contact";
    default:
      return null;
  }
}

function toGenericRecord(
  id: string,
  fields: Record<string, string>,
  refreshed: boolean,
  ambiguousFields: string[],
  official: boolean,
): CollectedRecord {
  const label = fields.company_name || fields.event_name || fields.program_name || fields.product_name || fields.segment || id;
  const excerpt = Object.entries(fields)
    .filter(([key]) => !["source_url", "website", "last_verified"].includes(key))
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`)
    .join(". ");
  const publishedAt = refreshed ? "2026-09-26" : "2026-09-12";
  const sources: ProvenanceSource[] = [
    source({
      url: fields.source_url || `https://example.com/${id}`,
      title: `${label} source`,
      publishedAt,
      sourceType: "company_page",
      authority: official ? "official" : "secondary",
      excerpt,
      fieldNames: Object.keys(fields).filter((key) => key !== "source_url"),
    }),
  ];
  return { canonicalEntityId: id, fields, sources, ambiguousFields };
}

function genericRows(intent: CollectionBlueprint["intent"]): GenericRow[] {
  switch (intent) {
    case "JOB_LOOKUP":
      return jobRows();
    case "LEAD_LOOKUP":
      return leadRows();
    case "EVENT_LOOKUP":
      return eventRows();
    case "COMPANY_LOOKUP":
      return companyRows();
    case "COMPETITOR_LOOKUP":
      return competitorRows();
    case "PRODUCT_LOOKUP":
      return productRows();
    case "MARKET_LOOKUP":
      return marketRows();
    case "FUNDING_LOOKUP":
      return fundingRows();
    case "VENDOR_LOOKUP":
      return vendorRows();
    default:
      return sponsorCollection(1).map((record) => ({ id: record.canonicalEntityId, fields: record.fields }));
  }
}

function jobRows(): GenericRow[] {
  const roles = [
    ["razorpay", "Razorpay", "ML Engineer", "Bengaluru", "Hybrid"],
    ["phonepe", "PhonePe", "Applied Scientist", "Bengaluru", "Onsite"],
    ["swiggy", "Swiggy", "Data Platform Engineer", "Bengaluru", "Hybrid"],
    ["cred", "CRED", "Machine Learning Engineer", "Bengaluru", "Hybrid"],
    ["meesho", "Meesho", "Senior Data Scientist", "Bengaluru", "Hybrid"],
    ["zerodha", "Zerodha", "Backend Engineer, Data", "Bengaluru", "Remote"],
    ["postman", "Postman", "AI Platform Engineer", "Bengaluru", "Remote"],
    ["freshworks", "Freshworks", "ML Engineer", "Chennai", "Hybrid"],
    ["zoho", "Zoho", "Research Engineer", "Chennai", "Onsite"],
    ["nvidia", "NVIDIA", "Solutions Architect", "Hyderabad", "Hybrid"],
    ["atlassian", "Atlassian", "Data Engineer", "Bengaluru", "Remote"],
    ["microsoft", "Microsoft", "Applied Scientist", "Hyderabad", "Hybrid"],
    ["google", "Google", "Research Scientist, Ranking", "Bengaluru", "Hybrid"],
    ["amazon", "Amazon", "Applied Scientist, Search", "Hyderabad", "Hybrid"],
    ["flipkart", "Flipkart", "Staff Data Scientist", "Bengaluru", "Hybrid"],
    ["ola", "Ola", "ML Engineer, Maps", "Bengaluru", "Onsite"],
    ["paytm", "Paytm", "Risk Data Scientist", "Noida", "Hybrid"],
    ["groww", "Groww", "Machine Learning Engineer", "Bengaluru", "Hybrid"],
    ["slice", "slice", "Data Scientist", "Bengaluru", "Hybrid"],
    ["darwinbox", "Darwinbox", "AI Engineer", "Hyderabad", "Hybrid"],
    ["whatfix", "Whatfix", "Senior ML Engineer", "Bengaluru", "Remote"],
    ["chargebee", "Chargebee", "Data Engineer", "Chennai", "Hybrid"],
  ];
  return roles.map(([id, company, role, location, workplace]) => ({
    id: `${id}-${slug(role)}`,
    fields: {
      company_name: company,
      role_title: role,
      location,
      workplace,
      website: `https://${id}.com`,
      last_verified: "2026-09-12",
      source_url: `https://careers.${id}.com/jobs/${slug(role)}`,
    },
  }));
}

function leadRows(): GenericRow[] {
  return ["Razorpay", "Zoho", "Postman", "Freshworks", "Chargebee", "BrowserStack", "Druva", "Icertis", "Clevertap", "Gupshup", "Innovaccer", "Hasura", "Yellow.ai", "Setu", "Pine Labs", "Juspay", "Capillary", "Exotel"].map(
    (name, index) => {
      const id = slug(name);
      return {
        id,
        fields: {
          company_name: name,
          contact: person(index),
          email: `partnerships@${id}.com`,
          website: `https://${id}.com`,
          last_verified: "2026-09-12",
          source_url: `https://${id}.com/company`,
        },
      };
    },
  );
}

function eventRows(): GenericRow[] {
  const extra: Array<[string, string, string, string]> = [
    ["India Mobile Congress 2026", "nasscom.in", "Delhi NCR", "2026-10-15"],
    ["TechSparks Delhi 2026", "yourstory.com", "Delhi NCR", "2026-10-22"],
    ["NASSCOM Technology Forum", "nasscom.in", "Gurugram", "2026-11-06"],
    ["AWS Summit New Delhi", "aws.amazon.com", "New Delhi", "2026-11-12"],
    ["TiECON Delhi 2026", "delhi.tie.org", "New Delhi", "2026-11-18"],
    ["India AI Impact Summit", "indiaai.gov.in", "New Delhi", "2026-12-02"],
    ["ET Soonicorns Summit", "economictimes.indiatimes.com", "Gurugram", "2026-10-28"],
    ["Startup Mahakumbh", "startupmahakumbh.org", "New Delhi", "2026-10-09"],
    ["Delhi Technology Week", "nasscom.in", "New Delhi", "2026-11-24"],
    ["Google Cloud Delhi Connect", "cloud.google.com", "Gurugram", "2026-12-08"],
    ["Microsoft AI Tour Delhi", "microsoft.com", "New Delhi", "2026-11-04"],
    ["Snowflake World Tour India", "snowflake.com", "Gurugram", "2026-11-19"],
    ["SaaSBoomi Annual", "saasboomi.org", "Chennai", "2026-10-30"],
    ["HASOC Data Summit", "hasgeek.com", "Bengaluru", "2026-12-11"],
    ["Nasscom Product Conclave", "nasscom.in", "Bengaluru", "2026-11-27"],
    ["IEEE INDICON 2026", "ieee.org", "New Delhi", "2026-12-17"],
  ];
  return extra.map(([eventName, domain, location, start]) => ({
    id: slug(eventName),
    fields: {
      event_name: eventName,
      organizer: domain.split(".")[0] ?? "Organizer",
      location,
      start_date: start,
      website: `https://${domain}`,
      source_url: `https://${domain}/events/${slug(eventName)}`,
    },
  }));
}

function companyRows(): GenericRow[] {
  const rows: Array<[string, string, string, string]> = [
    ["razorpay", "Razorpay", "Payments", "Bengaluru"],
    ["zoho", "Zoho", "Business software", "Chennai"],
    ["freshworks", "Freshworks", "Customer software", "Chennai"],
    ["postman", "Postman", "API platform", "Bengaluru"],
    ["chargebee", "Chargebee", "Subscription billing", "Chennai"],
    ["browserstack", "BrowserStack", "Developer tools", "Mumbai"],
    ["druva", "Druva", "Data protection", "Pune"],
    ["icertis", "Icertis", "Contract intelligence", "Pune"],
    ["clevertap", "Clevertap", "Customer engagement", "Mumbai"],
    ["innovaccer", "Innovaccer", "Health data platform", "Noida"],
    ["hasura", "Hasura", "Data access", "Bengaluru"],
    ["darwinbox", "Darwinbox", "HR software", "Hyderabad"],
    ["whatfix", "Whatfix", "Digital adoption", "Bengaluru"],
    ["capillary", "Capillary", "Loyalty software", "Bengaluru"],
    ["exotel", "Exotel", "Cloud communications", "Bengaluru"],
    ["groww", "Groww", "Investing", "Bengaluru"],
    ["phonepe", "PhonePe", "Payments", "Bengaluru"],
    ["zerodha", "Zerodha", "Brokerage", "Bengaluru"],
  ];
  return rows.map(([id, name, industry, headquarters]) => ({
    id,
    fields: {
      company_name: name,
      industry,
      headquarters,
      website: `https://${id}.com`,
      source_url: `https://${id}.com/about`,
    },
  }));
}

function competitorRows(): GenericRow[] {
  const rows: Array<[string, string, string]> = [
    ["notion", "Notion", "Free, Plus, Business"],
    ["coda", "Coda", "Doc Maker pricing"],
    ["airtable", "Airtable", "Team and Business tiers"],
    ["clickup", "ClickUp", "Unlimited and Business"],
    ["asana", "Asana", "Starter and Advanced"],
    ["monday", "Monday.com", "Basic, Standard, Pro"],
    ["linear", "Linear", "Free and Business"],
    ["height", "Height", "Usage-based"],
    ["jira", "Jira", "Free and Standard"],
    ["confluence", "Confluence", "Standard and Premium"],
    ["basecamp", "Basecamp", "Flat monthly"],
    ["wrike", "Wrike", "Team and Business"],
    ["smartsheet", "Smartsheet", "Pro and Business"],
    ["shortcut", "Shortcut", "Team and Business"],
    ["plane", "Plane", "Free and Pro"],
    ["trello", "Trello", "Standard and Premium"],
  ];
  return rows.map(([id, name, pricing]) => ({
    id,
    fields: {
      company_name: name,
      category: "Project management",
      pricing_signal: pricing,
      website: `https://${id}.com`,
      last_verified: "2026-09-12",
      source_url: `https://${id}.com/pricing`,
    },
  }));
}

function productRows(): GenericRow[] {
  const rows: Array<[string, string, string, string]> = [
    ["vertex", "Vertex AI", "Google", "https://cloud.google.com/vertex-ai"],
    ["bedrock", "Amazon Bedrock", "Amazon Web Services", "https://aws.amazon.com/bedrock"],
    ["azure-openai", "Azure OpenAI", "Microsoft", "https://azure.microsoft.com/products/ai-services/openai-service"],
    ["databricks-mosaic", "Mosaic AI", "Databricks", "https://www.databricks.com/product/machine-learning"],
    ["snowflake-cortex", "Cortex AI", "Snowflake", "https://www.snowflake.com/en/product/features/cortex"],
    ["watsonx", "watsonx", "IBM", "https://www.ibm.com/watsonx"],
    ["azure-ml", "Azure Machine Learning", "Microsoft", "https://azure.microsoft.com/products/machine-learning"],
    ["sagemaker", "Amazon SageMaker", "Amazon Web Services", "https://aws.amazon.com/sagemaker"],
    ["palantir-aip", "AIP", "Palantir", "https://www.palantir.com/platforms/aip"],
    ["h2o", "H2O AI Cloud", "H2O.ai", "https://h2o.ai"],
    ["datarobot", "DataRobot", "DataRobot", "https://www.datarobot.com"],
    ["c3", "C3 AI Platform", "C3 AI", "https://c3.ai"],
    ["fractal-ai", "Fractal.ai", "Fractal", "https://fractal.ai"],
  ];
  return rows.map(([id, product, vendor, url]) => ({
    id,
    fields: {
      product_name: product,
      vendor,
      category: "Enterprise AI platform",
      website: url ?? `https://example.com/${id}`,
      source_url: url ?? `https://example.com/${id}`,
    },
  }));
}

function marketRows(): GenericRow[] {
  const signals = [
    ["Cloud programs", "Cloud migration programs are still budgeted as multi-year platforms."],
    ["Private deployment", "Buyers ask for deployment inside their own VPC before a pilot."],
    ["Security review", "Evaluation cycles cluster around security review and data residency."],
    ["Shortlist shape", "Teams shortlist two platform vendors plus one specialist."],
    ["References", "Procurement asks for a named reference in the same industry."],
    ["Pricing", "Usage pricing is compared against a reserved annual commit."],
    ["Data residency", "India data-residency language now appears in most enterprise RFPs."],
    ["Model access", "Buyers separate model access from the application layer."],
    ["System of record", "Proofs of concept stall when the source system of record is unclear."],
    ["Audit logs", "Security teams ask for prompt and output logs before production."],
    ["Integrators", "A named systems integrator is often required beside the platform vendor."],
    ["Renewals", "Renewals are being tied to measured usage, not seat counts."],
  ];
  const sources = [
    "https://www.nasscom.in/knowledge-center",
    "https://www.meity.gov.in",
    "https://cloud.google.com/blog",
    "https://aws.amazon.com/blogs/enterprise-strategy",
    "https://www.mckinsey.com/capabilities/quantumblack",
    "https://www.gartner.com/en/research",
    "https://economictimes.indiatimes.com/tech",
    "https://www.microsoft.com/en-us/industry",
    "https://www.ibm.com/thought-leadership",
    "https://www.snowflake.com/blog",
    "https://www.databricks.com/blog",
    "https://inc42.com",
  ];
  return signals.map(([topic, signal], index) => ({
    id: slug(topic ?? `signal-${index + 1}`),
    fields: {
      segment: topic ?? "Enterprise AI platforms",
      region: "India",
      signal: signal ?? "",
      last_verified: "2026-09-12",
      source_url: sources[index] ?? `https://example.com/market/signal-${index + 1}`,
    },
  }));
}

function fundingRows(): GenericRow[] {
  const rows: Array<[string, string, string, string, string, string]> = [
    ["startup-india-seed", "Startup India Seed Fund", "Startup India", "Up to ₹50 lakh", "2026-11-30", "https://www.startupindia.gov.in"],
    ["sidbi-fund", "SIDBI Fund of Funds", "SIDBI", "Fund participation", "2026-12-15", "https://sidbi.in"],
    ["nvidia-inception", "NVIDIA Inception", "NVIDIA", "Credits and benefits", "Rolling", "https://www.nvidia.com/en-in/startups"],
    ["google-startups", "Google for Startups Accelerator", "Google", "Equity-free support", "2026-10-20", "https://startup.google.com"],
    ["aws-activate", "AWS Activate", "Amazon Web Services", "Cloud credits", "Rolling", "https://aws.amazon.com/activate"],
    ["ms-startups", "Microsoft for Startups", "Microsoft", "Cloud credits", "Rolling", "https://www.microsoft.com/en-us/startups"],
    ["meity-samridh", "MeitY SAMRIDH", "MeitY", "Grant support", "2026-12-01", "https://www.meity.gov.in"],
    ["nasscom-deeptech", "NASSCOM DeepTech Club", "NASSCOM", "Program membership", "2026-10-31", "https://nasscom.in"],
    ["dpiit-startup", "DPIIT Startup Recognition", "DPIIT", "Recognition and incentives", "Rolling", "https://www.startupindia.gov.in"],
    ["birac-big", "BIRAC BIG", "BIRAC", "Grant support", "2026-11-15", "https://birac.nic.in"],
    ["sidbi-srishti", "SIDBI SRIJAN", "SIDBI", "Fund participation", "2026-12-20", "https://sidbi.in"],
    ["aws-genai", "AWS Generative AI Accelerator", "Amazon Web Services", "Cloud credits", "2026-10-31", "https://aws.amazon.com/startups"],
    ["google-cloud-credits", "Google for Startups Cloud Program", "Google", "Cloud credits", "Rolling", "https://cloud.google.com/startup"],
    ["nvidia-connect", "NVIDIA Connect", "NVIDIA", "Technical guidance", "Rolling", "https://www.nvidia.com/en-in/startups"],
  ];
  return rows.map(([id, program, org, amount, deadline, site]) => ({
    id,
    fields: {
      program_name: program,
      organization: org,
      amount,
      deadline,
      website: site ?? `https://example.com/funding/${id}`,
      source_url: site ?? `https://example.com/funding/${id}`,
    },
  }));
}

function vendorRows(): GenericRow[] {
  const rows: Array<[string, string, string]> = [
    ["openai", "OpenAI", "Model APIs"],
    ["anthropic", "Anthropic", "Model APIs"],
    ["databricks", "Databricks", "Data and model platform"],
    ["snowflake", "Snowflake", "Data platform"],
    ["fractal", "Fractal", "Analytics services"],
    ["mu-sigma", "Mu Sigma", "Decision sciences"],
    ["quantiphi", "Quantiphi", "Applied AI services"],
    ["tredence", "Tredence", "Data science services"],
    ["latentview", "LatentView", "Analytics services"],
    ["tiger-analytics", "Tiger Analytics", "Decision sciences"],
    ["course5", "Course5", "Applied AI services"],
    ["bridgei2i", "BRIDGE i2i", "Analytics services"],
    ["sigmoid", "Sigmoid", "Data engineering"],
    ["gramener", "Gramener", "Data storytelling"],
    ["themathcompany", "TheMathCompany", "Decision sciences"],
    ["ganit", "Ganit", "Analytics services"],
  ];
  return rows.map(([id, name, capability], index) => ({
    id,
    fields: {
      company_name: name,
      capability,
      website: `https://${id}.com`,
      contact: person(index),
      last_verified: "2026-09-12",
      source_url: `https://${id}.com/enterprise`,
    },
  }));
}

export function collectDemo(blueprint: CollectionBlueprint, runNumber: number, locationOverride?: string | null): CollectedRecord[] {
  const run = runNumber <= 1 ? 1 : 2;
  if (blueprint.intent === "SPONSOR_LOOKUP") {
    const records = sponsorCollection(run);
    return applyPlace(records, locationOverride ?? blueprint.entities.location);
  }
  return genericCollection(blueprint, run);
}

function applyPlace(records: CollectedRecord[], location: string | null): CollectedRecord[] {
  if (!location || /delhi/i.test(location)) return records;
  const place = slug(location);
  return records.map((record) => ({
    ...record,
    canonicalEntityId: `${record.canonicalEntityId}-${place}`,
    fields: {
      ...record.fields,
      event_name: `${record.fields.event_name ?? "Event"} · ${location}`,
    },
    sources: record.sources.map((item) => ({
      ...item,
      excerpt: item.excerpt.replace(record.fields.event_name ?? "", `${record.fields.event_name} · ${location}`),
    })),
  }));
}

export const SPONSOR_DIFF = {
  added: 7,
  removed: 2,
  // last_verified bumps alone are not changes (see UNCOMPARED_FIELDS in pipeline.ts)
  changed: 4,
  conflicts: 4,
};
