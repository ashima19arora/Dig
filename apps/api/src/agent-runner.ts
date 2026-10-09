import {
  executeGraph,
  mockConnector,
  workflowContact,
  type AgentRecord,
  type WorkflowGraph,
} from "@dig/core";
import type { Response } from "express";
import type { DigDb } from "./db.js";

const listeners = new Map<string, Set<Response>>();
const cancelFlags = new Map<string, { current: boolean }>();
const delivered = new Set<string>();

export function subscribeWorkflow(runId: string, res: Response) {
  const set = listeners.get(runId) ?? new Set<Response>();
  set.add(res);
  listeners.set(runId, set);
  res.on("close", () => set.delete(res));
}

function publish(db: DigDb, runId: string) {
  const payload = db.workflowRun(runId);
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of listeners.get(runId) ?? []) res.write(message);
}

export function requestWorkflowCancel(runId: string) {
  const flag = cancelFlags.get(runId) ?? { current: false };
  flag.current = true;
  cancelFlags.set(runId, flag);
}

export function startWorkflowRun(db: DigDb, runId: string, userId: string) {
  const flag = cancelFlags.get(runId) ?? { current: false };
  flag.current = false;
  cancelFlags.set(runId, flag);
  void runWorkflow(db, runId, flag, userId);
}

async function runWorkflow(db: DigDb, runId: string, flag: { current: boolean }, userId: string) {
  const run = db.workflowRun(runId);
  if (!run) return;
  const workflow = db.workflow(run.workflowId);
  if (!workflow) return;
  db.updateWorkflowRun(runId, "RUNNING");
  publish(db, runId);
  try {
    for (const nodeRun of run.nodeRuns) {
      const keys = (nodeRun.output as { keys?: string[] } | null)?.keys;
      if (Array.isArray(keys)) for (const key of keys) delivered.add(key);
    }
    const loaded = loadRecords(db, workflow.graph, workflow.workspaceId, userId);
    const approved = new Set(run.approvals.filter((item) => item.status === "APPROVED").map((item) => item.nodeId));
    const result = await executeGraph(workflow.graph, {
      records: loaded.records,
      mode: run.mode === "live" ? "live" : "dry",
      now: new Date().toISOString(),
      approvedNodeIds: [...approved],
      skipDelays: run.mode !== "live",
      cancelled: flag,
      connectors: {
        email: mockConnector("email", delivered),
        whatsapp: mockConnector("whatsapp", delivered),
        linkedin: mockConnector("linkedin", delivered),
        webhook: mockConnector("webhook", delivered),
        http: mockConnector("http", delivered),
      },
    });
    db.replaceWorkflowNodeRuns(
      runId,
      result.nodeRuns.map((item) => ({
        nodeId: item.nodeId,
        status: item.status,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
        output: item.output,
        error: item.error,
        retryCount: item.retryCount,
      })),
    );
    if (result.waitingNodeId) db.ensureApproval(runId, result.waitingNodeId);
    if (run.mode === "live" && loaded.job) applyRecordNotes(db, loaded.job, result.nodeRuns, userId);
    db.updateWorkflowRun(runId, flag.current ? "CANCELLED" : result.status, result.error);
  } catch (error) {
    db.updateWorkflowRun(runId, "FAILED", error instanceof Error ? error.message : "The workflow run failed.");
  }
  publish(db, runId);
}

function loadRecords(db: DigDb, graph: WorkflowGraph, workspaceId: string, userId: string) {
  const jobId = graph.nodes.find((node) => node.config.kind === "dataset" || node.config.kind === "rerun" || node.config.kind === "compare" || node.config.kind === "research" || node.config.kind === "search")?.config;
  const id = jobId && "jobId" in jobId ? jobId.jobId : "";
  const job = id ? db.job(id) : undefined;
  if (!job || job.workspaceId !== workspaceId) return { records: [] as AgentRecord[], job: undefined };
  const version = db.latestVersion(job.id);
  if (!version) return { records: [] as AgentRecord[], job };
  const diff = db.diffForLatest(job.id) as { added?: Array<{ canonicalEntityId: string }>; changed?: Array<{ canonicalEntityId: string }> } | null;
  const scope = db.outreachScope(job.id, job.blueprint.intent, userId);
  const outreach = db.outreach(scope);
  const records = db.recordsForVersion(version.id).map((record): AgentRecord => {
    const mark = outreach[record.canonicalEntityId];
    const change = diff?.added?.some((item) => item.canonicalEntityId === record.canonicalEntityId)
      ? "added"
      : diff?.changed?.some((item) => item.canonicalEntityId === record.canonicalEntityId)
        ? "changed"
        : "unchanged";
    const contact = workflowContact(record.fields, record.contactability);
    return {
      canonicalEntityId: record.canonicalEntityId,
      label: record.fields.company_name || record.fields.person_name || record.canonicalEntityId,
      fields: { ...record.fields, outreach_status: mark?.status ?? record.fields.outreach_status ?? "pending" },
      status: record.status,
      confidence: record.confidence,
      contactabilityScore: contact.score,
      contactabilityStatus: contact.status,
      trustScore: Math.round((record.trust?.overallTrust ?? 0) * 100),
      trustStatus: record.trust?.status ?? "",
      change,
      sourceCount: record.sourceCount,
    };
  });
  return { records, job };
}

function applyRecordNotes(db: DigDb, job: NonNullable<ReturnType<DigDb["job"]>>, nodeRuns: Array<{ status: string; output: unknown }>, userId: string) {
  for (const nodeRun of nodeRuns) {
    if (nodeRun.status !== "COMPLETED" || !nodeRun.output || typeof nodeRun.output !== "object") continue;
    const output = nodeRun.output as { field?: string; value?: string; ids?: string[] };
    if (!output.field || !output.ids || !["outreach_status", "note"].includes(output.field)) continue;
    const scope = db.outreachScope(job.id, job.blueprint.intent, userId);
    for (const id of output.ids) {
      const current = db.outreach(scope)[id] ?? { status: "pending", note: "" };
      db.setOutreach(
        scope,
        id,
        output.field === "note" ? { status: current.status, note: output.value ?? current.note } : { status: output.value ?? current.status, note: current.note },
        "workflow",
      );
    }
  }
}
