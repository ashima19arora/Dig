import { rmSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import * as XLSX from "xlsx";
import { ZodError } from "zod";
import { buildBlueprint, renderCsv, suggestJobName } from "@dig/core";
import {
  createJobSchema,
  eventInputSchema,
  eventUpdateSchema,
  FOLDER_INTENTS,
  INTENT_LABELS,
  LIVE_INTENTS,
  loginSchema,
  outreachUpdateSchema,
  previewBlueprintSchema,
  profileUpdateSchema,
  renameJobSchema,
  resolveConflictSchema,
  signupSchema,
  type FolderKey,
  type IntentId,
} from "@dig/schemas";
import { currentAuth, endSession, hashPassword, requireAuth, startSession, verifyPassword, type AuthedRequest } from "./auth.js";
import { labelOf, DigDb } from "./db.js";
import { env } from "./env.js";
import { parseQuery } from "./intent-llm.js";
import { renderReport } from "./report.js";
import { executeJob, isRunning, requestCancel, subscribe } from "./runner.js";

const db = new DigDb();
const hits = new Map<string, { count: number; reset: number }>();
/** Per visitor. An open results page polls about 15 times a minute, so this leaves plenty of headroom. */
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 1200);

/** Fixture queries for the explicit `npm run db:seed` command only. They are never run on server start. */
const DEMO_JOBS: Array<{ query: string; showcase: boolean }> = [
  { query: "Find active technology event sponsors in Delhi NCR", showcase: true },
  { query: "Find AI and ML job openings in India", showcase: true },
  { query: "Find sales leads at Indian SaaS companies", showcase: true },
];

const SUPPORTED = new Set<IntentId>(LIVE_INTENTS);
const FOLDER_FOR = Object.fromEntries(Object.entries(FOLDER_INTENTS).map(([folder, intent]) => [intent, folder])) as Partial<Record<IntentId, FolderKey>>;
const SUPPORTED_TEXT = "Dig can research sponsors, judges & mentors, jobs, leads and competitors right now.";

function requestIdOf(req: Request) {
  return (req as Request & { requestId?: string }).requestId ?? "";
}

function ok(res: Response, req: Request, data: unknown) {
  res.json({ success: true, data, requestId: requestIdOf(req) });
}

function fail(res: Response, req: Request, status: number, code: string, message: string, details: unknown = {}) {
  res.status(status).json({ success: false, error: { code, message, details }, requestId: requestIdOf(req) });
}

function unsupported(res: Response, req: Request, intent: IntentId) {
  return fail(res, req, 422, "UNSUPPORTED_INTENT", `${INTENT_LABELS[intent]} isn’t supported yet. ${SUPPORTED_TEXT}`, { intent });
}

function authOf(req: Request) {
  return (req as AuthedRequest).auth;
}

/** The job, if it exists and belongs to the signed-in user's workspace. Sends a 404 otherwise. */
function ownJob(req: Request, res: Response) {
  const job = db.job(String(req.params.id));
  if (!job || job.workspaceId !== authOf(req).workspace.id) {
    fail(res, req, 404, "NOT_FOUND", "That search doesn’t exist or isn’t yours.");
    return undefined;
  }
  return job;
}

async function seed() {
  const { workspace, user } = db.ensureWorkspace();
  for (const spec of DEMO_JOBS) {
    const { blueprint } = buildBlueprint(spec.query);
    if (db.listJobs(workspace.id).some((job) => job.query === spec.query)) continue;
    const created = db.createJob({ workspaceId: workspace.id, name: suggestJobName(blueprint), query: spec.query, blueprint, demo: true, actorId: user.id });
    await executeJob(db, created.id, user.id, { pace: false });
    if (spec.showcase) await executeJob(db, created.id, user.id, { pace: false });
  }
}

function changeFor(entityId: string, diff: { added?: Array<{ canonicalEntityId: string }>; changed?: Array<{ canonicalEntityId: string; conflictIds?: string[] }> } | null) {
  if (!diff) return "initial";
  if (diff.added?.some((item) => item.canonicalEntityId === entityId)) return "added";
  const change = diff.changed?.find((item) => item.canonicalEntityId === entityId);
  if (change) return change.conflictIds?.length ? "conflict" : "changed";
  return "unchanged";
}

/** Reads the question with the LLM (keyword fallback) and builds the collection blueprint from it. */
async function planFor(query: string) {
  const parsed = await parseQuery(query);
  const { blueprint } = buildBlueprint(query, parsed.intent, parsed.entities);
  return { parsed, blueprint };
}

