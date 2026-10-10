import {
  buildLensReport,
  missionStarters,
  missionWorkflow,
  planMission,
  simulateMission,
  validateGraph,
  workflowTemplates,
  type AgentRecord,
  type PublishedRecord,
  type WorkflowGraph,
} from "@dig/core";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requestWorkflowCancel, startWorkflowRun, subscribeWorkflow } from "./agent-runner.js";
import type { DigDb } from "./db.js";

const graphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    label: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    config: z.object({ kind: z.string() }).passthrough(),
    retry: z.number().optional(),
  })),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), sourceHandle: z.enum(["out", "yes", "no", "down"]).optional() })),
});

function bindDataset(graph: WorkflowGraph, job: { id: string; name: string } | undefined): WorkflowGraph {
  if (!job) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const kind = node.config.kind;
      if (kind !== "dataset" && kind !== "research" && kind !== "search" && kind !== "rerun" && kind !== "compare") return node;
      return { ...node, label: job.name, config: { ...node.config, jobId: job.id } };
    }),
  };
}

function toAgentRecord(record: PublishedRecord): AgentRecord {
  const hasPath = Boolean(
    record.contactability?.score ||
    record.fields.email ||
    record.fields.phone ||
    record.fields.linkedin ||
    record.fields.github ||
    record.fields.website ||
    record.fields.domain ||
    record.fields.apply_url ||
    record.fields.url
  );
  return {
    canonicalEntityId: record.canonicalEntityId,
    label:
      record.fields.company_name ||
      record.fields.person_name ||
      record.fields.organization ||
      record.fields.vendor ||
      record.fields.name ||
      record.canonicalEntityId,
    fields: record.fields,
    status: record.status,
    confidence: record.confidence,
    contactabilityScore: record.contactability ? Math.round(record.contactability.score * 100) : hasPath ? 75 : 0,
    contactabilityStatus: record.contactability?.status ?? (hasPath ? "PARTIAL" : "NONE"),
    trustScore: record.trust ? Math.round(record.trust.overallTrust * 100) : 0,
    trustStatus: record.trust?.status ?? "",
    change: "unchanged",
    sourceCount: record.sourceCount,
  };
}

