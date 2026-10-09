-- Dig relational schema.
-- Runtime: Node's built-in SQLite (node:sqlite) so the product boots with no Docker.
-- The same tables are the contract for a later Postgres/Supabase move.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  query TEXT NOT NULL,
  blueprint_json TEXT NOT NULL,
  schedule_json TEXT,
  demo INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  stats_json TEXT,
  progress_json TEXT,
  diff_json TEXT,
  report_json TEXT,
  llm_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id TEXT,
  previous_state TEXT,
  next_state TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER,
  metadata_json TEXT,
  error TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  source_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  quality_score REAL,
  avg_confidence REAL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  published_at TEXT,
  content_hash TEXT NOT NULL,
  extraction_method TEXT NOT NULL,
  source_type TEXT NOT NULL,
  authority TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_documents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  rank INTEGER NOT NULL,
  activity_score REAL NOT NULL,
  activity_components_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  confidence_components_json TEXT NOT NULL,
  status TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  alternates_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  annotation_json TEXT NOT NULL,
  contactability_json TEXT,
  trust_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_versions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  field_values_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  published_at TEXT,
  authority TEXT,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  record_id TEXT,
  canonical_entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  old_evidence_json TEXT NOT NULL,
  new_evidence_json TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  status TEXT NOT NULL,
  decision TEXT,
  confidence REAL,
  reason TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  remark TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence REAL NOT NULL,
  input_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  dataset_version_id TEXT,
  format TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_cache (
  input_hash TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id, archived, updated_at);
CREATE INDEX IF NOT EXISTS idx_runs_job ON job_runs(job_id, run_number);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_records_version ON records(dataset_version_id, rank);
CREATE INDEX IF NOT EXISTS idx_records_entity ON records(job_id, canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_record ON evidence(record_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_job ON conflicts(job_id, status);
CREATE INDEX IF NOT EXISTS idx_sources_version ON sources(dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_versions_job ON dataset_versions(job_id, version_number);

-- Accounts: users.password_hash / users.role are added by DigDb.migrate() so existing databases upgrade in place.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Events group a user's searches into folders (sponsors, judges, jobs, leads, competitors).
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  targets TEXT NOT NULL DEFAULT '',
  favourite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  folder_names_json TEXT NOT NULL DEFAULT '{}',
  jobs_json TEXT NOT NULL DEFAULT '{}',
  opened_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);

-- Outreach tracking: who has been contacted, per result. Scoped to the event folder a search is filed in
-- ("<event id>:<intent>"), or to the search itself when it isn't filed, so it survives re-runs.
CREATE TABLE IF NOT EXISTS outreach (
  scope TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, canonical_entity_id)
);

-- Agents. Additive tables: workflows version their graphs, runs point at one version.
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  graph_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_node_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  workflow_id TEXT,
  dataset_job_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id, version_number);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_run ON workflow_node_runs(run_id, node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_run ON workflow_approvals(run_id, status);
CREATE INDEX IF NOT EXISTS idx_missions_workspace ON missions(workspace_id, updated_at);

CREATE TABLE IF NOT EXISTS agent_connectors (
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  secret TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, provider)
);
