import { rmSync } from "node:fs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import * as XLSX from "xlsx";
import { ZodError } from "zod";
import {
  buildBlueprint,
  collectDemo,
  collectionPlan,
  renderCsv,
  renderReportHtml,
  suggestJobName,
  withLocation,
} from "@dig/core";
import {
  createJobSchema,
  duplicateJobSchema,
  previewBlueprintSchema,
  resolveConflictSchema,
  savedViewSchema,
  scheduleUpdateSchema,
  updateBlueprintSchema,
} from "@dig/schemas";
import { labelOf, DigDb } from "./db.js";
import { env } from "./env.js";
import { computeNextRun, executeJob, isRunning, requestCancel, subscribe } from "./runner.js";

const db = new DigDb();
const hits = new Map<string, { count: number; reset: number }>();

const DEMO_JOBS: Array<{ query: string; showcase: boolean }> = [
  { query: "Find active technology event sponsors in Delhi NCR", showcase: true },
  { query: "Find AI and ML job openings in India", showcase: true },
  { query: "Map the SaaS competitor landscape for project management tools", showcase: true },
  { query: "Find startup funding opportunities in India", showcase: true },
  { query: "Find enterprise AI vendors for analytics and machine learning", showcase: false },
  { query: "Find upcoming technology conferences in Delhi NCR", showcase: false },
  { query: "Find company profiles of Indian SaaS companies", showcase: false },
  { query: "Find sales leads at Indian SaaS companies", showcase: true },
  { query: "Find enterprise AI products for analytics", showcase: false },
  { query: "Map the market for enterprise AI platforms in India", showcase: false },
];

function requestIdOf(req: Request) {
  return (req as Request & { requestId?: string }).requestId ?? "";
}

function ok(res: Response, req: Request, data: unknown) {
  res.json({ success: true, data, requestId: requestIdOf(req) });
}

function fail(res: Response, req: Request, status: number, code: string, message: string, details: unknown = {}) {
  res.status(status).json({ success: false, error: { code, message, details }, requestId: requestIdOf(req) });
}

async function seed() {
  const { workspace, user } = db.ensureWorkspace();
  for (const spec of DEMO_JOBS) {
    const { blueprint } = buildBlueprint(spec.query);
    let existing = db.listJobs(workspace.id).find((job) => job.query === spec.query);
    if (existing && existing.intent !== blueprint.intent) {
      db.archive(existing.id, user.id);
      existing = undefined;
    }
    const name = suggestJobName(blueprint);
    if (existing && existing.name !== name && (existing.versionNumber ?? 0) <= 1 && !db.active(existing.id)) {
      db.updateBlueprint(existing.id, blueprint, name, user.id);
    }
    if (!existing) {
      const created = db.createJob({
        workspaceId: workspace.id,
        name,
        query: spec.query,
        blueprint,
        demo: true,
        actorId: user.id,
      });
      await executeJob(db, created.id, user.id, { pace: false });
      existing = db.listJobs(workspace.id).find((job) => job.id === created.id);
    }
    if (spec.showcase && existing && (existing.versionNumber ?? 0) < 2 && !db.active(existing.id)) {
      await executeJob(db, existing.id, user.id, { pace: false });
    }
  }
}

function changeFor(entityId: string, diff: { added?: Array<{ canonicalEntityId: string }>; changed?: Array<{ canonicalEntityId: string; conflictIds?: string[] }>; removed?: Array<{ canonicalEntityId: string }> } | null) {
  if (!diff) return "initial";
  if (diff.added?.some((item) => item.canonicalEntityId === entityId)) return "added";
  if (diff.changed?.some((item) => item.canonicalEntityId === entityId)) {
    const change = diff.changed.find((item) => item.canonicalEntityId === entityId);
    return change?.conflictIds?.length ? "conflict" : "changed";
  }
  return "unchanged";
}

function actor(resLocals: { userId: string }) {
  return resLocals.userId;
}

