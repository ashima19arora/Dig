import { channel, emptyContactability, scoreContactability, type ChannelKey } from "../enrichment/contactability.js";
import type {
  AgentRecord,
  Connector,
  FilterConfig,
  NodeConfig,
  NodeRunResult,
  NodeStatus,
  OutboundRequest,
  RunStatus,
  WorkflowGraph,
  WorkflowNode,
} from "./types.js";

const TOKEN = /\{\{\s*record\.([a-zA-Z0-9_]+)\s*\}\}/g;
const OUTBOUND = new Set(["email", "whatsapp", "linkedin", "webhook", "http"]);

export interface EngineInput {
  records: AgentRecord[];
  mode: "dry" | "live";
  now: string;
  approvedNodeIds?: string[];
  skipDelays?: boolean;
  cancelled?: boolean | { current: boolean };
  snapshots?: Record<string, Record<string, AgentRecord[]>>;
  connectors?: Partial<Record<OutboundRequest["kind"], Connector>>;
  delivered?: Set<string>;
  maxSends?: number;
}

export interface EngineOutput {
  status: RunStatus;
  nodeRuns: NodeRunResult[];
  records: AgentRecord[];
  error: string | null;
  waitingNodeId: string | null;
}

export function interpolate(template: string, record: AgentRecord): string {
  return template.replace(TOKEN, (_match, key: string) => {
    if (key === "name") return record.fields.person_name || record.fields.contact || record.fields.company_name || record.label || "";
    if (key === "company") return record.fields.company_name || record.fields.organization || record.fields.vendor || record.label || "";
    if (key === "role") return record.fields.role_title || record.fields.sponsorship_type || record.fields.role || "";
    if (key === "email") return record.fields.email || "";
    if (key === "phone") return record.fields.phone || "";
    if (key === "linkedin") return record.fields.linkedin || "";
    if (key === "github") return record.fields.github || "";
    if (key === "label") return record.label || "";
    return record.fields[key] ?? "";
  });
}

export function templateError(template: string): string | null {
  const stripped = template.replace(TOKEN, "");
  if (stripped.includes("{{") || stripped.includes("}}")) return "Only {{record.field}} placeholders are allowed.";
  return null;
}

/** Use a stored contact score, or the email, phone, or profile already on the row. */
export function workflowContact(fields: Record<string, string>, stored?: { score?: number; status?: string } | null) {
  const raw = stored?.score ?? 0;
  const scaled = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
  const status = stored?.status || "NONE";
  if (status === "READY" || status === "PARTIAL") return { score: scaled, status };
  const book = emptyContactability("1970-01-01T00:00:00.000Z");
  const take = (key: ChannelKey, field: string) => {
    const value = fields[field]?.trim();
    if (!value) return;
    book.channels[key] = channel({
      value,
      status: "VERIFIED",
      confidence: 0.95,
      provider: "research",
      sourceUrl: null,
      fetchedAt: "1970-01-01T00:00:00.000Z",
      verificationStatus: "grounded",
      matchingEvidence: "Already on the research record from a quoted page.",
    });
  };
  take("email", "email");
  take("phone", "phone");
  take("linkedin", "linkedin");
  take("github", "github");
  const scored = scoreContactability(book);
  if (scored.status === "NONE") return { score: scaled, status };
  return { score: Math.round(scored.score * 100), status: scored.status };
}

export function readField(record: AgentRecord, field: string): string {
  if (field === "status") return record.status;
  if (field === "confidence") return String(Math.round(record.confidence * 100));
  if (field === "contactability.score") return String(record.contactabilityScore);
  if (field === "contactability.status") return record.contactabilityStatus;
  if (field === "trust.score") return String(record.trustScore);
  if (field === "trust.status") return record.trustStatus;
  if (field === "change") return record.change;
  if (field === "sponsorFit") return String(Math.round(record.confidence * record.contactabilityScore));
  return record.fields[field] ?? "";
}

export function matches(record: AgentRecord, filter: FilterConfig): boolean {
  const raw = readField(record, filter.field);
  if (filter.op === "exists") return raw.trim().length > 0;
  if (filter.op === "contains") return raw.toLowerCase().includes(filter.value.toLowerCase());
  const left = Number(raw);
  const right = Number(filter.value);
  if (filter.op === "gte" || filter.op === "lte") {
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    return filter.op === "gte" ? left >= right : left <= right;
  }
  const same = raw.toLowerCase() === filter.value.toLowerCase();
  return filter.op === "neq" ? !same : same;
}

