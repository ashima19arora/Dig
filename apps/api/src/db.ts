import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CollectionBlueprint, JobState, Schedule } from "@dig/schemas";
import { comparisonKey } from "@dig/core";
import type { AnnotationBatch, IntelligenceReport, PipelineResult, PublishedRecord } from "@dig/core";
import { env } from "./env.js";

type Sql = string | number | bigint | null | Uint8Array;

function copy<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export class DigDb {
  private db: DatabaseSync;

  constructor(file = env.databasePath) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  migrate() {
    const sql = readFileSync(env.schemaPath, "utf8");
    this.db.exec(sql);
    this.failDangling();
  }

  private failDangling() {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE jobs SET status = 'FAILED', updated_at = ? WHERE status IN ('QUEUED','COLLECTING','NORMALIZING','VALIDATING','DEDUPLICATING','RANKING','ANNOTATING')`,
      )
      .run(now);
    this.db
      .prepare(`UPDATE job_runs SET status = 'FAILED', finished_at = ?, error = COALESCE(error, 'Interrupted'), updated_at = ? WHERE finished_at IS NULL`)
      .run(now, now);
  }

  private all<T = Record<string, unknown>>(sql: string, ...params: Sql[]): T[] {
    return this.db.prepare(sql).all(...params).map((row) => copy<T>(row));
  }

  private get<T>(sql: string, ...params: Sql[]): T | undefined {
    const row = this.db.prepare(sql).get(...params);
    return row ? copy<T>(row) : undefined;
  }

  private run(sql: string, ...params: Sql[]) {
    return this.db.prepare(sql).run(...params);
  }

  transaction(fn: () => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  counts() {
    return {
      jobs: Number(this.get<{ n: number }>("SELECT COUNT(*) AS n FROM jobs")?.n ?? 0),
    };
  }

  ensureWorkspace() {
    const existing = this.get<{ id: string; name: string }>("SELECT id, name FROM workspaces LIMIT 1");
    if (existing) {
      const user = this.get<{ id: string; name: string; email: string }>("SELECT id, name, email FROM users WHERE id = (SELECT owner_id FROM workspaces WHERE id = ?)", existing.id);
      return { workspace: existing, user: user! };
    }
    const now = new Date().toISOString();
    const user = { id: crypto.randomUUID(), name: "Demo Operator", email: "demo@dig.local" };
    const workspace = { id: crypto.randomUUID(), name: "Dig Demo" };
    this.transaction(() => {
      this.run("INSERT INTO users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", user.id, user.name, user.email, now, now);
      this.run(
        "INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        workspace.id,
        workspace.name,
        user.id,
        now,
        now,
      );
    });
    return { workspace, user };
  }

  audit(actorId: string, action: string, entityType: string, entityId: string, metadata?: unknown) {
    this.run(
      "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata_json, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      actorId,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString(),
    );
  }

  createJob(input: {
    workspaceId: string;
    name: string;
    query: string;
    blueprint: CollectionBlueprint;
    demo: boolean;
    actorId: string;
    status?: JobState;
  }) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.run(
      `INSERT INTO jobs (id, workspace_id, name, intent, status, query, blueprint_json, schedule_json, demo, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
      id,
      input.workspaceId,
      input.name,
      input.blueprint.intent,
      input.status ?? "PLANNED",
      input.query,
      JSON.stringify(input.blueprint),
      input.demo ? 1 : 0,
      now,
      now,
    );
    this.event(id, null, null, input.status ?? "PLANNED", { created: true });
    this.audit(input.actorId, "job.created", "job", id, { name: input.name });
    return this.job(id)!;
  }

  updateBlueprint(id: string, blueprint: CollectionBlueprint, name: string | undefined, actorId: string) {
    const now = new Date().toISOString();
    this.run(
      `UPDATE jobs SET blueprint_json = ?, intent = ?, name = COALESCE(?, name), updated_at = ?, status = CASE WHEN status = 'DRAFT' THEN 'PLANNED' ELSE status END WHERE id = ?`,
      JSON.stringify(blueprint),
      blueprint.intent,
      name ?? null,
      now,
      id,
    );
    this.audit(actorId, "job.modified", "job", id, { name });
  }

  setSchedule(id: string, schedule: Schedule, actorId: string) {
    this.run("UPDATE jobs SET schedule_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(schedule), new Date().toISOString(), id);
    this.audit(actorId, "job.modified", "job", id, { schedule });
  }

  archive(id: string, actorId: string) {
    this.run("UPDATE jobs SET archived = 1, updated_at = ? WHERE id = ?", new Date().toISOString(), id);
    this.audit(actorId, "job.modified", "job", id, { archived: true });
  }

  setStatus(id: string, status: JobState, previous: string | null, runId: string | null, metadata?: unknown, error?: string | null) {
    this.run("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", status, new Date().toISOString(), id);
    this.event(id, runId, previous, status, metadata, error);
  }

  event(jobId: string, runId: string | null, previous: string | null, next: string, metadata?: unknown, error?: string | null) {
    this.run(
      `INSERT INTO job_events (id, job_id, run_id, previous_state, next_state, timestamp, duration_ms, metadata_json, error)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      crypto.randomUUID(),
      jobId,
      runId,
      previous,
      next,
      new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null,
      error ?? null,
    );
  }

  job(id: string) {
    const row = this.get<JobRow>("SELECT * FROM jobs WHERE id = ?", id);
    return row ? mapJob(row) : undefined;
  }

  listJobs(workspaceId: string) {
    const rows = this.all<JobRow & VersionRow>(
      `SELECT j.*, dv.version_number, dv.row_count, dv.source_count, dv.quality_score, dv.avg_confidence, dv.id AS version_id,
              r.finished_at AS last_run_at, r.diff_json, r.id AS run_id,
              (SELECT COUNT(*) FROM conflicts c WHERE c.job_id = j.id AND c.status = 'PENDING') AS pending_conflicts
       FROM jobs j
       LEFT JOIN dataset_versions dv ON dv.id = (
         SELECT id FROM dataset_versions WHERE job_id = j.id ORDER BY version_number DESC LIMIT 1
       )
       LEFT JOIN job_runs r ON r.id = dv.run_id
       WHERE j.workspace_id = ? AND j.archived = 0
       ORDER BY j.updated_at DESC`,
      workspaceId,
    );
    return rows.map((row) => ({
      ...mapJob(row),
      versionNumber: row.version_number ?? null,
      versionId: row.version_id ?? null,
      rowCount: row.row_count ?? 0,
      sourceCount: row.source_count ?? 0,
      qualityScore: row.quality_score ?? null,
      avgConfidence: row.avg_confidence ?? null,
      lastRunAt: row.last_run_at ?? null,
      pendingConflicts: Number(row.pending_conflicts ?? 0),
      diff: summarizeDiff(row.diff_json),
    }));
  }

  nextRunNumber(jobId: string) {
    return Number(this.get<{ n: number }>("SELECT COALESCE(MAX(run_number), 0) + 1 AS n FROM job_runs WHERE job_id = ?", jobId)?.n ?? 1);
  }

  createRun(jobId: string, runNumber: number) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.run(
      `INSERT INTO job_runs (id, job_id, run_number, status, started_at, finished_at, stats_json, progress_json, diff_json, report_json, llm_json, error, created_at, updated_at)
       VALUES (?, ?, ?, 'QUEUED', ?, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      id,
      jobId,
      runNumber,
      now,
      JSON.stringify(emptyProgress("QUEUED")),
      now,
      now,
    );
    return id;
  }

  updateProgress(runId: string, jobId: string, status: string, progress: Progress) {
    const now = new Date().toISOString();
    this.run("UPDATE job_runs SET status = ?, progress_json = ?, updated_at = ? WHERE id = ?", status, JSON.stringify(progress), now, runId);
    this.run("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", status, now, jobId);
  }

  finishRun(input: {
    runId: string;
    jobId: string;
    status: JobState;
    result?: PipelineResult;
    error?: string | null;
    actorId: string;
  }) {
    const now = new Date().toISOString();
    if (!input.result) {
      this.run(
        "UPDATE job_runs SET status = ?, finished_at = ?, error = ?, updated_at = ? WHERE id = ?",
        input.status,
        now,
        input.error ?? null,
        now,
        input.runId,
      );
      this.setStatus(input.jobId, input.status, null, input.runId, undefined, input.error);
      return;
    }
    const result = input.result;
    const versionId = crypto.randomUUID();
    const versionNumber = Number(
      this.get<{ n: number }>("SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM dataset_versions WHERE job_id = ?", input.jobId)?.n ?? 1,
    );
    this.transaction(() => {
      this.run(
        `INSERT INTO dataset_versions (id, job_id, run_id, version_number, created_at, updated_at, row_count, source_count, status, quality_score, avg_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        versionId,
        input.jobId,
        input.runId,
        versionNumber,
        now,
        now,
        result.records.length,
        result.stats.sources,
        input.status,
        result.stats.qualityScore,
        result.stats.avgConfidence,
      );
      const sourceIds = new Map<string, string>();
      for (const record of result.records) {
        for (const source of record.sources) {
          if (sourceIds.has(source.url)) continue;
          const sourceId = crypto.randomUUID();
          sourceIds.set(source.url, sourceId);
          this.run(
            `INSERT INTO sources (id, job_id, dataset_version_id, url, title, domain, collected_at, published_at, content_hash, extraction_method, source_type, authority, demo, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            sourceId,
            input.jobId,
            versionId,
            source.url,
            source.title,
            source.domain,
            now,
            source.publishedAt,
            source.url,
            source.extractionMethod,
            source.sourceType,
            source.authority,
            source.demo ? 1 : 0,
            now,
            now,
          );
          this.run(
            `INSERT INTO raw_documents (id, source_id, job_id, run_id, url, raw_text, metadata_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            crypto.randomUUID(),
            sourceId,
            input.jobId,
            input.runId,
            source.url,
            source.excerpt,
            JSON.stringify({ title: source.title, demo: source.demo }),
            now,
            now,
          );
        }
        this.run(
          `INSERT INTO records (id, job_id, dataset_version_id, canonical_entity_id, fields_json, rank, activity_score, activity_components_json, confidence, confidence_components_json, status, validation_json, source_count, content_hash, flags_json, alternates_json, sources_json, annotation_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          record.id,
          input.jobId,
          versionId,
          record.canonicalEntityId,
          JSON.stringify(record.fields),
          record.rank,
          record.activityScore,
          JSON.stringify(record.activityComponents),
          record.confidence,
          JSON.stringify(record.confidenceComponents),
          record.status,
          JSON.stringify(record.validation),
          record.sourceCount,
          record.contentHash,
          JSON.stringify(record.flags),
          JSON.stringify(record.alternates),
          JSON.stringify(record.sources),
          JSON.stringify(record.annotation),
          now,
          now,
        );
        this.run(
          `INSERT INTO record_versions (id, record_id, job_id, canonical_entity_id, dataset_version_id, field_values_json, content_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          record.id,
          input.jobId,
          record.canonicalEntityId,
          versionId,
          JSON.stringify(record.fields),
          record.contentHash,
          now,
        );
        this.run(
          `INSERT INTO annotations (id, record_id, job_id, dataset_version_id, remark, reasoning, confidence, input_hash, model, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          record.id,
          input.jobId,
          versionId,
          record.annotation.remark,
          record.annotation.reasoning,
          record.annotation.confidence,
          result.annotationHash,
          result.model,
          now,
        );
        for (const item of record.evidence) {
          this.run(
            `INSERT INTO evidence (id, record_id, job_id, dataset_version_id, canonical_entity_id, field_name, value, source_id, source_url, source_title, excerpt, collected_at, published_at, authority, confidence, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            item.id,
            record.id,
            input.jobId,
            versionId,
            record.canonicalEntityId,
            item.fieldName,
            item.value,
            sourceIds.get(item.sourceUrl) ?? null,
            item.sourceUrl,
            item.sourceTitle,
            item.excerpt,
            item.collectedAt,
            item.publishedAt,
            item.authority,
            item.confidence,
            now,
          );
        }
      }
      // One live conflict per open question. A pending conflict from an earlier version that this run raises
      // again is carried forward (same id, original detection date); any other earlier pending conflict is
      // superseded, because this version either settled it or replaced it with a different disagreement.
      const questionKey = (entity: string, field: string, from: string, to: string) =>
        [entity, field, comparisonKey(field, from), comparisonKey(field, to)].join(" | ");
      const openEarlier = new Map(
        this.all<{ id: string; canonical_entity_id: string; field: string; old_value: string; new_value: string }>(
          "SELECT id, canonical_entity_id, field, old_value, new_value FROM conflicts WHERE job_id = ? AND status = 'PENDING' AND run_id != ?",
          input.jobId,
          input.runId,
        ).map((row) => [questionKey(row.canonical_entity_id, row.field, row.old_value, row.new_value), row.id]),
      );
      const carriedIds = new Map<string, string>();
      for (const conflict of result.conflicts) {
        const record = result.records.find((item) => item.canonicalEntityId === conflict.canonicalEntityId);
        const earlierId = conflict.status === "PENDING"
          ? openEarlier.get(questionKey(conflict.canonicalEntityId, conflict.field, conflict.oldValue, conflict.newValue))
          : undefined;
        if (earlierId) {
          openEarlier.delete(questionKey(conflict.canonicalEntityId, conflict.field, conflict.oldValue, conflict.newValue));
          carriedIds.set(conflict.id, earlierId);
          this.run(
            `UPDATE conflicts SET run_id = ?, record_id = ?, new_value = ?, new_evidence_json = ?, confidence = ?, reason = ?, updated_at = ? WHERE id = ?`,
            input.runId,
            record?.id ?? null,
            conflict.newValue,
            JSON.stringify(conflict.newEvidence),
            conflict.confidence,
            conflict.reason,
            now,
            earlierId,
          );
          continue;
        }
        this.run(
          `INSERT INTO conflicts (id, job_id, run_id, record_id, canonical_entity_id, field, old_value, new_value, old_evidence_json, new_evidence_json, detected_at, status, decision, confidence, reason, resolved_at, resolved_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          conflict.id,
          input.jobId,
          input.runId,
          record?.id ?? null,
          conflict.canonicalEntityId,
          conflict.field,
          conflict.oldValue,
          conflict.newValue,
          JSON.stringify(conflict.oldEvidence),
          JSON.stringify(conflict.newEvidence),
          conflict.detectedAt,
          conflict.status,
          conflict.decision,
          conflict.confidence,
          conflict.reason,
          conflict.status === "AUTO_RESOLVED" ? now : null,
          conflict.status === "AUTO_RESOLVED" ? "jev" : null,
          now,
          now,
        );
      }
      for (const staleId of openEarlier.values()) {
        this.run(
          "UPDATE conflicts SET status = 'SUPERSEDED', resolved_at = ?, resolved_by = 'superseded', updated_at = ? WHERE id = ?",
          now,
          now,
          staleId,
        );
      }
      // The diff refers to conflicts by id; point carried-forward ones at the row that actually exists.
      if (carriedIds.size > 0) {
        const remap = (ids: string[]) => ids.map((id) => carriedIds.get(id) ?? id);
        result.diff.conflictIds = remap(result.diff.conflictIds);
        for (const change of result.diff.changed) change.conflictIds = remap(change.conflictIds ?? []);
      }
      this.run(
        `UPDATE job_runs SET status = ?, finished_at = ?, stats_json = ?, diff_json = ?, report_json = ?, llm_json = ?, progress_json = ?, updated_at = ? WHERE id = ?`,
        input.status,
        now,
        JSON.stringify(result.stats),
        JSON.stringify(result.diff),
        JSON.stringify(result.report),
        JSON.stringify({ calls: result.stats.llmCalls, cacheHit: result.stats.llmCacheHit, model: result.model, cost: null }),
        JSON.stringify({
          ...emptyProgress(input.status),
          sourcesScanned: result.stats.sources,
          sourcesPlanned: result.stats.sources,
          documents: result.stats.documents,
          records: result.stats.records,
          valid: result.stats.valid,
          duplicates: result.stats.duplicates,
          conflicts: result.stats.conflicts,
          percent: 100,
        }),
        now,
        input.runId,
      );
      this.run("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", input.status, now, input.jobId);
      this.run(
        `INSERT INTO job_events (id, job_id, run_id, previous_state, next_state, timestamp, duration_ms, metadata_json, error)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
        crypto.randomUUID(),
        input.jobId,
        input.runId,
        "ANNOTATING",
        input.status,
        now,
        JSON.stringify({ records: result.records.length, conflicts: result.conflicts.length }),
      );
    });
    this.audit(input.actorId, "job.run", "job", input.jobId, { runId: input.runId, status: input.status });
  }

  latestRecords(jobId: string): PublishedRecord[] {
    const version = this.latestVersion(jobId);
    if (!version) return [];
    return this.recordsForVersion(version.id);
  }

  latestVersion(jobId: string) {
    return this.get<Version>("SELECT * FROM dataset_versions WHERE job_id = ? ORDER BY version_number DESC LIMIT 1", jobId);
  }

  recordsForVersion(versionId: string): PublishedRecord[] {
    const rows = this.all<RecordRow>("SELECT * FROM records WHERE dataset_version_id = ? ORDER BY rank ASC", versionId);
    return rows.map((row) => ({
      id: row.id,
      canonicalEntityId: row.canonical_entity_id,
      fields: JSON.parse(row.fields_json) as Record<string, string>,
      rank: row.rank,
      activityScore: row.activity_score,
      activityComponents: JSON.parse(row.activity_components_json),
      confidence: row.confidence,
      confidenceComponents: JSON.parse(row.confidence_components_json),
      status: row.status as PublishedRecord["status"],
      validation: JSON.parse(row.validation_json),
      sourceCount: row.source_count,
      contentHash: row.content_hash,
      flags: JSON.parse(row.flags_json),
      alternates: JSON.parse(row.alternates_json),
      sources: JSON.parse(row.sources_json),
      evidence: this.all<EvidenceRow>("SELECT * FROM evidence WHERE record_id = ?", row.id).map(mapEvidence),
      annotation: JSON.parse(row.annotation_json),
    }));
  }

  runs(jobId: string) {
    return this.all(
      `SELECT id, run_number, status, started_at, finished_at, stats_json, diff_json, error FROM job_runs WHERE job_id = ? ORDER BY run_number DESC`,
      jobId,
    ).map((row) => {
      const stats = row.stats_json ? JSON.parse(String(row.stats_json)) : null;
      const diff = summarizeDiff(row.diff_json ? String(row.diff_json) : null);
      return {
        id: String(row.id),
        runNumber: Number(row.run_number),
        status: String(row.status),
        startedAt: String(row.started_at),
        finishedAt: row.finished_at ? String(row.finished_at) : null,
        error: row.error ? String(row.error) : null,
        stats,
        diff,
      };
    });
  }

  events(jobId: string) {
    return this.all(
      "SELECT id, previous_state, next_state, timestamp, metadata_json, error FROM job_events WHERE job_id = ? ORDER BY timestamp ASC",
      jobId,
    ).map((row) => ({
      id: String(row.id),
      previousState: row.previous_state ? String(row.previous_state) : null,
      nextState: String(row.next_state),
      timestamp: String(row.timestamp),
      metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : null,
      error: row.error ? String(row.error) : null,
    }));
  }

  progress(jobId: string) {
    const job = this.job(jobId);
    const run = this.get<RunRow>(
      "SELECT * FROM job_runs WHERE job_id = ? ORDER BY run_number DESC LIMIT 1",
      jobId,
    );
    return {
      status: job?.status ?? "DRAFT",
      runId: run?.id ?? null,
      runNumber: run?.run_number ?? null,
      progress: run?.progress_json ? JSON.parse(run.progress_json) : emptyProgress(job?.status ?? "DRAFT"),
      error: run?.error ?? null,
    };
  }

  diffForLatest(jobId: string) {
    const run = this.get<{ diff_json: string | null }>(
      `SELECT r.diff_json FROM job_runs r
       JOIN dataset_versions dv ON dv.run_id = r.id
       WHERE dv.job_id = ?
       ORDER BY dv.version_number DESC LIMIT 1`,
      jobId,
    );
    return run?.diff_json ? JSON.parse(run.diff_json) : null;
  }

  report(jobId: string): IntelligenceReport | null {
    const run = this.get<{ report_json: string | null }>(
      `SELECT r.report_json FROM job_runs r JOIN dataset_versions dv ON dv.run_id = r.id WHERE dv.job_id = ? ORDER BY dv.version_number DESC LIMIT 1`,
      jobId,
    );
    return run?.report_json ? (JSON.parse(run.report_json) as IntelligenceReport) : null;
  }

  conflicts(jobId?: string) {
    const rows = jobId
      ? this.all("SELECT c.*, j.name AS job_name, r.fields_json FROM conflicts c JOIN jobs j ON j.id = c.job_id LEFT JOIN records r ON r.id = c.record_id WHERE c.job_id = ? ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.detected_at DESC", jobId)
      : this.all("SELECT c.*, j.name AS job_name, r.fields_json FROM conflicts c JOIN jobs j ON j.id = c.job_id LEFT JOIN records r ON r.id = c.record_id WHERE j.archived = 0 ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.detected_at DESC LIMIT 100");
    return rows.map(mapConflict);
  }

  conflict(id: string) {
    const row = this.get<Record<string, unknown>>("SELECT c.*, j.name AS job_name, r.fields_json FROM conflicts c JOIN jobs j ON j.id = c.job_id LEFT JOIN records r ON r.id = c.record_id WHERE c.id = ?", id);
    return row ? mapConflict(row) : undefined;
  }

  resolveConflict(id: string, decision: "NEW" | "OLD" | "BOTH", actorId: string) {
    const current = this.conflict(id);
    if (!current) return undefined;
    const now = new Date().toISOString();
    const record = current.recordId
      ? this.get<RecordRow>("SELECT * FROM records WHERE id = ?", current.recordId)
      : undefined;
    if (record) {
      const fields = JSON.parse(record.fields_json) as Record<string, string>;
      const alternates = JSON.parse(record.alternates_json) as Array<{ field: string; value: string }>;
      if (decision === "NEW") fields[current.field] = current.newValue;
      if (decision === "OLD") fields[current.field] = current.oldValue;
      if (decision === "BOTH") {
        fields[current.field] = current.oldValue;
        alternates.push({ field: current.field, value: current.newValue });
      }
      const pendingLeft = this.all(
        "SELECT id FROM conflicts WHERE record_id = ? AND status = 'PENDING' AND id != ?",
        record.id,
        id,
      );
      const status = pendingLeft.length ? "needs_review" : record.status === "needs_review" ? "verified" : record.status;
      this.run(
        "UPDATE records SET fields_json = ?, alternates_json = ?, status = ?, updated_at = ? WHERE id = ?",
        JSON.stringify(fields),
        JSON.stringify(alternates),
        status,
        now,
        record.id,
      );
      this.run(
        "INSERT INTO record_versions (id, record_id, job_id, canonical_entity_id, dataset_version_id, field_values_json, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        record.id,
        record.job_id,
        record.canonical_entity_id,
        record.dataset_version_id,
        JSON.stringify(fields),
        record.content_hash,
        now,
      );
    }
    this.run(
      "UPDATE conflicts SET status = 'HUMAN_RESOLVED', decision = ?, resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?",
      decision,
      now,
      actorId,
      now,
      id,
    );
    const pending = Number(this.get<{ n: number }>("SELECT COUNT(*) AS n FROM conflicts WHERE job_id = ? AND status = 'PENDING'", current.jobId)?.n ?? 0);
    if (pending === 0) {
      const job = this.job(current.jobId);
      if (job?.status === "CONFLICT_REVIEW") this.run("UPDATE jobs SET status = 'COMPLETED', updated_at = ? WHERE id = ?", now, current.jobId);
    }
    this.audit(actorId, "conflict.resolved", "conflict", id, { decision });
    return this.conflict(id);
  }

  sources(jobId?: string) {
    const rows = jobId
      ? this.all(
          `SELECT * FROM sources WHERE dataset_version_id = (SELECT id FROM dataset_versions WHERE job_id = ? ORDER BY version_number DESC LIMIT 1) ORDER BY title ASC`,
          jobId,
        )
      : this.all(
          `SELECT s.*, j.name AS job_name FROM sources s JOIN jobs j ON j.id = s.job_id
           WHERE s.dataset_version_id IN (SELECT id FROM dataset_versions dv WHERE dv.version_number = (SELECT MAX(version_number) FROM dataset_versions WHERE job_id = dv.job_id))
           ORDER BY s.collected_at DESC LIMIT 200`,
        );
    return rows.map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id),
      jobName: row.job_name ? String(row.job_name) : undefined,
      url: String(row.url),
      title: String(row.title),
      domain: String(row.domain),
      collectedAt: String(row.collected_at),
      publishedAt: row.published_at ? String(row.published_at) : null,
      extractionMethod: String(row.extraction_method),
      sourceType: String(row.source_type),
      authority: String(row.authority),
      demo: Boolean(row.demo),
    }));
  }

  datasets() {
    return this.all(
      `SELECT dv.*, j.name AS job_name, j.intent, j.status AS job_status FROM dataset_versions dv JOIN jobs j ON j.id = dv.job_id WHERE j.archived = 0 ORDER BY dv.created_at DESC`,
    ).map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id),
      jobName: String(row.job_name),
      intent: String(row.intent),
      jobStatus: String(row.job_status),
      versionNumber: Number(row.version_number),
      createdAt: String(row.created_at),
      rowCount: Number(row.row_count),
      sourceCount: Number(row.source_count),
      status: String(row.status),
      qualityScore: row.quality_score === null ? null : Number(row.quality_score),
      avgConfidence: row.avg_confidence === null ? null : Number(row.avg_confidence),
    }));
  }

  reports() {
    return this.all(
      `SELECT r.id AS run_id, r.report_json, r.finished_at, j.id AS job_id, j.name, dv.version_number
       FROM job_runs r
       JOIN jobs j ON j.id = r.job_id
       JOIN dataset_versions dv ON dv.run_id = r.id
       WHERE r.report_json IS NOT NULL AND j.archived = 0
       ORDER BY r.finished_at DESC`,
    ).map((row) => {
      const report = JSON.parse(String(row.report_json)) as IntelligenceReport;
      return {
        runId: String(row.run_id),
        jobId: String(row.job_id),
        jobName: String(row.name),
        versionNumber: Number(row.version_number),
        title: report.title,
        summary: report.summary,
        generatedAt: report.generatedAt,
        demo: report.demo,
      };
    });
  }

  history(jobId: string, entityId: string) {
    return this.all(
      `SELECT rv.field_values_json, rv.created_at, dv.version_number
       FROM record_versions rv JOIN dataset_versions dv ON dv.id = rv.dataset_version_id
       WHERE rv.job_id = ? AND rv.canonical_entity_id = ?
       ORDER BY dv.version_number ASC, rv.created_at ASC`,
      jobId,
      entityId,
    ).map((row) => ({
      versionNumber: Number(row.version_number),
      createdAt: String(row.created_at),
      fields: JSON.parse(String(row.field_values_json)) as Record<string, string>,
    }));
  }

  views(jobId: string) {
    return this.all("SELECT * FROM saved_views WHERE job_id = ? ORDER BY created_at DESC", jobId).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      filters: JSON.parse(String(row.filters_json)),
    }));
  }

  saveView(jobId: string, name: string, filters: unknown) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.run(
      "INSERT INTO saved_views (id, job_id, name, filters_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      jobId,
      name,
      JSON.stringify(filters),
      now,
      now,
    );
    return { id, name, filters };
  }

  readCache(hash: string): AnnotationBatch | null {
    const row = this.get<{ output_json: string }>("SELECT output_json FROM llm_cache WHERE input_hash = ?", hash);
    return row ? (JSON.parse(row.output_json) as AnnotationBatch) : null;
  }

  writeCache(hash: string, model: string, batch: AnnotationBatch) {
    this.run(
      "INSERT OR REPLACE INTO llm_cache (input_hash, model, output_json, created_at) VALUES (?, ?, ?, ?)",
      hash,
      model,
      JSON.stringify(batch),
      new Date().toISOString(),
    );
  }

  recordExport(jobId: string, versionId: string | null, format: string, actorId: string) {
    this.run(
      "INSERT INTO exports (id, job_id, dataset_version_id, format, created_at) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      jobId,
      versionId,
      format,
      new Date().toISOString(),
    );
    this.audit(actorId, "export.generated", "job", jobId, { format });
  }

  dueJobs() {
    const now = new Date().toISOString();
    return this.all<JobRow>("SELECT * FROM jobs WHERE archived = 0 AND schedule_json IS NOT NULL").flatMap((row) => {
      const schedule = row.schedule_json ? (JSON.parse(row.schedule_json) as Schedule) : null;
      if (!schedule?.enabled || !schedule.nextRunAt || schedule.nextRunAt > now) return [];
      return [mapJob(row)];
    });
  }

  active(jobId: string) {
    const job = this.job(jobId);
    return Boolean(job && ["QUEUED", "COLLECTING", "NORMALIZING", "VALIDATING", "DEDUPLICATING", "RANKING", "ANNOTATING"].includes(job.status));
  }
}

interface JobRow {
  id: string;
  workspace_id: string;
  name: string;
  intent: string;
  status: string;
  query: string;
  blueprint_json: string;
  schedule_json: string | null;
  demo: number;
  archived: number;
  created_at: string;
  updated_at: string;
  version_number?: number | null;
  version_id?: string | null;
  row_count?: number | null;
  source_count?: number | null;
  quality_score?: number | null;
  avg_confidence?: number | null;
  last_run_at?: string | null;
  pending_conflicts?: number | null;
  diff_json?: string | null;
}

interface VersionRow {
  version_number: number | null;
  version_id: string | null;
  row_count: number | null;
  source_count: number | null;
  quality_score: number | null;
  avg_confidence: number | null;
  last_run_at: string | null;
  pending_conflicts: number | null;
  diff_json: string | null;
}

interface Version {
  id: string;
  run_id: string;
  version_number: number;
  created_at: string;
  row_count: number;
  source_count: number;
  status: string;
  quality_score: number | null;
  avg_confidence: number | null;
}

interface RecordRow {
  id: string;
  job_id: string;
  dataset_version_id: string;
  canonical_entity_id: string;
  fields_json: string;
  rank: number;
  activity_score: number;
  activity_components_json: string;
  confidence: number;
  confidence_components_json: string;
  status: string;
  validation_json: string;
  source_count: number;
  content_hash: string;
  flags_json: string;
  alternates_json: string;
  sources_json: string;
  annotation_json: string;
}

interface EvidenceRow {
  id: string;
  field_name: string;
  value: string;
  source_url: string;
  source_title: string;
  excerpt: string;
  collected_at: string;
  published_at: string | null;
  authority: string | null;
  confidence: number;
}

interface RunRow {
  id: string;
  run_number: number;
  progress_json: string | null;
  error: string | null;
}

export interface Progress {
  stage: string;
  percent: number;
  sourcesPlanned: number;
  sourcesScanned: number;
  documents: number;
  records: number;
  valid: number;
  duplicates: number;
  conflicts: number;
}

export function emptyProgress(stage: string): Progress {
  return {
    stage,
    percent: stage === "COMPLETED" || stage === "CONFLICT_REVIEW" ? 100 : 8,
    sourcesPlanned: 0,
    sourcesScanned: 0,
    documents: 0,
    records: 0,
    valid: 0,
    duplicates: 0,
    conflicts: 0,
  };
}

function mapJob(row: JobRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    intent: row.intent,
    status: row.status as JobState,
    query: row.query,
    blueprint: JSON.parse(row.blueprint_json) as CollectionBlueprint,
    schedule: row.schedule_json ? (JSON.parse(row.schedule_json) as Schedule) : null,
    demo: Boolean(row.demo),
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvidence(row: EvidenceRow) {
  return {
    id: row.id,
    fieldName: row.field_name,
    value: row.value,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    excerpt: row.excerpt,
    collectedAt: row.collected_at,
    publishedAt: row.published_at ?? "",
    authority: (row.authority ?? "secondary") as "official" | "secondary" | "press",
    confidence: row.confidence,
  };
}

function mapConflict(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    jobName: row.job_name ? String(row.job_name) : undefined,
    runId: String(row.run_id),
    recordId: row.record_id ? String(row.record_id) : null,
    canonicalEntityId: String(row.canonical_entity_id),
    label: labelFromFields(row.fields_json),
    field: String(row.field),
    oldValue: String(row.old_value),
    newValue: String(row.new_value),
    oldEvidence: row.old_evidence_json ? JSON.parse(String(row.old_evidence_json)) : null,
    newEvidence: row.new_evidence_json ? JSON.parse(String(row.new_evidence_json)) : null,
    detectedAt: String(row.detected_at),
    status: String(row.status),
    decision: row.decision ? String(row.decision) : null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    reason: row.reason ? String(row.reason) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
  };
}

function summarizeDiff(json: string | null | undefined) {
  if (!json) return null;
  const diff = JSON.parse(json) as {
    firstVersion?: boolean;
    added?: unknown[];
    removed?: unknown[];
    changed?: unknown[];
    unchanged?: unknown[];
    conflictIds?: unknown[];
  };
  return {
    firstVersion: Boolean(diff.firstVersion),
    added: diff.added?.length ?? 0,
    removed: diff.removed?.length ?? 0,
    changed: diff.changed?.length ?? 0,
    unchanged: diff.unchanged?.length ?? 0,
    conflicts: diff.conflictIds?.length ?? 0,
  };
}

export function labelFromFields(json: unknown) {
  if (!json || typeof json !== "string") return undefined;
  try {
    return labelOf(JSON.parse(json) as Record<string, string>);
  } catch {
    return undefined;
  }
}

export function labelOf(fields: Record<string, string>) {
  return fields.company_name || fields.event_name || fields.program_name || fields.product_name || fields.segment || "Record";
}
