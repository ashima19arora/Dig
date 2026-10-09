import type { AgentRecord } from "./types.js";

export interface LensInput {
  records: AgentRecord[];
  added: number;
  removed: number;
  changed: number;
  conflicts: number;
  outreach: { pending: number; interested: number; declined: number };
  workflowRuns: { completed: number; failed: number };
  firstVersion?: boolean;
  unchanged?: number;
}

export interface LensGraphNode {
  id: string;
  type: "company" | "person" | "source" | "dataset";
  label: string;
  canonicalEntityId?: string;
}

export interface LensGraphEdge {
  source: string;
  target: string;
  kind: "works_at" | "mentioned_by" | "appears_in" | "sponsor_of" | "changed_between";
}

export interface LensReport {
  summary: { records: number; avgConfidence: number; contactablePct: number; highPriority: number };
  changes: { added: number; removed: number; changed: number; conflicts: number; newContactPaths: number };
  signal: string | null;
  recommendation: string | null;
  metrics: Record<string, number | null>;
  funnel: Array<{ label: string; count: number }>;
  confidence: Array<{ label: string; count: number }>;
  contactability: Array<{ label: string; count: number }>;
  categories: Array<{ label: string; count: number }>;
  roles: Array<{ label: string; count: number }>;
  locations: Array<{ label: string; count: number }>;
  graph: { nodes: LensGraphNode[]; edges: LensGraphEdge[] };
  comparison: {
    comparable: boolean;
    beforeRecords: number | null;
    afterRecords: number;
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    net: number | null;
  };
  actions: Array<{ id: string; label: string; reason: string }>;
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function bucket(records: AgentRecord[], read: (record: AgentRecord) => number, bands: Array<[string, number, number]>) {
  return bands.map(([label, min, max]) => ({ label, count: records.filter((record) => { const value = read(record); return value >= min && value < max; }).length }));
}

function shortLabel(label: string) {
  const head = label.split(/\s*[•·|]\s*/)[0]?.replace(/\s+/g, " ").trim() || label;
  return head.length > 32 ? `${head.slice(0, 31)}…` : head;
}

function tally(records: AgentRecord[], field: string, clean = false) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const raw = record.fields[field]?.trim();
    if (!raw) continue;
    const label = clean ? shortLabel(raw) : raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
}