export function validateGraph(graph: WorkflowGraph): Array<{ nodeId: string | null; message: string }> {
  const errors: Array<{ nodeId: string | null; message: string }> = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) errors.push({ nodeId: node.id, message: "Duplicate node id." });
    ids.add(node.id);
    if (node.config.kind !== node.kind) errors.push({ nodeId: node.id, message: "Node kind does not match its configuration." });
    if (node.config.kind === "email" || node.config.kind === "whatsapp" || node.config.kind === "linkedin") {
      for (const part of [node.config.to, node.config.subject, node.config.body]) {
        const problem = templateError(part);
        if (problem) errors.push({ nodeId: node.id, message: problem });
      }
    }
    if (node.config.kind === "http" || node.config.kind === "webhook") {
      if (!/^https:\/\/[^\s@]+$/i.test(node.config.url)) errors.push({ nodeId: node.id, message: "HTTP actions only allow https URLs without embedded credentials." });
    }
    if ((node.config.kind === "update" || node.config.kind === "annotate") && !["outreach_status", "note"].includes(node.config.field)) {
      errors.push({ nodeId: node.id, message: "A workflow may update outreach status and notes. Research fields stay on the source." });
    }
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push({ nodeId: edge.source, message: "An edge points at a missing node." });
  }
  if (hasCycle(graph)) errors.push({ nodeId: null, message: "The workflow has a cycle. Use the loop node for a bounded repeat." });
  return errors;
}

function hasCycle(graph: WorkflowGraph): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (walk(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return graph.nodes.some((node) => walk(node.id));
}

function stamp(nodeId: string, status: NodeStatus, startedAt: string, extra: Partial<NodeRunResult>): NodeRunResult {
  return {
    nodeId,
    status,
    startedAt,
    finishedAt: extra.finishedAt ?? startedAt,
    retryCount: extra.retryCount ?? 0,
    error: extra.error ?? null,
    output: extra.output ?? null,
    recordsByHandle: extra.recordsByHandle ?? { out: [] },
  };
}

function ancestors(graph: WorkflowGraph, id: string): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }
  const seen = new Set<string>();
  const stack = [...(incoming.get(id) ?? [])];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    stack.push(...(incoming.get(current) ?? []));
  }
  return seen;
}

export function mockConnector(kind: OutboundRequest["kind"], seen = new Set<string>()): Connector {
  return {
    kind,
    async deliver(request) {
      if (!request.dryRun && seen.has(request.idempotencyKey)) return { ok: true, preview: "Already delivered." };
      if (!request.dryRun) seen.add(request.idempotencyKey);
      const target = request.to || request.url || "the connector";
      return { ok: true, preview: request.dryRun ? `Preview ${kind} for ${target}` : `Queued ${kind} for ${target}` };
    },
  };
}

