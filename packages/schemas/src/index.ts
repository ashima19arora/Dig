import { z } from "zod";

export const INTENT_IDS = [
  "SPONSOR_LOOKUP",
  "JOB_LOOKUP",
  "LEAD_LOOKUP",
  "EVENT_LOOKUP",
  "COMPANY_LOOKUP",
  "COMPETITOR_LOOKUP",
  "PRODUCT_LOOKUP",
  "MARKET_LOOKUP",
  "FUNDING_LOOKUP",
  "VENDOR_LOOKUP",
] as const;

export const intentIdSchema = z.enum(INTENT_IDS);
export type IntentId = z.infer<typeof intentIdSchema>;

export const JOB_STATES = [
  "DRAFT",
  "PLANNED",
  "QUEUED",
  "COLLECTING",
  "NORMALIZING",
  "VALIDATING",
  "DEDUPLICATING",
  "RANKING",
  "ANNOTATING",
  "CONFLICT_REVIEW",
  "COMPLETED",
  "FAILED",
  "PARTIAL",
  "CANCELLED",
] as const;

export const jobStateSchema = z.enum(JOB_STATES);
export type JobState = z.infer<typeof jobStateSchema>;

export const ACTIVE_STATES: JobState[] = [
  "QUEUED",
  "COLLECTING",
  "NORMALIZING",
  "VALIDATING",
  "DEDUPLICATING",
  "RANKING",
  "ANNOTATING",
];

export const blueprintSchema = z.object({
  intent: intentIdSchema,
  query: z.string().min(1),
  entities: z.object({
    category: z.string().nullable(),
    location: z.string().nullable(),
  }),
  fields: z.array(z.string().min(1)).min(1),
  freshness: z.object({
    required: z.boolean(),
    maxAgeDays: z.number().int().positive().max(3650),
  }),
  sources: z.array(z.string()),
  ranking: z.object({
    strategy: z.string().min(1),
  }),
});

export type CollectionBlueprint = z.infer<typeof blueprintSchema>;

export const scheduleSchema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(["daily", "weekly"]),
  weekday: z.number().int().min(0).max(6).nullable(),
  hour: z.number().int().min(0).max(23),
  timezone: z.string().min(1),
  nextRunAt: z.string().nullable(),
});

export type Schedule = z.infer<typeof scheduleSchema>;

export const createJobSchema = z.object({
  query: z.string().trim().min(8).max(2000),
  name: z.string().trim().min(1).max(180).optional(),
  blueprint: blueprintSchema.optional(),
  // When true, this job collects from the live web (Tavily search + an LLM
  // extraction pass) instead of the deterministic demo fixtures, regardless
  // of the server's global DEMO_MODE default.
  live: z.boolean().optional(),
});

export const previewBlueprintSchema = z.object({
  query: z.string().trim().min(8).max(2000),
  blueprint: blueprintSchema.optional(),
});

export const updateBlueprintSchema = z.object({
  blueprint: blueprintSchema,
  name: z.string().trim().min(1).max(180).optional(),
});

export const resolveConflictSchema = z.object({
  decision: z.enum(["NEW", "OLD", "BOTH"]),
});

export const exportQuerySchema = z.object({
  format: z.enum(["csv", "json", "html", "xlsx"]).default("csv"),
});

export const savedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    change: z.enum(["added", "changed", "removed", "unchanged", "conflict"]).optional(),
  }),
});

export const scheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(["daily", "weekly"]).default("weekly"),
  weekday: z.number().int().min(0).max(6).nullable().default(1),
  hour: z.number().int().min(0).max(23).default(9),
  timezone: z.string().default("Asia/Kolkata"),
});

export const duplicateJobSchema = z.object({
  location: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(180).optional(),
});

export const FIELD_LABELS: Record<string, string> = {
  company_name: "Company",
  event_name: "Event",
  sponsorship_type: "Sponsorship",
  website: "Website",
  contact: "Contact",
  email: "Email",
  last_verified: "Last verified",
  source_url: "Source URL",
  evidence: "Evidence",
  role_title: "Role",
  location: "Location",
  workplace: "Workplace",
  organizer: "Organizer",
  start_date: "Start date",
  industry: "Industry",
  headquarters: "Headquarters",
  category: "Category",
  pricing_signal: "Pricing signal",
  product_name: "Product",
  vendor: "Vendor",
  segment: "Segment",
  region: "Region",
  signal: "Signal",
  program_name: "Program",
  organization: "Organization",
  amount: "Amount",
  deadline: "Deadline",
  capability: "Capability",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replaceAll("_", " ");
}

export const INTENT_LABELS: Record<IntentId, string> = {
  SPONSOR_LOOKUP: "Sponsor lookup",
  JOB_LOOKUP: "Job lookup",
  LEAD_LOOKUP: "Lead lookup",
  EVENT_LOOKUP: "Event lookup",
  COMPANY_LOOKUP: "Company lookup",
  COMPETITOR_LOOKUP: "Competitor lookup",
  PRODUCT_LOOKUP: "Product lookup",
  MARKET_LOOKUP: "Market lookup",
  FUNDING_LOOKUP: "Funding lookup",
  VENDOR_LOOKUP: "Vendor lookup",
};

export function stateLabel(state: JobState): string {
  switch (state) {
    case "CONFLICT_REVIEW":
      return "Needs review";
    case "COMPLETED":
      return "Completed";
    case "NORMALIZING":
      return "Normalizing";
    case "DEDUPLICATING":
      return "Deduplicating";
    case "VALIDATING":
      return "Validating";
    case "COLLECTING":
      return "Collecting";
    case "RANKING":
      return "Ranking";
    case "ANNOTATING":
      return "Annotating";
    case "QUEUED":
      return "Queued";
    case "PLANNED":
      return "Planned";
    case "DRAFT":
      return "Draft";
    case "FAILED":
      return "Failed";
    case "PARTIAL":
      return "Partial";
    case "CANCELLED":
      return "Cancelled";
    default:
      return state;
  }
}
