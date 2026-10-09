import { collectDemo, runPipeline, stagePercent, type CollectedRecord } from "@dig/core";
import type { Response } from "express";
import { collectLive } from "./collect-live.js";
import { enrichCollected } from "./enrich.js";
import { jevConflictProvider } from "./jev-client.js";
import { emptyProgress, type Progress, type DigDb } from "./db.js";
import { env } from "./env.js";

const listeners = new Map<string, Set<Response>>();

/** A live search that hasn't finished by now is failed with a clear message rather than left hanging. */
const RUN_TIMEOUT_MS = 180_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("This search took longer than 3 minutes and was stopped. The web sources may be slow right now — try again.")),
      ms,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
const running = new Set<string>();
const cancelled = new Set<string>();

export function subscribe(jobId: string, res: Response) {
  const set = listeners.get(jobId) ?? new Set<Response>();
  set.add(res);
  listeners.set(jobId, set);
  res.on("close", () => {
    set.delete(res);
  });
}

function publish(db: DigDb, jobId: string) {
  const payload = db.progress(jobId);
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of listeners.get(jobId) ?? []) res.write(message);
}

export function requestCancel(jobId: string) {
  cancelled.add(jobId);
}

export function isRunning(jobId: string) {
  return running.has(jobId);
}

export function computeNextRun(input: {
  enabled: boolean;
  cadence: "daily" | "weekly";
  weekday: number | null;
  hour: number;
}) {
  if (!input.enabled) return null;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  for (let step = 0; step < 24 * 8; step += 1) {
    const candidate = new Date(start.getTime() + step * 3_600_000);
    if (candidate.getHours() !== input.hour) continue;
    if (input.cadence === "weekly" && candidate.getDay() !== (input.weekday ?? 1)) continue;
    return candidate.toISOString();
  }
  return null;
}


export async function executeJob(db: DigDb, jobId: string, actorId: string, options?: { pace?: boolean }) {
  if (running.has(jobId)) return;
  const job = db.job(jobId);
  if (!job) return;
  running.add(jobId);
  cancelled.delete(jobId);
  const runNumber = db.nextRunNumber(jobId);
  const runId = db.createRun(jobId, runNumber);
  const previousStatus = job.status;
  db.setStatus(jobId, "QUEUED", previousStatus, runId, { runNumber });
  publish(db, jobId);
  const pace = options?.pace === false ? 0 : job.demo ? env.pacingMs : 0;
  try {
    const now = new Date();
    let collected: CollectedRecord[];
    if (job.demo) {
      collected = collectDemo(job.blueprint, runNumber, job.blueprint.entities.location);
    } else {
      // Live collection is the long part of a run (~1 min): surface it instead of sitting in QUEUED.
      db.setStatus(jobId, "COLLECTING", "QUEUED", runId, { runNumber });
      publish(db, jobId);
      collected = await withTimeout(collectLive(job.blueprint, now.toISOString()), RUN_TIMEOUT_MS);
    }
    // Keep the best-corroborated results when a run finds more than the cap.
    collected = [...collected].sort((a, b) => b.sources.length - a.sources.length).slice(0, env.resultCap);
    try {
      collected = await enrichCollected(collected, {
        demo: job.demo,
        now: now.toISOString(),
        onStage: (stage, progress) => {
          if (cancelled.has(jobId)) {
            throw Object.assign(new Error("Collection cancelled."), { code: "CANCELLED" });
          }
          db.updateProgress(runId, jobId, stage, { ...progress, percent: stagePercent(stage) });
          db.event(jobId, runId, null, stage, progress);
          publish(db, jobId);
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "CANCELLED") throw error;
      // A contact lookup can fail. The grounded research rows still publish.
    }
    const previous = runNumber > 1 ? db.latestRecords(jobId) : null;
    const result = await runPipeline(
      {
        blueprint: job.blueprint,
        collected,
        previous,
        now,
        threshold: env.threshold,
        demo: job.demo,
        jev: jevConflictProvider(job.demo),
      },
      async (stage, progress) => {
        if (cancelled.has(jobId)) {
          throw Object.assign(new Error("Collection cancelled."), { code: "CANCELLED" });
        }
        const snapshot: Progress = {
          stage,
          percent: stagePercent(stage),
          sourcesPlanned: progress.sources,
          sourcesScanned: progress.sources,
          documents: progress.documents,
          records: progress.records,
          valid: progress.valid,
          duplicates: progress.duplicates,
          conflicts: progress.conflicts,
        };
        db.updateProgress(runId, jobId, stage, snapshot);
        db.event(jobId, runId, null, stage, snapshot);
        publish(db, jobId);
        if (pace) await new Promise((resolve) => setTimeout(resolve, pace));
      },
    );
    const status = result.stats.pendingConflicts > 0 ? "CONFLICT_REVIEW" : "COMPLETED";
    db.finishRun({ runId, jobId, status, result, actorId });
    publish(db, jobId);
  } catch (error) {
    const cancelledRun = (error as { code?: string }).code === "CANCELLED" || cancelled.has(jobId);
    const message = error instanceof Error ? error.message : "Collection failed";
    db.finishRun({
      runId,
      jobId,
      status: cancelledRun ? "CANCELLED" : "FAILED",
      error: message,
      actorId,
    });
    publish(db, jobId);
  } finally {
    running.delete(jobId);
    cancelled.delete(jobId);
  }
}

export function progressOf(db: DigDb, jobId: string) {
  return db.progress(jobId) ?? { status: "DRAFT", progress: emptyProgress("DRAFT") };
}