export function buildLensReport(input: LensInput): LensReport {
  const records = input.records;
  const total = records.length;
  const verified = records.filter((record) => record.status === "verified").length;
  const review = records.filter((record) => record.status === "needs_review").length;
  const duplicates = records.filter((record) => record.status === "possible_duplicate").length;
  const incomplete = records.filter((record) => record.status === "incomplete").length;
  const contactable = records.filter((record) => record.contactabilityScore > 0).length;
  const highPriority = records.filter((record) => record.status === "verified" && record.contactabilityScore >= 70 && record.confidence >= 0.8).length;
  const avgConfidence = total ? Math.round((records.reduce((sum, record) => sum + record.confidence, 0) / total) * 100) : 0;
  const contacted = input.outreach.interested + input.outreach.declined + input.outreach.pending;
  const responded = input.outreach.interested + input.outreach.declined;
  const runs = input.workflowRuns.completed + input.workflowRuns.failed;
  const missing = records.filter((record) => record.contactabilityScore === 0).length;
  const newContacts = records.filter((record) => (record.change === "added" || record.change === "changed") && record.contactabilityScore > 0).length;

  const signal = input.added > 0
    ? `${input.added} ${input.added === 1 ? "organization was" : "organizations were"} added since the previous run.`
    : input.changed > 0
      ? `${input.changed} ${input.changed === 1 ? "organization" : "organizations"} changed since the previous run.`
      : null;
  const recommendation = highPriority > 0
    ? `Prioritize the ${highPriority} verified organizations that already have a contact path.`
    : missing > 0
      ? `${missing} records have no contact path yet.`
      : null;

  const actions: LensReport["actions"] = [];
  if (input.changed || input.added || input.removed) actions.push({ id: "changes", label: "Review changes", reason: "The latest run differs from the previous one." });
  if (missing) actions.push({ id: "enrich", label: "Enrich records", reason: `${missing} records lack a contact path.` });
  if (highPriority) actions.push({ id: "mission", label: "Create mission", reason: `${highPriority} organizations are verified and contactable.` });
  if (input.conflicts) actions.push({ id: "conflicts", label: "Review conflicts", reason: `${input.conflicts} conflicts are still open.` });
  if (input.workflowRuns.failed) actions.push({ id: "workflow", label: "Open workflow run", reason: "A workflow run failed." });

  return {
    summary: { records: total, avgConfidence, contactablePct: pct(contactable, total), highPriority },
    changes: { added: input.added, removed: input.removed, changed: input.changed, conflicts: input.conflicts, newContactPaths: newContacts },
    signal,
    recommendation,
    metrics: {
      total,
      verified,
      needsReview: review,
      possibleDuplicates: duplicates,
      incomplete,
      avgConfidence,
      sourceCount: records.reduce((sum, record) => sum + record.sourceCount, 0),
      contactablePct: pct(contactable, total),
      added: input.added,
      removed: input.removed,
      changed: input.changed,
      conflicts: input.conflicts,
      outreach: contacted,
      responded,
      interested: input.outreach.interested,
      declined: input.outreach.declined,
      conversionPct: pct(input.outreach.interested, contacted),
      workflowSuccessPct: runs ? pct(input.workflowRuns.completed, runs) : null,
      workflowFailurePct: runs ? pct(input.workflowRuns.failed, runs) : null,
      providerLatencyMs: null,
      estimatedCost: null,
    },
    funnel: [
      { label: "Records", count: total },
      { label: "Verified", count: verified },
      { label: "Contactable", count: contactable },
      { label: "High priority", count: highPriority },
      { label: "Contacted", count: contacted },
      { label: "Responded", count: responded },
      { label: "Interested", count: input.outreach.interested },
    ],
    confidence: bucket(records, (record) => Math.round(record.confidence * 100), [["0–49", 0, 50], ["50–79", 50, 80], ["80–100", 80, 101]]),
    contactability: bucket(records, (record) => record.contactabilityScore, [["None", 0, 1], ["1–49", 1, 50], ["50–79", 50, 80], ["80–100", 80, 101]]),
    categories: tally(records, "category").concat(tally(records, "sponsorship_type")).slice(0, 8),
    roles: tally(records, "role_title"),
    locations: tally(records, "location", true),
    graph: buildGraph(records),
    comparison: compareRuns(total, input),
    actions,
  };
}

function compareRuns(total: number, input: LensInput): LensReport["comparison"] {
  const comparable = input.firstVersion === false;
  const before = comparable ? total - input.added + input.removed : null;
  const beforeRecords = before !== null && before >= 0 ? before : null;
  return {
    comparable: beforeRecords !== null,
    beforeRecords,
    afterRecords: total,
    added: input.added,
    removed: input.removed,
    changed: input.changed,
    unchanged: input.unchanged ?? 0,
    net: beforeRecords === null ? null : input.added - input.removed,
  };
}

function buildGraph(records: AgentRecord[]): { nodes: LensGraphNode[]; edges: LensGraphEdge[] } {
  const nodes: LensGraphNode[] = [{ id: "dataset", type: "dataset", label: "Dataset" }];
  const edges: LensGraphEdge[] = [];
  for (const record of records.slice(0, 40)) {
    const companyId = `company:${record.canonicalEntityId}`;
    nodes.push({ id: companyId, type: "company", label: record.fields.company_name || record.label || "Organization", canonicalEntityId: record.canonicalEntityId });
    edges.push({ source: companyId, target: "dataset", kind: "appears_in" });
    if (record.change === "changed" || record.change === "added") edges.push({ source: companyId, target: "dataset", kind: "changed_between" });
    const person = record.fields.person_name || record.fields.contact;
    if (person) {
      const personId = `person:${record.canonicalEntityId}`;
      nodes.push({ id: personId, type: "person", label: person, canonicalEntityId: record.canonicalEntityId });
      edges.push({ source: personId, target: companyId, kind: "works_at" });
    }
    if (record.fields.source_url) {
      const sourceId = `source:${record.fields.source_url}`;
      if (!nodes.some((item) => item.id === sourceId)) nodes.push({ id: sourceId, type: "source", label: record.fields.source_url.replace(/^https?:\/\//, "").slice(0, 42) });
      edges.push({ source: sourceId, target: companyId, kind: "mentioned_by" });
    }
  }
  return { nodes, edges };
}
