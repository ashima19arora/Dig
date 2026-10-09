export type NodeKind =
  | "dataset"
  | "research"
  | "search"
  | "enrich"
  | "rerun"
  | "compare"
  | "select"
  | "filter"
  | "sort"
  | "dedupe"
  | "merge"
  | "map"
  | "limit"
  | "trust"
  | "decision"
  | "contactability"
  | "rank"
  | "changes"
  | "condition"
  | "router"
  | "branch"
  | "delay"
  | "loop"
  | "email"
  | "whatsapp"
  | "linkedin"
  | "webhook"
  | "http"
  | "export"
  | "update"
  | "annotate"
  | "log"
  | "approval"
  | "stop"
  | "success"
  | "failure";

export type CompareOp = "eq" | "neq" | "gte" | "lte" | "contains" | "exists";

export interface FilterConfig {
  field: string;
  op: CompareOp;
  value: string;
}

export type NodeConfig =
  | { kind: "dataset" | "research" | "search" | "rerun" | "compare"; jobId: string }
  | { kind: "enrich" }
  | ({ kind: "select" } & { ids: string[] })
  | ({ kind: "filter" | "condition" | "router" | "branch" } & FilterConfig)
  | { kind: "sort" | "rank"; field: string; direction: "asc" | "desc" }
  | { kind: "dedupe"; field: string }
  | { kind: "merge" | "changes" | "trust" | "decision" | "approval" | "stop" | "success" | "failure" }
  | { kind: "map"; from: string; to: string }
  | { kind: "limit" | "loop"; count: number }
  | { kind: "contactability"; min: number }
  | { kind: "delay"; days: number }
  | { kind: "email" | "whatsapp" | "linkedin"; to: string; subject: string; body: string; from?: string; provider?: string; senderName?: string }
  | { kind: "webhook" | "http"; url: string; body: string }
  | { kind: "export" | "log"; message: string }
  | { kind: "update" | "annotate"; field: string; value: string };

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  label: string;
  position: { x: number; y: number };
  config: NodeConfig;
  retry?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** yes and no split a condition. down is the bottom port and routes the same records as out. */
  sourceHandle?: "out" | "yes" | "no" | "down";
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface AgentRecord {
  canonicalEntityId: string;
  label: string;
  fields: Record<string, string>;
  status: string;
  confidence: number;
  /** 0–100. A missing contact path is 0, never a guessed address. */
  contactabilityScore: number;
  contactabilityStatus: string;
  trustScore: number;
  trustStatus: string;
  change: string;
  sourceCount: number;
}

export type RunStatus = "QUEUED" | "RUNNING" | "WAITING" | "BLOCKED" | "FAILED" | "CANCELLED" | "PARTIAL" | "COMPLETED";
export type NodeStatus = "QUEUED" | "RUNNING" | "WAITING" | "FAILED" | "SKIPPED" | "COMPLETED";

export interface NodeRunResult {
  nodeId: string;
  status: NodeStatus;
  startedAt: string;
  finishedAt: string;
  retryCount: number;
  error: string | null;
  output: unknown;
  recordsByHandle: Record<string, AgentRecord[]>;
}

export interface OutboundRequest {
  kind: "email" | "whatsapp" | "linkedin" | "webhook" | "http";
  to: string;
  subject: string;
  body: string;
  url: string | null;
  recordId: string;
  dryRun: boolean;
  idempotencyKey: string;
}

export interface ConnectorResult {
  ok: boolean;
  preview: string;
  error?: string;
}

export interface Connector {
  kind: OutboundRequest["kind"];
  deliver(request: OutboundRequest): Promise<ConnectorResult>;
}