async function main() {
  const command = process.argv[2];
  if (command === "reset") {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${env.databasePath}${suffix}`, { force: true });
  }
  db.migrate();
  if (command === "migrate") {
    console.log("Schema is ready.");
    return;
  }
  if (command === "seed" || command === "reset") {
    await seed();
    console.log(command === "reset" ? "Demo reset." : "Seed complete.");
    return;
  }

  await seed();
  const { workspace, user } = db.ensureWorkspace();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const now = Date.now();
    const key = req.ip ?? "local";
    const bucket = hits.get(key);
    if (!bucket || bucket.reset < now) hits.set(key, { count: 1, reset: now + 60_000 });
    else {
      bucket.count += 1;
      if (bucket.count > 240) {
        fail(res, req, 429, "RATE_LIMITED", "Too many requests.");
        return;
      }
    }
    next();
  });

  app.get("/api/health", (req, res) => {
    ok(res, req, {
      ok: true,
      demo: env.demo,
      llm: env.llmEnabled ? env.llmProvider : "off",
      database: "sqlite",
      cost: "Not available",
    });
  });

  app.get("/api/session", (req, res) => {
    ok(res, req, { workspace, user });
  });

  app.post("/api/blueprints/preview", (req, res) => {
    const body = previewBlueprintSchema.parse(req.body);
    const built = body.blueprint ? { blueprint: body.blueprint, match: buildBlueprint(body.query).match } : buildBlueprint(body.query);
    const sample = collectDemo(built.blueprint, 1);
    const sources = new Set(sample.flatMap((record) => record.sources.map((source) => source.url))).size;
    ok(res, req, {
      blueprint: built.blueprint,
      match: built.match,
      name: suggestJobName(built.blueprint),
      plan: collectionPlan(built.blueprint, { records: Math.min(sample.length, env.maxRecords), sources }, env.llmEnabled),
      demo: env.demo,
    });
  });

  app.get("/api/jobs", (req, res) => {
    ok(res, req, { workspace, user, jobs: db.listJobs(workspace.id) });
  });

  app.post("/api/jobs", (req, res) => {
    const body = createJobSchema.parse(req.body);
    const built = body.blueprint ? { blueprint: body.blueprint } : buildBlueprint(body.query);
    const job = db.createJob({
      workspaceId: workspace.id,
      name: body.name ?? suggestJobName(built.blueprint),
      query: body.query,
      blueprint: built.blueprint,
      demo: body.live ? false : env.demo,
      actorId: user.id,
    });
    ok(res, req, { job });
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = db.job(req.params.id);
    if (!job || job.workspaceId !== workspace.id) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const version = db.latestVersion(job.id);
    ok(res, req, { job, version, progress: db.progress(job.id), runs: db.runs(job.id).slice(0, 12) });
  });

  app.patch("/api/jobs/:id/blueprint", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const body = updateBlueprintSchema.parse(req.body);
    db.updateBlueprint(job.id, body.blueprint, body.name ?? suggestJobName(body.blueprint), user.id);
    ok(res, req, { job: db.job(job.id) });
  });

  app.patch("/api/jobs/:id/schedule", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const body = scheduleUpdateSchema.parse(req.body);
    const schedule = { ...body, nextRunAt: computeNextRun(body) };
    db.setSchedule(job.id, schedule, user.id);
    ok(res, req, { schedule });
  });

  app.post("/api/jobs/:id/duplicate", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const body = duplicateJobSchema.parse(req.body ?? {});
    const blueprint = body.location ? withLocation(job.blueprint, body.location) : job.blueprint;
    const copy = db.createJob({
      workspaceId: workspace.id,
      name: body.name ?? suggestJobName(blueprint),
      query: blueprint.query,
      blueprint,
      demo: job.demo,
      actorId: user.id,
    });
    ok(res, req, { job: copy });
  });

  app.post("/api/jobs/:id/archive", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    db.archive(job.id, user.id);
    ok(res, req, { archived: true });
  });

  app.post("/api/jobs/:id/run", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    if (isRunning(job.id) || db.active(job.id)) return fail(res, req, 409, "ALREADY_RUNNING", "This collection is already running.");
    void executeJob(db, job.id, user.id);
    ok(res, req, { started: true, progress: db.progress(job.id) });
  });

  app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    requestCancel(job.id);
    db.audit(actor({ userId: user.id }), "job.cancelled", "job", job.id);
    ok(res, req, { cancelling: true });
  });

  app.get("/api/jobs/:id/stream", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(db.progress(job.id))}\n\n`);
    subscribe(job.id, res);
  });

  app.get("/api/jobs/:id/dataset", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const version = db.latestVersion(job.id);
    if (!version) return ok(res, req, { version: null, records: [], views: db.views(job.id) });
    const diff = db.diffForLatest(job.id);
    const records = db.recordsForVersion(version.id).map((record) => ({
      ...record,
      label: labelOf(record.fields),
      change: changeFor(record.canonicalEntityId, diff),
    }));
    ok(res, req, {
      version: {
        id: version.id,
        runId: version.run_id,
        versionNumber: version.version_number,
        createdAt: version.created_at,
        rowCount: version.row_count,
        sourceCount: version.source_count,
        status: version.status,
        qualityScore: version.quality_score,
        avgConfidence: version.avg_confidence,
      },
      records,
      views: db.views(job.id),
    });
  });

  app.get("/api/jobs/:id/diff", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    ok(res, req, { diff: db.diffForLatest(job.id) });
  });

  app.get("/api/jobs/:id/conflicts", (req, res) => {
    if (!db.job(req.params.id)) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    ok(res, req, { conflicts: db.conflicts(req.params.id) });
  });

  app.get("/api/jobs/:id/sources", (req, res) => {
    if (!db.job(req.params.id)) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    ok(res, req, { sources: db.sources(req.params.id) });
  });

  app.get("/api/jobs/:id/runs", (req, res) => {
    if (!db.job(req.params.id)) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    ok(res, req, { runs: db.runs(req.params.id), events: db.events(req.params.id) });
  });

  app.get("/api/jobs/:id/report", (req, res) => {
    if (!db.job(req.params.id)) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    ok(res, req, { report: db.report(req.params.id) });
  });

  app.get("/api/jobs/:id/records/:entity/history", (req, res) => {
    if (!db.job(req.params.id)) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    ok(res, req, { history: db.history(req.params.id, req.params.entity) });
  });

  app.post("/api/jobs/:id/views", (req, res) => {
    if (!db.job(req.params.id)) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const body = savedViewSchema.parse(req.body);
    ok(res, req, { view: db.saveView(req.params.id, body.name, body.filters) });
  });

  app.get("/api/jobs/:id/export", (req, res) => {
    const job = db.job(req.params.id);
    if (!job) return fail(res, req, 404, "NOT_FOUND", "Collection job not found.");
    const format = String(req.query.format ?? "csv");
    const version = db.latestVersion(job.id);
    if (!version) return fail(res, req, 404, "NOT_FOUND", "This job has no dataset yet.");
    const records = db.recordsForVersion(version.id);
    db.recordExport(job.id, version.id, format, user.id);
    const filename = `${job.name.replace(/[^\w]+/g, "-").toLowerCase()}-v${version.version_number}`;
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.json"`);
      res.json({ job: job.name, version: version.version_number, demo: job.demo, records });
      return;
    }
    if (format === "html") {
      const report = db.report(job.id);
      if (!report) return fail(res, req, 404, "NOT_FOUND", "No intelligence brief yet.");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.html"`);
      res.send(renderReportHtml(report));
      return;
    }
    if (format === "xlsx") {
      const rows = records.map((record) => ({
        record_id: record.canonicalEntityId,
        rank: record.rank,
        ...record.fields,
        confidence: record.confidence,
        activity_score: record.activityScore,
        status: record.status,
        source_url: record.fields.source_url,
        collected_at: record.evidence[0]?.collectedAt ?? "",
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Dataset");
      const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    res.send(renderCsv(records, job.blueprint.fields));
  });

  app.get("/api/conflicts", (req, res) => ok(res, req, { conflicts: db.conflicts() }));
  app.get("/api/sources", (req, res) => ok(res, req, { sources: db.sources() }));
  app.get("/api/datasets", (req, res) => ok(res, req, { datasets: db.datasets() }));
  app.get("/api/reports", (req, res) => ok(res, req, { reports: db.reports() }));

  app.post("/api/conflicts/:id/resolve", (req, res) => {
    const body = resolveConflictSchema.parse(req.body);
    const conflict = db.conflict(req.params.id);
    if (!conflict) return fail(res, req, 404, "NOT_FOUND", "Conflict not found.");
    if (conflict.status !== "PENDING") return fail(res, req, 409, "ALREADY_RESOLVED", "This conflict is already resolved.");
    ok(res, req, { conflict: db.resolveConflict(conflict.id, body.decision, user.id) });
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      fail(res, req, 400, "VALIDATION_ERROR", "Request did not match the schema.", { issues: error.issues });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    fail(res, req, 500, "INTERNAL", message);
  });

  // The background scheduler (re-running due scheduled jobs every 20s) is disabled: it has no UI and would
  // spend Tavily credits unattended. Schedules can still be saved; nothing runs them until this returns.

  app.listen(env.port, () => {
    console.log(`Dig API http://localhost:${env.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