export async function executeGraph(graph: WorkflowGraph, input: EngineInput): Promise<EngineOutput> {
  const problems = validateGraph(graph);
  if (problems.length) return { status: "FAILED", nodeRuns: [], records: [], error: problems[0]?.message ?? "Invalid workflow.", waitingNodeId: null };

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, WorkflowGraph["edges"]>();
  const outgoing = new Map<string, WorkflowGraph["edges"]>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }
  const outputs = new Map<string, Record<string, AgentRecord[]>>(Object.entries(input.snapshots ?? {}));
  const runs: NodeRunResult[] = [];
  const seen = new Set<string>(Object.keys(input.snapshots ?? {}));
  const linked = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]));
  const ready = graph.nodes
    .filter((node) => (incoming.get(node.id) ?? []).length === 0)
    .filter((node) => graph.edges.length === 0 || linked.has(node.id))
    .map((node) => node.id);
  for (const id of Object.keys(input.snapshots ?? {})) {
    for (const edge of outgoing.get(id) ?? []) ready.push(edge.target);
  }
  const delivered = input.delivered ?? new Set<string>();
  let sent = 0;
  let waitingNodeId: string | null = null;
  let failed = 0;
  let completed = 0;
  let guard = 0;

  while (ready.length && guard < graph.nodes.length * 8) {
    guard += 1;
    const cancelled = typeof input.cancelled === "object" ? input.cancelled.current : input.cancelled;
    if (cancelled) {
      return { status: "CANCELLED", nodeRuns: runs, records: [], error: null, waitingNodeId };
    }
    const id = ready.shift();
    if (!id) continue;
    if (seen.has(id)) {
      for (const edge of outgoing.get(id) ?? []) if (!seen.has(edge.target)) ready.push(edge.target);
      continue;
    }
    const preds = incoming.get(id) ?? [];
    if (preds.some((edge) => !seen.has(edge.source))) {
      ready.push(id);
      continue;
    }
    const node = byId.get(id);
    if (!node) continue;
    const livePreds = preds.filter((edge) => outputs.has(edge.source));
    if (preds.length > 0 && livePreds.length === 0) {
      runs.push(
        stamp(id, "SKIPPED", input.now, {
          error: "Upstream did not produce records.",
          output: {
            count: 0,
            inputCount: 0,
            outputCount: 0,
            diagnostic: "Upstream step did not produce records, so this step was skipped.",
          },
          recordsByHandle: { out: [] },
        }),
      );
      seen.add(id);
      for (const edge of outgoing.get(id) ?? []) ready.push(edge.target);
      continue;
    }
    const records = gather(livePreds, outputs, input.records);
    const result = await runNode(node, records, graph, input, delivered, () => {
      sent += 1;
      return sent <= (input.maxSends ?? 25);
    });
    runs.push(result);
    seen.add(id);
    if (result.status === "COMPLETED") completed += 1;
    if (result.status === "FAILED") failed += 1;
    if (result.status === "WAITING") {
      waitingNodeId = id;
      break;
    }
    if (result.status === "COMPLETED") {
      outputs.set(id, result.recordsByHandle);
      for (const edge of outgoing.get(id) ?? []) {
        const handle = routeHandle(edge.sourceHandle);
        if (result.recordsByHandle[handle]) ready.push(edge.target);
      }
    } else if (result.status === "FAILED") {
      for (const edge of outgoing.get(id) ?? []) ready.push(edge.target);
    }
  }

  const last = [...outputs.values()].at(-1);
  const records = last?.out ?? last?.yes ?? [];
  if (waitingNodeId) return { status: "WAITING", nodeRuns: runs, records, error: null, waitingNodeId };
  if (failed && completed) return { status: "PARTIAL", nodeRuns: runs, records, error: null, waitingNodeId: null };
  if (failed) return { status: "FAILED", nodeRuns: runs, records, error: "A node failed.", waitingNodeId: null };
  return { status: "COMPLETED", nodeRuns: runs, records, error: null, waitingNodeId: null };
}

/** The bottom port is only a drawing choice. It carries the same records as the right-hand port. */
function routeHandle(handle?: string | null): "out" | "yes" | "no" {
  return handle === "yes" || handle === "no" ? handle : "out";
}

function gather(edges: WorkflowGraph["edges"], outputs: Map<string, Record<string, AgentRecord[]>>, fallback: AgentRecord[]): AgentRecord[] {
  if (edges.length === 0) return fallback;
  const merged = new Map<string, AgentRecord>();
  for (const edge of edges) {
    const bucket = outputs.get(edge.source)?.[routeHandle(edge.sourceHandle)] ?? [];
    for (const record of bucket) merged.set(record.canonicalEntityId, record);
  }
  return [...merged.values()];
}

async function runNode(
  node: WorkflowNode,
  records: AgentRecord[],
  graph: WorkflowGraph,
  input: EngineInput,
  delivered: Set<string>,
  allowSend: () => boolean,
): Promise<NodeRunResult> {
  const startedAt = input.now;
  const attempts = Math.max(0, node.retry ?? 0);
  let retryCount = 0;
  let lastError = "Node failed.";
  while (retryCount <= attempts) {
    try {
      const done = await applyNode(node, records, graph, input, delivered, allowSend);
      return stamp(node.id, done.status, startedAt, { ...done, finishedAt: input.now, retryCount });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Node failed.";
      retryCount += 1;
    }
  }
  return stamp(node.id, "FAILED", startedAt, { error: lastError, retryCount: retryCount - 1, recordsByHandle: { out: [] } });
}