function createSearch(req: Request, blueprint: ReturnType<typeof buildBlueprint>["blueprint"], name?: string) {
  const { workspace, user } = authOf(req);
  return db.createJob({ workspaceId: workspace.id, name: name ?? suggestJobName(blueprint), query: blueprint.query, blueprint, demo: false, actorId: user.id });
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

  const app = express();
  // Behind Vercel's rewrite and Railway's router: trust X-Forwarded-* so req.ip is the visitor's own address
  // (not the proxy's — otherwise every user would share one rate-limit bucket) and req.secure reflects HTTPS.
  app.set("trust proxy", true);
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
      if (bucket.count > RATE_LIMIT_PER_MINUTE) {
        fail(res, req, 429, "RATE_LIMITED", "Too many requests — wait a moment and try again.");
        return;
      }
    }
    next();
  });

  app.get("/api/health", (req, res) => {
    ok(res, req, { ok: true, llm: env.llmEnabled ? env.llmProvider : "off", search: env.tavilyKey ? "tavily" : "missing", database: "sqlite" });
  });

  // ---------------------------------------------------------------------------
  // Accounts
  // ---------------------------------------------------------------------------

  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const body = signupSchema.parse(req.body);
      if (db.userByEmail(body.email)) {
        return fail(res, req, 409, "EMAIL_TAKEN", "An account with this email already exists — log in instead.", { field: "email" });
      }
      const { user } = db.createUser({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password) });
      startSession(db, req, res, user.id);
      ok(res, req, { user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const user = db.userByEmail(body.email);
      const valid = await verifyPassword(body.password, user?.password_hash ?? null);
      if (!user || !valid) return fail(res, req, 401, "BAD_CREDENTIALS", "Incorrect email or password.", { field: "password" });
      startSession(db, req, res, user.id);
      ok(res, req, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    endSession(db, req, res);
    ok(res, req, { loggedOut: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const auth = currentAuth(db, req);
    if (!auth) return fail(res, req, 401, "UNAUTHENTICATED", "You’re not logged in.");
    ok(res, req, auth);
  });

  // Everything below needs a signed-in user.
  app.use("/api", requireAuth(db, (req, res) => fail(res, req, 401, "UNAUTHENTICATED", "Your session has ended — log in again.")));

  app.patch("/api/auth/me", (req, res) => {
    const body = profileUpdateSchema.parse(req.body);
    db.updateUser(authOf(req).user.id, body);
    ok(res, req, currentAuth(db, req));
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  app.get("/api/events", (req, res) => {
    ok(res, req, { events: db.listEvents(authOf(req).user.id) });
  });

  app.post("/api/events", (req, res) => {
    const body = eventInputSchema.parse(req.body);
    ok(res, req, { event: db.createEvent(authOf(req).user.id, body) });
  });

  app.patch("/api/events/:id", (req, res) => {
    const body = eventUpdateSchema.parse(req.body);
    for (const jobId of Object.values(body.jobs ?? {})) {
      const job = jobId ? db.job(jobId) : null;
      if (jobId && (!job || job.workspaceId !== authOf(req).workspace.id)) return fail(res, req, 404, "NOT_FOUND", "That search doesn’t exist or isn’t yours.");
    }
    const event = db.updateEvent(req.params.id, authOf(req).user.id, body);
    if (!event) return fail(res, req, 404, "NOT_FOUND", "That event doesn’t exist or isn’t yours.");
    ok(res, req, { event });
  });

  /** Reads the question, creates the search, files it in the event folder for its intent, and starts it. */
  app.post("/api/events/:id/searches", async (req, res, next) => {
    try {
      const user = authOf(req).user;
      if (!db.eventFor(req.params.id, user.id)) return fail(res, req, 404, "NOT_FOUND", "That event doesn’t exist or isn’t yours.");
      const body = createJobSchema.parse(req.body);
      const { blueprint } = await planFor(body.query);
      const folder = FOLDER_FOR[blueprint.intent];
      if (!SUPPORTED.has(blueprint.intent) || !folder) return unsupported(res, req, blueprint.intent);
      const job = createSearch(req, blueprint, body.name);
      const event = db.updateEvent(req.params.id, user.id, { jobs: { [folder]: job.id }, touched: true });
      void executeJob(db, job.id, user.id);
      ok(res, req, { job, folder, event });
    } catch (error) {
      next(error);
    }
  });

  // ---------------------------------------------------------------------------
  // Searches (jobs)
  // ---------------------------------------------------------------------------

  app.post("/api/blueprints/preview", async (req, res, next) => {
    try {
      const body = previewBlueprintSchema.parse(req.body);
      const { parsed, blueprint } = await planFor(body.query);
      ok(res, req, {
        intent: blueprint.intent,
        label: INTENT_LABELS[blueprint.intent],
        supported: SUPPORTED.has(blueprint.intent),
        folder: FOLDER_FOR[blueprint.intent] ?? null,
        method: parsed.method,
        confidence: parsed.confidence,
        entities: blueprint.entities,
        name: suggestJobName(blueprint),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs", (req, res) => {
    ok(res, req, { jobs: db.listJobs(authOf(req).workspace.id) });
  });

  app.post("/api/jobs", async (req, res, next) => {
    try {
      const body = createJobSchema.parse(req.body);
      const { blueprint } = await planFor(body.query);
      if (!SUPPORTED.has(blueprint.intent)) return unsupported(res, req, blueprint.intent);
      ok(res, req, { job: createSearch(req, blueprint, body.name) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    ok(res, req, { job, version: db.latestVersion(job.id), progress: db.progress(job.id) });
  });

  app.patch("/api/jobs/:id", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    const body = renameJobSchema.parse(req.body);
    db.renameJob(job.id, body.name, authOf(req).user.id);
    ok(res, req, { job: db.job(job.id) });
  });

  app.post("/api/jobs/:id/run", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    if (!SUPPORTED.has(job.blueprint.intent)) return unsupported(res, req, job.blueprint.intent);
    if (isRunning(job.id) || db.active(job.id)) return fail(res, req, 409, "ALREADY_RUNNING", "This search is already running.");
    void executeJob(db, job.id, authOf(req).user.id);
    ok(res, req, { started: true, progress: db.progress(job.id) });
  });

  app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    requestCancel(job.id);
    ok(res, req, { cancelling: true });
  });

  app.get("/api/jobs/:id/stream", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(db.progress(job.id))}\n\n`);
    subscribe(job.id, res);
  });

  app.get("/api/jobs/:id/dataset", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    const version = db.latestVersion(job.id);
    if (!version) return ok(res, req, { version: null, records: [] });
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
    });
  });

  app.get("/api/jobs/:id/diff", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    ok(res, req, { diff: db.diffForLatest(job.id) });
  });

  app.get("/api/jobs/:id/conflicts", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    ok(res, req, { conflicts: db.conflicts(job.id) });
  });

  app.get("/api/jobs/:id/export", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    const format = String(req.query.format ?? "csv");
    const version = db.latestVersion(job.id);
    if (!version) return fail(res, req, 404, "NOT_FOUND", "This search has no results yet — run it first.");
    // Exports carry the team's outreach marks alongside each result.
    const outreach = db.outreach(db.outreachScope(job.id, job.blueprint.intent, authOf(req).user.id));
    const records = db.recordsForVersion(version.id).map((record) => {
      const mark = outreach[record.canonicalEntityId];
      return mark ? { ...record, fields: { ...record.fields, outreach_status: mark.status, outreach_note: mark.note } } : record;
    });
    const exportFields = [...job.blueprint.fields, "outreach_status", "outreach_note"];
    db.recordExport(job.id, version.id, format, authOf(req).user.id);
    const filename = `${job.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "dig"}-v${version.version_number}`;
    if (format === "report") {
      if (!SUPPORTED.has(job.blueprint.intent)) return unsupported(res, req, job.blueprint.intent);
      const conflicts = db.conflicts(job.id).filter((conflict) => conflict.runId === version.run_id);
      const markdown = renderReport({
        job,
        version: {
          versionNumber: version.version_number,
          createdAt: version.created_at,
          qualityScore: version.quality_score,
          avgConfidence: version.avg_confidence,
        },
        records,
        conflicts,
      });
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}-report.md"`);
      res.send(markdown);
      return;
    }
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.json"`);
      res.json({ search: job.name, query: job.query, intent: job.blueprint.intent, version: version.version_number, records });
      return;
    }
    if (format === "xlsx") {
      const rows = records.map((record) => ({
        rank: record.rank,
        ...Object.fromEntries(exportFields.map((field) => [field, record.fields[field] ?? ""])),
        confidence: record.confidence,
        activity_score: record.activityScore,
        status: record.status,
        sources: record.sources.map((source) => source.url).join(" "),
      }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Dataset");
      const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
      return;
    }
    if (format !== "csv") return fail(res, req, 400, "BAD_FORMAT", "Export format must be csv, xlsx, json or report.");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    res.send(renderCsv(records, exportFields));
  });

  app.get("/api/jobs/:id/outreach", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    const scope = db.outreachScope(job.id, job.blueprint.intent, authOf(req).user.id);
    ok(res, req, { outreach: db.outreach(scope) });
  });

  app.put("/api/jobs/:id/outreach/:entity", (req, res) => {
    const job = ownJob(req, res);
    if (!job) return;
    const body = outreachUpdateSchema.parse(req.body);
    const scope = db.outreachScope(job.id, job.blueprint.intent, authOf(req).user.id);
    ok(res, req, { entity: req.params.entity, outreach: db.setOutreach(scope, req.params.entity, body, authOf(req).user.id) });
  });

  app.post("/api/conflicts/:id/resolve", (req, res) => {
    const body = resolveConflictSchema.parse(req.body);
    const conflict = db.conflict(req.params.id);
    const job = conflict ? db.job(conflict.jobId) : undefined;
    if (!conflict || !job || job.workspaceId !== authOf(req).workspace.id) return fail(res, req, 404, "NOT_FOUND", "Conflict not found.");
    if (conflict.status !== "PENDING") return fail(res, req, 409, "ALREADY_RESOLVED", "This conflict is already resolved.");
    ok(res, req, { conflict: db.resolveConflict(conflict.id, body.decision, authOf(req).user.id) });
  });

  app.use("/api", (req, res) => fail(res, req, 404, "NOT_FOUND", "No such API route."));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      fail(res, req, 400, "VALIDATION_ERROR", issue?.message ?? "Some fields are missing or invalid.", { field: issue?.path[0] ?? null, issues: error.issues });
      return;
    }
    console.error("[api]", error);
    fail(res, req, 500, "INTERNAL", "Something went wrong on our side. Please try again.");
  });

  app.listen(env.port, () => {
    console.log(`Dig API http://localhost:${env.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
