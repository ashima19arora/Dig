import { describe, expect, it, vi } from "vitest";
import { executeGraph, interpolate, mockConnector, templateError, validateGraph, workflowContact } from "./engine.js";
import { buildLensReport } from "./lens.js";
import { missionWorkflow, planMission, simulateMission } from "./mission.js";
import { workflowTemplates } from "./templates.js";
import type { AgentRecord, WorkflowGraph } from "./types.js";

const NOW = "2026-10-04T00:00:00.000Z";

function record(id: string, extra: Partial<AgentRecord> = {}): AgentRecord {
  return {
    canonicalEntityId: id,
    label: id,
    fields: { company_name: id, person_name: "Ada", email: `${id}@example.com`, outreach_status: "pending" },
    status: "verified",
    confidence: 0.9,
    contactabilityScore: 90,
    contactabilityStatus: "READY",
    trustScore: 88,
    trustStatus: "HIGH_TRUST",
    change: "unchanged",
    sourceCount: 2,
    ...extra,
  };
}

function graph(): WorkflowGraph {
  return {
    nodes: [
      { id: "data", kind: "dataset", label: "Dataset", position: { x: 0, y: 0 }, config: { kind: "dataset", jobId: "job" } },
      { id: "keep", kind: "filter", label: "Filter", position: { x: 0, y: 80 }, config: { kind: "filter", field: "status", op: "eq", value: "verified" } },
      { id: "top", kind: "limit", label: "Limit", position: { x: 0, y: 160 }, config: { kind: "limit", count: 1 } },
      { id: "ask", kind: "approval", label: "Approval", position: { x: 0, y: 240 }, config: { kind: "approval" } },
      { id: "mail", kind: "email", label: "Email", position: { x: 0, y: 320 }, config: { kind: "email", to: "{{record.email}}", subject: "Hello {{record.company}}", body: "Hi {{record.name}}" } },
      { id: "split", kind: "condition", label: "Interested", position: { x: 0, y: 400 }, config: { kind: "condition", field: "outreach_status", op: "eq", value: "interested" } },
      { id: "yes", kind: "log", label: "Yes", position: { x: 0, y: 480 }, config: { kind: "log", message: "yes {{record.company}}" } },
      { id: "no", kind: "log", label: "No", position: { x: 200, y: 480 }, config: { kind: "log", message: "no" } },
    ],
    edges: [
      { id: "e1", source: "data", target: "keep" },
      { id: "e2", source: "keep", target: "top" },
      { id: "e3", source: "top", target: "ask" },
      { id: "e4", source: "ask", target: "mail" },
      { id: "e5", source: "mail", target: "split" },
      { id: "e6", source: "split", target: "yes", sourceHandle: "yes" },
      { id: "e7", source: "split", target: "no", sourceHandle: "no" },
    ],
  };
}