async function applyNode(
  node: WorkflowNode,
  records: AgentRecord[],
  graph: WorkflowGraph,
  input: EngineInput,
  delivered: Set<string>,
  allowSend: () => boolean,
): Promise<Pick<NodeRunResult, "status" | "output" | "recordsByHandle" | "error">> {
  const config = node.config;

  const toSample = (list: AgentRecord[]) =>
    list.slice(0, 20).map((r) => ({
      canonicalEntityId: r.canonicalEntityId,
      label: r.label,
      status: r.status,
      change: r.change,
      confidence: r.confidence,
      email: r.fields.email || undefined,
      phone: r.fields.phone || undefined,
      website: r.fields.website || undefined,
      contactabilityScore: r.contactabilityScore,
    }));

  const pass = (
    next: AgentRecord[],
    extraOutput: Record<string, unknown> = {},
    customDiagnostic?: string,
  ) => {
    let diagnostic = customDiagnostic;
    if (!diagnostic) {
      if (config.kind === "dataset" || config.kind === "research" || config.kind === "search") {
        diagnostic = `Loaded ${next.length} verified records from the dataset.`;
      } else if (config.kind === "changes") {
        const added = records.filter((r) => r.change === "added").length;
        const changed = records.filter((r) => r.change === "changed").length;
        const unchanged = records.filter((r) => r.change === "unchanged").length;
        if (next.length === 0) {
          diagnostic = `Received ${records.length} records, but 0 were new or modified (${unchanged} unchanged). In this dataset, all records are from the first/current version with no newer diff. Tip: Run the research search again to detect live changes, or use a Filter step to process records now.`;
        } else {
          diagnostic = `Found ${next.length} changed records (${added} newly added, ${changed} modified) out of ${records.length} input records.`;
        }
      } else if (config.kind === "log" || config.kind === "export") {
        if (records.length === 0) {
          diagnostic = `Received 0 records from upstream step. No log entries were created.`;
        } else {
          const sample = interpolate(config.message, records[0] ?? emptyRecord());
          diagnostic = `Processed ${records.length} records. Log preview: "${sample}"`;
        }
      } else if (config.kind === "filter") {
        diagnostic = `Filtered ${records.length} input records down to ${next.length} matching "${config.field} ${config.op} ${config.value || ""}".`;
      } else if (config.kind === "sort" || config.kind === "rank") {
        diagnostic = `Ordered ${next.length} records by ${config.field} (${config.direction}).`;
      } else if (config.kind === "limit" || config.kind === "loop") {
        diagnostic = `Capped ${records.length} records down to the first ${next.length} records (limit: ${config.count}).`;
      } else if (config.kind === "trust" || config.kind === "decision") {
        const dropped = records.length - next.length;
        diagnostic = `Kept ${next.length} trusted records (HIGH/MEDIUM trust). Filtered out ${dropped} untrusted/unreviewed records.`;
      } else if (config.kind === "contactability") {
        const dropped = records.length - next.length;
        diagnostic = `Kept ${next.length} reachable records with contact score >= ${config.min ?? 80}. Filtered out ${dropped} unreachable records.`;
      } else if (config.kind === "enrich") {
        const missing = records.filter((r) => r.contactabilityStatus === "NONE" || r.contactabilityScore === 0).length;
        diagnostic = `Verified contact paths across ${records.length} records. ${records.length - missing} have active paths; ${missing} need review.`;
      } else if (config.kind === "dedupe") {
        diagnostic = `Deduplicated ${records.length} records down to ${next.length} unique entities on '${config.field}'.`;
      } else {
        diagnostic = `Step completed: ${next.length} records produced from ${records.length} inputs.`;
      }
    }

    return {
      status: "COMPLETED" as const,
      output: {
        count: next.length,
        inputCount: records.length,
        outputCount: next.length,
        diagnostic,
        sampleRecords: toSample(next),
        ...extraOutput,
      },
      recordsByHandle: { out: next },
      error: null,
    };
  };

  if (config.kind === "filter") return pass(records.filter((record) => matches(record, config)));
  if (config.kind === "select") {
    const ids = new Set(config.ids);
    return pass(ids.size ? records.filter((record) => ids.has(record.canonicalEntityId)) : records);
  }
  if (config.kind === "sort" || config.kind === "rank") {
    const direction = config.direction === "asc" ? 1 : -1;
    const next = [...records].sort((a, b) => (Number(readField(a, config.field)) - Number(readField(b, config.field))) * direction);
    return pass(next);
  }
  if (config.kind === "limit" || config.kind === "loop") return pass(records.slice(0, Math.max(0, config.count)), { count: Math.min(records.length, config.count) });
  if (config.kind === "dedupe") {
    const seen = new Set<string>();
    const next = records.filter((record) => {
      const key = (config.field === "canonicalEntityId" ? record.canonicalEntityId : readField(record, config.field)).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return pass(next);
  }
  if (config.kind === "map") {
    return pass(records.map((record) => ({ ...record, fields: { ...record.fields, [config.to]: record.fields[config.from] ?? "" } })));
  }
  if (config.kind === "merge" || config.kind === "dataset" || config.kind === "research" || config.kind === "search") return pass(records);
  if (config.kind === "rerun" || config.kind === "compare") return pass(records, { read: true, jobId: config.kind === "rerun" || config.kind === "compare" ? config.jobId : "" });
  if (config.kind === "enrich") {
    const missing = records.filter((record) => record.contactabilityStatus === "NONE" || record.contactabilityScore === 0);
    return pass(records, { missingContactPaths: missing.length, note: "Contact paths come from the research run. This node does not invent any." });
  }
  if (config.kind === "trust" || config.kind === "decision") {
    return pass(records.filter((record) => record.trustStatus === "HIGH_TRUST" || record.trustStatus === "MEDIUM_TRUST"));
  }
  if (config.kind === "contactability") {
    return pass(records.filter((record) => record.contactabilityStatus === "READY" || record.contactabilityStatus === "PARTIAL" || record.contactabilityScore >= config.min));
  }
  if (config.kind === "changes") return pass(records.filter((record) => record.change === "added" || record.change === "changed"));
  if (config.kind === "condition" || config.kind === "router" || config.kind === "branch") {
    const yes = records.filter((record) => matches(record, config));
    const yesIds = new Set(yes.map((record) => record.canonicalEntityId));
    const no = records.filter((record) => !yesIds.has(record.canonicalEntityId));
    return {
      status: "COMPLETED",
      output: {
        yes: yes.length,
        no: no.length,
        count: records.length,
        inputCount: records.length,
        outputCount: records.length,
        diagnostic: `Split ${records.length} records: ${yes.length} matched condition (Yes), ${no.length} did not match (No).`,
        sampleRecords: toSample(records),
      },
      recordsByHandle: { out: records, yes, no },
      error: null,
    };
  }
  if (config.kind === "delay") {
    if (records.length === 0) return pass([], { delayedDays: config.days, count: 0, inputCount: 0, outputCount: 0 });
    if (config.days > 0 && !input.skipDelays && !input.approvedNodeIds?.includes(node.id)) {
      return {
        status: "WAITING",
        output: {
          resumeInDays: config.days,
          count: records.length,
          inputCount: records.length,
          outputCount: records.length,
          diagnostic: `Waiting ${config.days} day(s) before continuing.`,
        },
        recordsByHandle: { out: records },
        error: null,
      };
    }
    return pass(records, { delayedDays: config.days, count: records.length });
  }
  if (config.kind === "approval") {
    if (records.length === 0) return pass([], { approval: "EMPTY", count: 0, inputCount: 0, outputCount: 0 });
    if (!input.approvedNodeIds?.includes(node.id)) {
      return {
        status: "WAITING",
        output: {
          approval: "PENDING",
          count: records.length,
          inputCount: records.length,
          outputCount: records.length,
          diagnostic: `Run paused. Waiting for human approval to process ${records.length} records.`,
          sampleRecords: toSample(records),
        },
        recordsByHandle: { out: records },
        error: null,
      };
    }
    return pass(records, {
      approval: "APPROVED",
      count: records.length,
      diagnostic: `Approved by user. Passing ${records.length} records to downstream actions.`,
    });
  }
  if (config.kind === "stop" || config.kind === "failure") {
    return {
      status: config.kind === "failure" ? "FAILED" : "COMPLETED",
      output: {
        stopped: true,
        count: 0,
        inputCount: records.length,
        outputCount: 0,
        diagnostic: config.kind === "failure" ? "Workflow halted as a failure." : "Workflow stopped.",
      },
      recordsByHandle: { out: [] },
      error: config.kind === "failure" ? "Stopped as a failure." : null,
    };
  }
  if (config.kind === "success") return pass(records, { success: true });
  if (config.kind === "log" || config.kind === "export") {
    const messages = records.slice(0, 10).map((r) => interpolate(config.message, r));
    return pass(records, {
      message: records.length ? interpolate(config.message, records[0] ?? emptyRecord()) : "No records to log.",
      messages,
      count: records.length,
    });
  }
  if (config.kind === "update" || config.kind === "annotate") {
    return pass(records, {
      field: config.field,
      value: config.value,
      count: records.length,
      ids: records.map((record) => record.canonicalEntityId),
      diagnostic: `Updated ${records.length} records: set ${config.field} to "${config.value}".`,
    });
  }
  if (OUTBOUND.has(config.kind) && (config.kind === "email" || config.kind === "whatsapp" || config.kind === "linkedin" || config.kind === "webhook" || config.kind === "http")) {
    const prior = ancestors(graph, node.id);
    const gates = graph.nodes.filter((item) => item.kind === "approval" && prior.has(item.id));
    const open = gates.length > 0 ? gates.every((gate) => input.approvedNodeIds?.includes(gate.id)) : Boolean(input.approvedNodeIds?.includes(node.id));
    if (!open) {
      if (records.length === 0) return pass([], { count: 0, dryRun: input.mode !== "live" });
      return {
        status: "WAITING",
        output: {
          blocked: "Human approval is required before any outbound action.",
          count: records.length,
          inputCount: records.length,
          outputCount: records.length,
          diagnostic: `Human approval is required before sending ${records.length} outbound message(s).`,
          sampleRecords: toSample(records),
        },
        recordsByHandle: { out: records },
        error: null,
      };
    }
    const previews: string[] = [];
    const keys: string[] = [];
    const addressed: AgentRecord[] = [];
    for (const record of records) {
      const to = "to" in config ? interpolate(config.to, record).trim() : "";
      const url = "url" in config ? config.url.trim() : "";
      if (!to && !url) continue;
      if (!allowSend()) {
        return {
          status: "FAILED",
          output: { rateLimited: true, count: addressed.length, inputCount: records.length, outputCount: addressed.length, diagnostic: "Outbound rate limit reached." },
          recordsByHandle: { out: [] },
          error: "The run reached its outbound rate limit.",
        };
      }
      const request: OutboundRequest = {
        kind: config.kind,
        to,
        subject: "subject" in config ? interpolate(config.subject, record) : "",
        body: interpolate(config.body, record),
        url: url || null,
        recordId: record.canonicalEntityId,
        dryRun: input.mode !== "live",
        idempotencyKey: `${node.id}:${record.canonicalEntityId}`,
      };
      const connector = input.connectors?.[config.kind] ?? mockConnector(config.kind, delivered);
      const result = await connector.deliver(request);
      if (!result.ok) throw new Error(result.error ?? "Connector failed.");
      addressed.push(record);
      previews.push(result.preview);
      keys.push(request.idempotencyKey);
    }
    return pass(addressed, {
      previews,
      keys,
      count: addressed.length,
      dryRun: input.mode !== "live",
      diagnostic: input.mode === "live"
        ? `Sent ${addressed.length} ${config.kind} message(s).`
        : `Dry run preview: Prepared ${addressed.length} ${config.kind} message(s). Nothing was sent.`,
    });
  }
  return pass(records);
}

function emptyRecord(): AgentRecord {
  return {
    canonicalEntityId: "",
    label: "",
    fields: {},
    status: "",
    confidence: 0,
    contactabilityScore: 0,
    contactabilityStatus: "NONE",
    trustScore: 0,
    trustStatus: "",
    change: "",
    sourceCount: 0,
  };
}

function sent(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