export function mountAgents(
  app: Express,
  db: DigDb,
  http: {
    ok: (res: Response, req: Request, data: unknown) => void;
    fail: (res: Response, req: Request, status: number, code: string, message: string) => void;
    authOf: (req: Request) => { user: { id: string }; workspace: { id: string } };
  },
) {
  const { ok, fail, authOf } = http;

  const ownWorkflow = (req: Request, res: Response) => {
    const workflow = db.workflow(req.params.id);
    if (!workflow || workflow.workspaceId !== authOf(req).workspace.id) {
      fail(res, req, 404, "NOT_FOUND", "That workflow doesn’t exist or isn’t yours.");
      return undefined;
    }
    return workflow;
  };

  app.get("/api/agents/power", (req, res) => {
    ok(res, req, {
      email: db.connectorPowered(authOf(req).workspace.id, "email"),
      whatsapp: db.connectorPowered(authOf(req).workspace.id, "whatsapp"),
      linkedin: db.connectorPowered(authOf(req).workspace.id, "linkedin"),
    });
  });

  app.put("/api/agents/power", (req, res) => {
    const body = z.object({
      provider: z.enum(["email", "whatsapp", "linkedin"]).default("email"),
      apiKey: z.string().max(4000),
    }).parse(req.body ?? {});
    const apiKey = body.apiKey.trim();
    if (apiKey && apiKey.length < 4) return fail(res, req, 400, "INVALID", "Use a valid key or credentials, or leave it blank to clear.");
    const connected = db.saveConnectorKey({ workspaceId: authOf(req).workspace.id, provider: body.provider, secret: apiKey, actorId: authOf(req).user.id });
    ok(res, req, {
      provider: body.provider,
      connected,
      email: db.connectorPowered(authOf(req).workspace.id, "email"),
      whatsapp: db.connectorPowered(authOf(req).workspace.id, "whatsapp"),
      linkedin: db.connectorPowered(authOf(req).workspace.id, "linkedin"),
    });
  });

  app.get("/api/agents/templates", (req, res) => {
    ok(res, req, { workflows: workflowTemplates().map(({ graph: _graph, ...item }) => item), missions: missionStarters() });
  });

  app.get("/api/workflows", (req, res) => {
    ok(res, req, { workflows: db.listWorkflows(authOf(req).workspace.id) });
  });

  app.post("/api/workflows", (req, res) => {
    const body = z.object({ name: z.string().trim().min(1).max(120), templateId: z.string().optional(), jobId: z.string().optional(), graph: graphSchema.optional() }).parse(req.body);
    const job = body.jobId ? db.job(body.jobId) : undefined;
    if (body.jobId && (!job || job.workspaceId !== authOf(req).workspace.id)) return fail(res, req, 404, "NOT_FOUND", "That dataset doesn’t exist or isn’t yours.");

    // Avoid duplicate workflows: if an unused workflow for this template exists, reuse it
    if (body.templateId) {
      const unused = db.findUnusedTemplateWorkflow(authOf(req).workspace.id, body.templateId);
      if (unused) {
        if (job) {
          const updatedGraph = bindDataset(unused.graph, job);
          db.saveWorkflow(unused.id, { graph: updatedGraph, actorId: authOf(req).user.id });
        }
        return ok(res, req, { workflow: db.workflow(unused.id), reused: true });
      }
    }

    // Disambiguate name if identical name already exists in workspace
    const existingSameNameCount = db.countWorkflowsByNamePrefix(authOf(req).workspace.id, body.name);
    let finalName = body.name;
    if (existingSameNameCount > 0) {
      finalName = `${body.name} (${existingSameNameCount + 1})`;
    }

    const template = body.templateId ? workflowTemplates(body.jobId ?? "").find((item) => item.id === body.templateId) : undefined;
    const graph = bindDataset((body.graph as WorkflowGraph | undefined) ?? template?.graph ?? { nodes: [], edges: [] }, job);
    const workflow = db.createWorkflow({
      workspaceId: authOf(req).workspace.id,
      name: finalName,
      templateId: body.templateId ?? null,
      graph,
      actorId: authOf(req).user.id,
    });
    ok(res, req, { workflow });
  });

  app.delete("/api/workflows/:id", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow) return;
    const deleted = db.deleteWorkflow(workflow.id, authOf(req).workspace.id);
    ok(res, req, { deleted, id: workflow.id });
  });

  app.get("/api/workflows/:id", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow) return;
    const latestRun = db.latestWorkflowRun(workflow.id);
    ok(res, req, { workflow, latestRun, validation: validateGraph(workflow.graph) });
  });

  app.put("/api/workflows/:id", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow) return;
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), graph: graphSchema }).parse(req.body);
    const saved = db.saveWorkflow(workflow.id, { name: body.name, graph: body.graph as WorkflowGraph, actorId: authOf(req).user.id });
    ok(res, req, { workflow: saved, validation: validateGraph(saved?.graph ?? workflow.graph) });
  });

  app.post("/api/workflows/:id/runs", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow?.versionId) return fail(res, req, 409, "EMPTY", "Save the workflow before running it.");
    const body = z.object({
      mode: z.enum(["dry", "live"]).default("dry"),
      autoApprove: z.boolean().optional(),
    }).parse(req.body ?? {});
    const problems = validateGraph(workflow.graph);
    if (problems.length) return fail(res, req, 400, "INVALID_WORKFLOW", problems[0]?.message ?? "The workflow is not valid.");
    const run = db.createWorkflowRun({
      workflowId: workflow.id,
      versionId: workflow.versionId,
      workspaceId: workflow.workspaceId,
      mode: body.mode,
      actorId: authOf(req).user.id,
    });
    if (body.autoApprove) {
      for (const node of workflow.graph.nodes) {
        if (node.kind === "approval") {
          const id = db.ensureApproval(run.id, node.id);
          db.decideApproval(id, "APPROVED", authOf(req).user.id);
        }
      }
    }
    startWorkflowRun(db, run.id, authOf(req).user.id);
    ok(res, req, { run: db.workflowRun(run.id) });
  });

  app.get("/api/workflows/:id/runs/:runId", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow) return;
    const run = db.workflowRun(req.params.runId);
    if (!run || run.workflowId !== workflow.id) return fail(res, req, 404, "NOT_FOUND", "That run doesn’t exist.");
    ok(res, req, { run });
  });

  app.post("/api/workflows/:id/runs/:runId/cancel", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow) return;
    const run = db.workflowRun(req.params.runId);
    if (!run || run.workflowId !== workflow.id) return fail(res, req, 404, "NOT_FOUND", "That run doesn’t exist.");
    requestWorkflowCancel(run.id);
    db.updateWorkflowRun(run.id, "CANCELLED");
    ok(res, req, { run: db.workflowRun(run.id) });
  });

  app.post("/api/workflows/:id/runs/:runId/approvals/:approvalId", (req, res) => {
    const workflow = ownWorkflow(req, res);
    if (!workflow) return;
    const run = db.workflowRun(req.params.runId);
    if (!run || run.workflowId !== workflow.id) return fail(res, req, 404, "NOT_FOUND", "That run doesn’t exist.");
    const body = z.object({ status: z.enum(["APPROVED", "REJECTED"]) }).parse(req.body);
    const approval = run.approvals.find((item) => item.id === req.params.approvalId);
    if (!approval) return fail(res, req, 404, "NOT_FOUND", "That approval doesn’t exist.");
    db.decideApproval(approval.id, body.status, authOf(req).user.id);
    if (body.status === "APPROVED") startWorkflowRun(db, run.id, authOf(req).user.id);
    else db.updateWorkflowRun(run.id, "CANCELLED", "The approval was declined.");
    ok(res, req, { run: db.workflowRun(run.id) });
  });

  app.get("/api/workflows/:id/runs/:runId/stream", (req, res) => {
    const workflow = db.workflow(req.params.id);
    const run = workflow ? db.workflowRun(req.params.runId) : undefined;
    if (!workflow || workflow.workspaceId !== authOf(req).workspace.id || !run || run.workflowId !== workflow.id) {
      fail(res, req, 404, "NOT_FOUND", "That run doesn’t exist.");
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(run)}\n\n`);
    subscribeWorkflow(run.id, res);
  });

  app.get("/api/agents/lens", (req, res) => {
    const jobs = db.listJobs(authOf(req).workspace.id);
    const jobId = String(req.query.jobId ?? "");
    const job = jobs.find((item) => item.id === jobId);
    if (!jobId || !job) return ok(res, req, { jobs: jobs.map((item) => ({ id: item.id, name: item.name, rowCount: item.rowCount, demo: item.demo })), report: null });
    const version = db.latestVersion(job.id);
    const records = version ? db.recordsForVersion(version.id) : [];
    const diff = db.diffForLatest(job.id) as { firstVersion?: boolean; added?: unknown[]; removed?: unknown[]; changed?: unknown[]; unchanged?: unknown[] } | null;
    const conflicts = db.conflicts(job.id).filter((conflict) => conflict.status === "PENDING").length;
    const scope = db.outreachScope(job.id, job.blueprint.intent, authOf(req).user.id);
    const outreach = db.outreach(scope);
    const marks = Object.values(outreach);
    const report = buildLensReport({
      records: records.map((record) => toAgentRecord(record)),
      added: diff?.added?.length ?? 0,
      removed: diff?.removed?.length ?? 0,
      changed: diff?.changed?.length ?? 0,
      conflicts,
      firstVersion: !diff || Boolean(diff.firstVersion),
      unchanged: diff?.unchanged?.length ?? 0,
      outreach: {
        pending: marks.filter((mark) => mark.status === "pending").length,
        interested: marks.filter((mark) => mark.status === "interested").length,
        declined: marks.filter((mark) => mark.status === "declined").length,
        waiting: marks.filter((mark) => mark.status === "waiting").length,
      },
      workflowRuns: db.workflowRunCounts(authOf(req).workspace.id),
    });
    ok(res, req, { jobs: jobs.map((item) => ({ id: item.id, name: item.name, rowCount: item.rowCount, demo: item.demo })), jobId: job.id, report });
  });

  app.get("/api/agents/missions", (req, res) => {
    ok(res, req, { missions: db.listMissions(authOf(req).workspace.id), starters: missionStarters() });
  });

  app.post("/api/agents/missions", (req, res) => {
    const body = z.object({ objective: z.string().trim().min(3).max(500), jobId: z.string().optional() }).parse(req.body);
    const job = body.jobId ? db.job(body.jobId) : undefined;
    if (body.jobId && (!job || job.workspaceId !== authOf(req).workspace.id)) return fail(res, req, 404, "NOT_FOUND", "That dataset doesn’t exist or isn’t yours.");
    const plan = planMission(body.objective);
    const template = missionWorkflow(plan.templateId, body.jobId ?? "");
    const existingSameNameCount = db.countWorkflowsByNamePrefix(authOf(req).workspace.id, plan.title);
    const wfName = existingSameNameCount > 0 ? `${plan.title} (${existingSameNameCount + 1})` : plan.title;
    const workflow = db.createWorkflow({
      workspaceId: authOf(req).workspace.id,
      name: wfName,
      templateId: plan.templateId,
      graph: bindDataset(template.graph, job),
      actorId: authOf(req).user.id,
    });
    const mission = db.createMission({
      workspaceId: authOf(req).workspace.id,
      title: plan.title,
      objective: body.objective,
      plan,
      workflowId: workflow.id,
      datasetJobId: body.jobId ?? null,
      actorId: authOf(req).user.id,
    });
    ok(res, req, { mission, workflow });
  });

  app.get("/api/agents/missions/:id", (req, res) => {
    const mission = db.mission(req.params.id);
    if (!mission || mission.workspaceId !== authOf(req).workspace.id) return fail(res, req, 404, "NOT_FOUND", "That mission doesn’t exist or isn’t yours.");
    const latestRun = mission.workflowId ? db.latestWorkflowRun(mission.workflowId) : undefined;
    ok(res, req, { mission, latestRun });
  });

  app.post("/api/agents/missions/:id/simulate", (req, res) => {
    const mission = db.mission(req.params.id);
    if (!mission || mission.workspaceId !== authOf(req).workspace.id) return fail(res, req, 404, "NOT_FOUND", "That mission doesn’t exist or isn’t yours.");
    const body = z.object({ minContactability: z.number().optional(), limit: z.number().int().positive().optional(), requireEmail: z.boolean().optional() }).parse(req.body ?? {});
    const job = mission.datasetJobId ? db.job(mission.datasetJobId) : undefined;
    const version = job ? db.latestVersion(job.id) : undefined;
    const records = version && job && job.workspaceId === mission.workspaceId ? db.recordsForVersion(version.id) : [];
    const conflicts = job ? db.conflicts(job.id).filter((conflict) => conflict.status === "PENDING").length : 0;
    const simulation = simulateMission(records.map((record) => toAgentRecord(record)), { ...body, conflicts });
    ok(res, req, { simulation });
  });
}