describe("workflows", () => {
  it("rejects an unsafe template and a cycle", () => {
    expect(templateError("Hi {{record.name}}")).toBeNull();
    expect(templateError("{{process.exit()}}")).toBeTruthy();
    const cyclic: WorkflowGraph = {
      nodes: [
        { id: "a", kind: "log", label: "A", position: { x: 0, y: 0 }, config: { kind: "log", message: "a" } },
        { id: "b", kind: "log", label: "B", position: { x: 0, y: 40 }, config: { kind: "log", message: "b" } },
      ],
      edges: [
        { id: "1", source: "a", target: "b" },
        { id: "2", source: "b", target: "a" },
      ],
    };
    expect(validateGraph(cyclic).some((error) => error.message.includes("cycle"))).toBe(true);
  });

  it("interpolates record fields and drops unknown code", () => {
    expect(interpolate("Hi {{record.name}} at {{record.company}}", record("acme"))).toBe("Hi Ada at acme");
  });

  it("saves a runnable template and versions are just graphs", () => {
    const sponsor = workflowTemplates("job-1").find((item) => item.id === "sponsor-outreach");
    expect(sponsor?.graph.nodes.length).toBeGreaterThan(5);
    expect(validateGraph(sponsor?.graph ?? graph())).toEqual([]);
  });

  it("stops for approval and does not deliver email", async () => {
    const deliver = vi.fn(async () => ({ ok: true, preview: "sent" }));
    const result = await executeGraph(graph(), {
      records: [record("acme"), record("other", { status: "needs_review" })],
      mode: "live",
      now: NOW,
      connectors: { email: { kind: "email", deliver } },
    });
    expect(result.status).toBe("WAITING");
    expect(result.waitingNodeId).toBe("ask");
    expect(deliver).not.toHaveBeenCalled();
  });

  it("dry-run previews mail after approval and does not mark it live", async () => {
    const deliver = vi.fn(async (request: { dryRun: boolean; idempotencyKey: string }) => ({ ok: true, preview: request.dryRun ? "preview" : "sent" }));
    const result = await executeGraph(graph(), {
      records: [record("acme", { fields: { company_name: "acme", person_name: "Ada", email: "ada@acme.com", outreach_status: "pending" } })],
      mode: "dry",
      now: NOW,
      approvedNodeIds: ["ask"],
      connectors: { email: { kind: "email", deliver } },
    });
    expect(result.status).toBe("COMPLETED");
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]?.[0].dryRun).toBe(true);
    expect(result.nodeRuns.find((item) => item.nodeId === "no")?.status).toBe("COMPLETED");
    expect(result.nodeRuns.find((item) => item.nodeId === "yes")?.status).toBe("COMPLETED");
  });

  it("retries a failing connector and then isolates the failure", async () => {
    let calls = 0;
    const result = await executeGraph(
      {
        nodes: [
          { id: "data", kind: "dataset", label: "Dataset", position: { x: 0, y: 0 }, config: { kind: "dataset", jobId: "j" } },
          { id: "ask", kind: "approval", label: "Approval", position: { x: 0, y: 40 }, config: { kind: "approval" } },
          { id: "mail", kind: "email", label: "Email", position: { x: 0, y: 80 }, config: { kind: "email", to: "{{record.email}}", subject: "Hi", body: "Hi" }, retry: 1 },
          { id: "after", kind: "log", label: "After", position: { x: 0, y: 120 }, config: { kind: "log", message: "after" } },
        ],
        edges: [
          { id: "1", source: "data", target: "ask" },
          { id: "2", source: "ask", target: "mail" },
          { id: "3", source: "mail", target: "after" },
        ],
      },
      {
        records: [record("acme")],
        mode: "live",
        now: NOW,
        approvedNodeIds: ["ask"],
        connectors: {
          email: { kind: "email", deliver: async () => { calls += 1; return { ok: false, preview: "", error: "down" }; } },
        },
      },
    );
    expect(calls).toBe(2);
    expect(result.nodeRuns.find((item) => item.nodeId === "mail")?.status).toBe("FAILED");
    expect(result.nodeRuns.find((item) => item.nodeId === "after")?.status).toBe("SKIPPED");
    expect(result.status).toBe("PARTIAL");
  });

  it("cancels before later nodes and dedupes a second delivery", async () => {
    const seen = new Set<string>();
    const connector = mockConnector("email", seen);
    const first = await executeGraph(graph(), { records: [record("acme")], mode: "live", now: NOW, approvedNodeIds: ["ask"], connectors: { email: connector } });
    const second = await executeGraph(graph(), { records: [record("acme")], mode: "live", now: NOW, approvedNodeIds: ["ask"], connectors: { email: connector } });
    expect(first.status).toBe("COMPLETED");
    expect(second.nodeRuns.find((item) => item.nodeId === "mail")?.output).toMatchObject({ previews: ["Already delivered."] });
    const cancelled = await executeGraph(graph(), { records: [record("acme")], mode: "dry", now: NOW, cancelled: true });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.nodeRuns).toHaveLength(0);
  });

  it("keeps a published email through the contact step and ignores a disconnected step", async () => {
    expect(workflowContact({ email: "ada@acme.com" }, { score: 0, status: "NONE" }).status).toBe("READY");
    expect(workflowContact({}, { score: 0, status: "NONE" })).toEqual({ score: 0, status: "NONE" });
    const result = await executeGraph(
      {
        nodes: [
          { id: "data", kind: "dataset", label: "Dataset", position: { x: 0, y: 0 }, config: { kind: "dataset", jobId: "job" } },
          { id: "fit", kind: "contactability", label: "Contactable", position: { x: 0, y: 40 }, config: { kind: "contactability", min: 80 } },
          { id: "ask", kind: "approval", label: "Approval", position: { x: 0, y: 80 }, config: { kind: "approval" } },
          { id: "loose", kind: "log", label: "Not connected", position: { x: 200, y: 0 }, config: { kind: "log", message: "no" } },
        ],
        edges: [
          { id: "1", source: "data", target: "fit" },
          { id: "2", source: "fit", target: "ask" },
        ],
      },
      {
        records: [
          record("acme", { contactabilityScore: 17, contactabilityStatus: "READY" }),
          record("quiet", { fields: { company_name: "Quiet" }, contactabilityScore: 0, contactabilityStatus: "NONE" }),
        ],
        mode: "dry",
        now: NOW,
      },
    );
    expect(result.nodeRuns.map((item) => item.nodeId)).not.toContain("loose");
    expect(result.nodeRuns.find((item) => item.nodeId === "fit")?.output).toMatchObject({ count: 1 });
    expect(result.status).toBe("WAITING");
    expect(result.waitingNodeId).toBe("ask");
  });

  it("finishes a dry run when no row has an address, without calling the connector", async () => {
    const deliver = vi.fn(async () => ({ ok: true, preview: "sent" }));
    const result = await executeGraph(graph(), {
      records: [record("blank", { status: "needs_review", fields: { company_name: "Blank" } })],
      mode: "dry",
      now: NOW,
      connectors: { email: { kind: "email", deliver } },
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.nodeRuns.find((item) => item.nodeId === "ask")?.output).toMatchObject({ approval: "EMPTY", count: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("does not pause a wait step when no rows are left", async () => {
    const result = await executeGraph(
      {
        nodes: [
          { id: "data", kind: "dataset", label: "Dataset", position: { x: 0, y: 0 }, config: { kind: "dataset", jobId: "job" } },
          { id: "wait", kind: "delay", label: "Wait 3 days", position: { x: 0, y: 40 }, config: { kind: "delay", days: 3 } },
          { id: "note", kind: "log", label: "Log", position: { x: 0, y: 80 }, config: { kind: "log", message: "done" } },
        ],
        edges: [
          { id: "1", source: "data", target: "wait" },
          { id: "2", source: "wait", target: "note" },
        ],
      },
      { records: [], mode: "live", now: NOW, skipDelays: false },
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.waitingNodeId).toBeNull();
    expect(result.nodeRuns.find((item) => item.nodeId === "wait")?.output).toMatchObject({ count: 0 });
  });
});

describe("lens and mission", () => {
  it("computes metrics from records and stays quiet when nothing changed", () => {
    const report = buildLensReport({
      records: [record("acme"), record("blank", { contactabilityScore: 0, contactabilityStatus: "NONE", status: "needs_review", confidence: 0.4, fields: { company_name: "Blank" } })],
      added: 1,
      removed: 0,
      changed: 0,
      conflicts: 2,
      outreach: { pending: 1, interested: 1, declined: 0 },
      workflowRuns: { completed: 1, failed: 1 },
    });
    expect(report.summary.records).toBe(2);
    expect(report.summary.contactablePct).toBe(50);
    expect(report.signal).toBe("1 organization was added since the previous run.");
    expect(report.metrics.estimatedCost).toBeNull();
    expect(report.metrics.providerLatencyMs).toBeNull();
    expect(report.graph.nodes.some((node) => node.canonicalEntityId === "acme")).toBe(true);
    expect(report.comparison.comparable).toBe(false);
    const compared = buildLensReport({
      records: [record("acme"), record("blank", { contactabilityScore: 0, contactabilityStatus: "NONE", status: "needs_review", confidence: 0.4, fields: { company_name: "Blank" } })],
      added: 1,
      removed: 0,
      changed: 0,
      conflicts: 0,
      firstVersion: false,
      unchanged: 1,
      outreach: { pending: 0, interested: 0, declined: 0 },
      workflowRuns: { completed: 0, failed: 0 },
    });
    expect(compared.comparison.beforeRecords).toBe(1);
    expect(compared.comparison.afterRecords).toBe(2);
    expect(compared.comparison.net).toBe(1);
    const empty = buildLensReport({ records: [], added: 0, removed: 0, changed: 0, conflicts: 0, outreach: { pending: 0, interested: 0, declined: 0 }, workflowRuns: { completed: 0, failed: 0 } });
    expect(empty.signal).toBeNull();
    expect(empty.funnel[0]?.count).toBe(0);
  });

  it("plans a mission, generates a workflow, and simulates without sending", () => {
    const plan = planMission("Find 20 companies likely to sponsor our December hackathon");
    expect(plan.templateId).toBe("sponsor-outreach");
    const workflow = missionWorkflow(plan.templateId, "job-1");
    expect(workflow.graph.nodes.some((node) => node.kind === "approval")).toBe(true);
    expect(workflow.graph.nodes.some((node) => node.config.kind === "dataset" && node.config.jobId === "job-1")).toBe(true);
    const simulation = simulateMission([record("acme"), record("quiet", { fields: { company_name: "Quiet" }, contactabilityScore: 10 })], { minContactability: 85, limit: 10, requireEmail: true, conflicts: 1 });
    expect(simulation.candidates).toBe(1);
    expect(simulation.workflowVolume).toBe(1);
    expect(simulation.sends).toBe(false);
    expect(simulation.providerCalls).toBe(0);
  });

  it("makes no network call while executing a demo workflow", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await executeGraph(missionWorkflow("sponsor-outreach", "demo").graph, {
      records: [record("acme")],
      mode: "dry",
      now: NOW,
      skipDelays: true,
      approvedNodeIds: ["approval"],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.nodeRuns.some((item) => item.status === "FAILED")).toBe(false);
    vi.unstubAllGlobals();
  });
});
