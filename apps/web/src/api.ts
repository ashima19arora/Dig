import type { CollectionBlueprint, JobState } from "@dig/schemas";

export interface Session {
  workspace: { id: string; name: string };
  user: { id: string; name: string; email: string };
}

export interface DiffSummary {
  firstVersion: boolean;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  conflicts: number;
}

export interface JobSummary {
  id: string;
  name: string;
  intent: string;
  status: JobState;
  query: string;
  demo: boolean;
  updatedAt: string;
  versionNumber: number | null;
  rowCount: number;
  sourceCount: number;
  qualityScore: number | null;
  avgConfidence: number | null;
  lastRunAt: string | null;
  pendingConflicts: number;
  diff: DiffSummary | null;
  blueprint: CollectionBlueprint;
  schedule: { enabled: boolean; cadence: string; hour: number; weekday: number | null; nextRunAt: string | null; timezone: string } | null;
}

export interface Progress {
  stage: string;
  percent: number;
  sourcesPlanned: number;
  sourcesScanned: number;
  documents: number;
  records: number;
  valid: number;
  duplicates: number;
  conflicts: number;
}

/** Only sponsor research runs end to end this pass; the API refuses other intents with UNSUPPORTED_INTENT. */
export const SUPPORTED_INTENTS = ["SPONSOR_LOOKUP"];

export class ApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as { success: boolean; data: T; error?: { message: string; code?: string } };
  if (!response.ok || body.success === false) throw new ApiError(body.error?.message ?? "Request failed", body.error?.code ?? "ERROR");
  return body.data;
}

/** Downloads a file from the API, surfacing the API's error message instead of saving an error page. */
export async function download(path: string, fallbackName: string) {
  const response = await fetch(path);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message: string; code?: string } } | null;
    throw new ApiError(body?.error?.message ?? `Download failed (${response.status})`, body?.error?.code ?? "ERROR");
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "Not run";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (Number.isNaN(minutes)) return "—";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function pct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export interface SourceRef {
  url: string;
  title: string;
  domain: string;
  publishedAt: string;
  authority: "official" | "secondary" | "press";
  excerpt: string;
  fieldNames: string[];
}

export interface Evidence {
  id: string;
  fieldName: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  collectedAt: string;
  publishedAt: string;
  authority: "official" | "secondary" | "press";
  confidence: number;
}

export type RecordStatus = "verified" | "needs_review" | "possible_duplicate" | "incomplete";

export interface DatasetRecord {
  id: string;
  canonicalEntityId: string;
  fields: Record<string, string>;
  rank: number;
  confidence: number;
  status: RecordStatus;
  sourceCount: number;
  flags: string[];
  sources: SourceRef[];
  evidence: Evidence[];
  label: string;
  change: "initial" | "added" | "changed" | "conflict" | "unchanged";
}

export interface DatasetVersion {
  id: string;
  /** the run that produced this version — its conflicts are the live ones */
  runId: string;
  versionNumber: number;
  createdAt: string;
  rowCount: number;
  sourceCount: number;
  status: string;
  qualityScore: number | null;
  avgConfidence: number | null;
}

export interface Dataset {
  version: DatasetVersion | null;
  records: DatasetRecord[];
}

export interface Conflict {
  id: string;
  jobId: string;
  runId: string;
  recordId: string | null;
  canonicalEntityId: string;
  label: string;
  field: string;
  oldValue: string;
  newValue: string;
  oldEvidence: Evidence | null;
  newEvidence: Evidence | null;
  detectedAt: string;
  status: "PENDING" | "AUTO_RESOLVED" | "RESOLVED" | string;
  decision: string | null;
  confidence: number | null;
  reason: string | null;
  resolvedAt: string | null;
}

export interface DiffEntry {
  canonicalEntityId: string;
  label: string;
  detail: string;
  fields: Array<{ field: string; from: string; to: string }>;
}

export interface Diff {
  firstVersion: boolean;
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
  unchanged: DiffEntry[];
  conflictIds: string[];
}

export interface JobProgress {
  status: string;
  runId: string | null;
  runNumber: number | null;
  progress: Progress;
  error: string | null;
}

export interface JobDetail {
  job: JobSummary;
  version: unknown;
  progress: JobProgress;
}

export const ACTIVE_STATES = ["QUEUED", "COLLECTING", "NORMALIZING", "VALIDATING", "DEDUPLICATING", "RANKING", "ANNOTATING"];
