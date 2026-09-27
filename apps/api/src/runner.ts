import {
  collectDemo,
  deterministicBatch,
  runPipeline,
  stagePercent,
  type AnnotationBatch,
  type CollectedRecord,
  type PublishedRecord,
} from "@dig/core";
import type { Response } from "express";
import { collectLive } from "./collect-live.js";
import { emptyProgress, type Progress, type DigDb } from "./db.js";
import { env } from "./env.js";

const listeners = new Map<string, Set<Response>>();
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

function llmFor(db: DigDb) {
  if (!env.llmEnabled) return undefined;
  const model = env.llmProvider === "openai" && env.llmKey ? env.llmModel : "mock";
  return {
    enabled: true,
    model,
    readCache: (hash: string) => db.readCache(hash),
    writeCache: (hash: string, batch: AnnotationBatch) => db.writeCache(hash, model, batch),
    generate: async (input: { records: PublishedRecord[]; reportFacts: string }) => {
      if (env.llmProvider === "openai" && env.llmKey) return openAiBatch(input.reportFacts, input.records);
      return {
        summary: input.records[0]?.annotation.remark ?? "No records were collected.",
        observations: [input.reportFacts.split("\n")[0] ?? ""],
        annotations: input.records.map((record) => ({
          recordId: record.canonicalEntityId,
          remark: record.annotation.remark,
          reasoning: record.annotation.reasoning,
          confidence: record.confidence,
        })),
      } satisfies AnnotationBatch;
    },
  };
}

async function openAiBatch(facts: string, records: PublishedRecord[]): Promise<AnnotationBatch> {
  const fallback = deterministicBatch(records, { firstVersion: true, added: [], removed: [], changed: [], unchanged: [], conflictIds: [] }, records[0] ? {
    intent: "MARKET_LOOKUP",
    query: "",
    entities: { category: null, location: null },
    fields: [],
    freshness: { required: false, maxAgeDays: 90 },
    sources: [],
    ranking: { strategy: "activity" },
  } : {
    intent: "MARKET_LOOKUP",
    query: "",
    entities: { category: null, location: null },
    fields: [],
    freshness: { required: false, maxAgeDays: 90 },
    sources: [],
    ranking: { strategy: "activity" },
  });
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.llmKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.llmModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate concise business intelligence annotations from verified structured datasets. Do not invent facts. Do not infer unsupported information. Every statement must be supported by the supplied records. If evidence is insufficient, say so. Return JSON with summary, observations, and annotations[{recordId,remark,reasoning,confidence}].",
        },
        { role: "user", content: facts },
      ],
    }),
  });
  if (!response.ok) return fallback;
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return fallback;
  const parsed = JSON.parse(content) as AnnotationBatch;
  if (!Array.isArray(parsed.annotations)) return fallback;
  return parsed;
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
      collected = await collectLive(job.blueprint, now.toISOString());
    }
    collected = collected.slice(0, env.maxRecords);
    const previous = runNumber > 1 ? db.latestRecords(jobId) : null;
    const result = await runPipeline(
      {
        blueprint: job.blueprint,
        collected,
        previous,
        now,
        threshold: env.threshold,
        demo: job.demo,
        llm: llmFor(db),
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
