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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as { success: boolean; data: T; error?: { message: string } };
  if (!response.ok || body.success === false) throw new Error(body.error?.message ?? "Request failed");
  return body.data;
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
