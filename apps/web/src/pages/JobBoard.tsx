import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Clock, Download, FileText, Filter, Pencil, Play, RotateCw, Search, Upload, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVE_STATES,
  api,
  download,
  SUPPORTED_INTENTS,
  type Conflict,
  type Dataset,
  type DatasetRecord,
  type Diff,
  type Evidence,
  type JobDetail,
  type JobProgress,
} from "../api";
import { AppWindow, type Crumb } from "../components/Shell";
import { notifyError } from "../toast";

type Pair = [string, string];

/** What each kind of search shows: table columns (the first is the record's name) and detail cards. */
const VIEWS: Record<string, { noun: string; columns: Pair[]; cards: Pair[] }> = {
  SPONSOR_LOOKUP: {
    noun: "sponsors",
    columns: [["company_name", "Company"], ["event_name", "Event"], ["sponsorship_type", "Type"], ["contact", "Contact"], ["email", "Email"]],
    cards: [["company_name", "Company name"], ["event_name", "Event"], ["sponsorship_type", "Sponsorship type"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
  JUDGE_LOOKUP: {
    noun: "people",
    columns: [["person_name", "Name"], ["affiliation", "Affiliation"], ["expertise", "Expertise"], ["event_name", "Judged / mentored at"], ["email", "Email"]],
    cards: [["person_name", "Name"], ["affiliation", "Affiliation"], ["expertise", "Expertise"], ["event_name", "Judged / mentored at"], ["email", "Email"], ["profile_url", "Profile"], ["last_verified", "Last verified"]],
  },
  JOB_LOOKUP: {
    noun: "roles",
    columns: [["role_title", "Role"], ["company_name", "Company"], ["location", "Location"], ["workplace", "Workplace"]],
    cards: [["role_title", "Role"], ["company_name", "Company"], ["location", "Location"], ["workplace", "Workplace"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
  LEAD_LOOKUP: {
    noun: "leads",
    columns: [["company_name", "Company"], ["category", "What they do"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"]],
    cards: [["company_name", "Company"], ["category", "What they do"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
  COMPETITOR_LOOKUP: {
    noun: "competitors",
    columns: [["company_name", "Competitor"], ["category", "Category"], ["pricing_signal", "Pricing"], ["website", "Website"]],
    cards: [["company_name", "Competitor"], ["category", "Category"], ["pricing_signal", "Pricing signal"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
};
const LINK_FIELDS = new Set(["website", "profile_url"]);

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  COLLECTING: "Searching the web and extracting sponsors",
  NORMALIZING: "Normalizing",
  DEDUPLICATING: "Removing duplicates",
  VALIDATING: "Validating",
  RANKING: "Ranking",
  ANNOTATING: "Writing notes",
};

type Tab = "all" | "review" | "verified";
/** Keyed by canonicalEntityId: record ids change every version, the entity key does not. */
type Panel = { kind: "record"; key: string } | { kind: "diff" } | null;

function isActive(status: string | undefined) {
  return Boolean(status && ACTIVE_STATES.includes(status));
}

export function JobBoard({ jobId, crumbs }: { jobId: string; crumbs: Crumb[] }) {
  const client = useQueryClient();
  const [live, setLive] = useState<JobProgress | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [report, setReport] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [runStartedAt, setRunStartedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);

  const jobQ = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api<JobDetail>(`/api/jobs/${jobId}`),
  });
  const running = isActive(live?.status) || isActive(jobQ.data?.job.status);
  const datasetQ = useQuery({ queryKey: ["dataset", jobId], queryFn: () => api<Dataset>(`/api/jobs/${jobId}/dataset`) });
  const conflictsQ = useQuery({
    queryKey: ["conflicts", jobId],
    queryFn: () => api<{ conflicts: Conflict[] }>(`/api/jobs/${jobId}/conflicts`),
  });
  const outreachQ = useQuery({
    queryKey: ["outreach", jobId],
    queryFn: () => api<{ outreach: Record<string, Outreach> }>(`/api/jobs/${jobId}/outreach`),
  });
  const outreach = outreachQ.data?.outreach ?? {};
  const setOutreach = async (entity: string, patch: Partial<Pick<Outreach, "status" | "note">>) => {
    const current = outreach[entity] ?? { status: "pending", note: "" };
    const next = { status: patch.status ?? current.status, note: patch.note ?? current.note };
    // Show the change immediately; roll back (and say why) if the save fails.
    client.setQueryData<{ outreach: Record<string, Outreach> }>(["outreach", jobId], (data) => ({
      outreach: { ...(data?.outreach ?? {}), [entity]: { ...current, ...next } },
    }));
    try {
      const saved = await api<{ outreach: Outreach }>(`/api/jobs/${jobId}/outreach/${encodeURIComponent(entity)}`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      client.setQueryData<{ outreach: Record<string, Outreach> }>(["outreach", jobId], (data) => ({
        outreach: { ...(data?.outreach ?? {}), [entity]: saved.outreach },
      }));
    } catch (error) {
      notifyError(error);
      void client.invalidateQueries({ queryKey: ["outreach", jobId] });
    }
  };
  const diffQ = useQuery({ queryKey: ["diff", jobId], queryFn: () => api<{ diff: Diff | null }>(`/api/jobs/${jobId}/diff`) });

  const refreshAll = () => {
    for (const key of ["job", "dataset", "conflicts", "diff"]) void client.invalidateQueries({ queryKey: [key, jobId] });
  };

  // Live progress over SSE while a run is in flight; poll as a fallback in case the stream drops.
  useEffect(() => {
    if (!running) return;
    const stream = new EventSource(`/api/jobs/${jobId}/stream`);
    stream.onmessage = (message) => {
      const payload = JSON.parse(message.data) as JobProgress;
      setLive(payload);
      if (!isActive(payload.status)) {
        stream.close();
        refreshAll();
      }
    };
    const poll = window.setInterval(() => void client.invalidateQueries({ queryKey: ["job", jobId] }), 4000);
    return () => {
      stream.close();
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, jobId]);

  // Re-render once a second while running so the collection estimate keeps moving.
  useEffect(() => {
    if (!running) return;
    setRunStartedAt((started) => (Date.now() - started > 5 * 60_000 ? Date.now() : started));
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // When the polled job settles without the stream noticing, pull the fresh dataset.
  useEffect(() => {
    if (jobQ.data && !isActive(jobQ.data.job.status) && isActive(live?.status)) {
      setLive(null);
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQ.data?.job.status]);

  const runAgain = useMutation({
    mutationFn: () => api(`/api/jobs/${jobId}/run`, { method: "POST" }),
    onMutate: () => {
      setRunStartedAt(Date.now());
      setLive({ status: "QUEUED", runId: null, runNumber: null, progress: emptyProgress("QUEUED"), error: null });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ["job", jobId] }),
    onError: (error) => {
      if (!/already running/i.test(String(error))) setLive(null);
    },
  });

  const generateReport = async () => {
    setReport({ busy: true, error: null });
    try {
      await download(`/api/jobs/${jobId}/export?format=report`, "dig-report.md");
      setReport({ busy: false, error: null });
    } catch (error) {
      setReport({ busy: false, error: error instanceof Error ? error.message : "The report couldn’t be generated." });
    }
  };

  const resolve = useMutation({
    mutationFn: (input: { id: string; decision: "NEW" | "OLD" }) =>
      api(`/api/conflicts/${input.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: input.decision }) }),
    onSuccess: refreshAll,
  });

  const records = datasetQ.data?.records ?? [];
  const version = datasetQ.data?.version ?? null;
  // Only conflicts raised by the run that produced the version on screen are live. Older ones point at
  // records of a superseded version, and resolving them would edit data nobody is looking at.
  const conflicts = (conflictsQ.data?.conflicts ?? []).filter((conflict) => !version || conflict.runId === version.runId);
  const pending = conflicts.filter((conflict) => conflict.status === "PENDING");
  const autoResolved = conflicts.filter((conflict) => conflict.status === "AUTO_RESOLVED");

  const conflictsFor = useMemo(() => {
    const map = new Map<string, Conflict[]>();
    for (const conflict of conflicts) {
      const record = records.find((item) => item.id === conflict.recordId || item.canonicalEntityId === conflict.canonicalEntityId);
      if (!record) continue;
      map.set(record.id, [...(map.get(record.id) ?? []), conflict]);
    }
    return map;
  }, [conflicts, records]);

  const needsReview = (record: DatasetRecord) =>
    (conflictsFor.get(record.id) ?? []).some((conflict) => conflict.status === "PENDING") || record.status !== "verified";

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = records.filter((record) => {
      if (tab === "review" && !needsReview(record)) return false;
      if (tab === "verified" && needsReview(record)) return false;
      if (!needle) return true;
      return (VIEWS[jobQ.data?.job.blueprint.intent ?? ""] ?? VIEWS.SPONSOR_LOOKUP!).columns.some(([key]) =>
        (record.fields[key] ?? "").toLowerCase().includes(needle),
      );
    });
    if (sort) {
      const value = (record: DatasetRecord) => (sort.key === "status" ? statusText(record) : record.fields[sort.key] ?? "").toLowerCase();
      list = [...list].sort((a, b) => {
        const left = value(a);
        const right = value(b);
        if (!left !== !right) return left ? -1 : 1; // blanks last either way
        return left.localeCompare(right) * sort.dir;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, tab, search, sort, conflictsFor]);

  function statusText(record: DatasetRecord) {
    if ((conflictsFor.get(record.id) ?? []).some((conflict) => conflict.status === "PENDING")) return "Needs review";
    return { verified: "Verified", needs_review: "Needs review", possible_duplicate: "Possible duplicate", incomplete: "Incomplete" }[record.status];
  }

  // Open the first record (preferring one that needs a decision) once data arrives.
  useEffect(() => {
    if (records.length === 0 || !conflictsQ.isSuccess) return;
    if (panel?.kind === "diff") return;
    if (panel?.kind === "record" && records.some((record) => record.canonicalEntityId === panel.key)) return;
    const first = records.find((record) => (conflictsFor.get(record.id) ?? []).some((c) => c.status === "PENDING")) ?? records[0];
    if (first) setPanel({ kind: "record", key: first.canonicalEntityId });
  }, [records, conflictsFor, panel, conflictsQ.isSuccess]);

  useEffect(() => {
    if (!downloadOpen) return;
    const close = () => setDownloadOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [downloadOpen]);

  const job = jobQ.data?.job;
  const view = VIEWS[job?.blueprint.intent ?? "SPONSOR_LOOKUP"] ?? VIEWS.SPONSOR_LOOKUP!;
  const selected = panel?.kind === "record" ? records.find((record) => record.canonicalEntityId === panel.key) : undefined;
  const reviewCount = records.filter(needsReview).length;
  const progress = live ?? (running ? jobQ.data?.progress : null) ?? null;
  const failed = !running && (job?.status === "FAILED" || live?.status === "FAILED");
  const diff = diffQ.data?.diff ?? null;
  const exportHref = (format: string) => `/api/jobs/${jobId}/export?format=${format}`;

  if (jobQ.isError) {
    return (
      <AppWindow crumbs={crumbs} sidebar={false}>
        <div className="empty">
          <div>
            <h3>This search couldn’t be loaded</h3>
            <div className="err">{String(jobQ.error)}</div>
          </div>
        </div>
      </AppWindow>
    );
  }

  if (job && !SUPPORTED_INTENTS.includes(job.blueprint.intent)) {
    return (
      <AppWindow crumbs={crumbs} sidebar={false}>
        <div className="empty">
          <div className="unsupported">
            <h3>{job.name} isn’t supported yet</h3>
            <p>
              This search asks for {intentLabel(job.blueprint.intent)}. Dig researches <b>sponsors, judges &amp; mentors, jobs, leads and
              competitors</b> right now — so this one won’t run.
            </p>
            <p className="q">Query — “{job.query}”</p>
            <Link to="/dashboard" className="btn blue">
              Back to your events
            </Link>
          </div>
        </div>
      </AppWindow>
    );
  }

  return (
    <AppWindow
      crumbs={crumbs}
      sidebar={false}
      actions={
        version ? (
          <a className="btn" href={exportHref("csv")} download>
            <Upload size={14} /> Export
          </a>
        ) : undefined
      }
    >
      <div className="board">
        <div className="board-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {job ? <EditableTitle jobId={jobId} name={job.name} /> : <h1>Loading…</h1>}
            {job && <div className="q">Query — “{job.query}”</div>}
          </div>
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <button
              className="btn"
              disabled={!version}
              onClick={(click) => {
                click.stopPropagation();
                setDownloadOpen((open) => !open);
              }}
            >
              <Download size={14} /> Download <ChevronDown size={13} />
            </button>
            {downloadOpen && (
              <div className="menu" style={{ top: 32, right: "auto", left: 0 }}>
                <a href={exportHref("csv")} download>
                  <button>CSV (.csv)</button>
                </a>
                <a href={exportHref("xlsx")} download>
                  <button>Excel (.xlsx)</button>
                </a>
                <a href={exportHref("json")} download>
                  <button>JSON (.json)</button>
                </a>
                <div className="menu-sep" />
                <button onClick={() => void generateReport()} disabled={report.busy}>
                  <FileText size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />
                  Generate report (.md)
                </button>
              </div>
            )}
            {(report.busy || report.error) && (
              <div className={`report-note${report.error ? " err" : ""}`} role="status">
                {report.busy ? "Generating report…" : report.error}
              </div>
            )}
            <button className="btn" disabled={running || runAgain.isPending} onClick={() => runAgain.mutate()}>
              <RotateCw size={14} className={running ? "spin" : undefined} /> {running ? "Running…" : "Run again"}
            </button>
            <button
              className="btn"
              disabled={pending.length === 0}
              onClick={() => {
                setTab("review");
                const first = records.find((record) => (conflictsFor.get(record.id) ?? []).some((c) => c.status === "PENDING"));
                if (first) setPanel({ kind: "record", key: first.canonicalEntityId });
              }}
            >
              <Play size={12} fill="currentColor" /> Review conflicts
            </button>
          </div>
        </div>

        {version && (
          <div className="statsbar">
            <button className={`pill${pending.length ? "" : " ok"}`} onClick={() => setTab("review")} style={{ cursor: "pointer" }}>
              <span className="d" />
              {pending.length
                ? `${pending.length} record${pending.length === 1 ? " needs" : "s need"} your review`
                : "No conflicts need your review"}
              {autoResolved.length > 0 && ` · ${autoResolved.length} ${pending.length ? "more were" : ""} auto-resolved`}
            </button>
            <span className="sep" />
            <span>
              <b>{version.rowCount}</b> records from <b>{version.sourceCount}</b> sources
            </span>
            <OutreachSummary records={records} outreach={outreach} />
            {version.qualityScore !== null && (
              <span>
                <b>{Math.round(version.qualityScore)}</b> quality score
              </span>
            )}
            {version.avgConfidence !== null && (
              <span>
                <b>{version.avgConfidence.toFixed(2)}</b> avg confidence
              </span>
            )}
            <span>
              <b>v{version.versionNumber}</b> · run {when(version.createdAt)}
            </span>
            <span className="diff">
              {diff && !diff.firstVersion ? (
                <>
                  <span style={{ color: "#248a3d" }}>+{diff.added.length} added</span>
                  <span>{diff.changed.length} changed</span>
                  <span>{diff.removed.length} dropped</span>
                </>
              ) : (
                <span>First version</span>
              )}
              <a onClick={() => setPanel({ kind: "diff" })}>Full diff ›</a>
            </span>
          </div>
        )}

        {runAgain.isError && !/already running/i.test(String(runAgain.error)) && (
          <div className="progress">
            <span className="err">Couldn’t start a new run: {runAgain.error.message}</span>
          </div>
        )}

        {(running || failed) && (
          <div className="progress">
            {failed ? (
              <span className="err">The last run failed: {live?.error ?? jobQ.data?.progress.error ?? "unknown error"}</span>
            ) : (
              <>
                <b>{stageOf(progress) === "COLLECTING" ? `Searching the web and extracting ${view.noun}` : STAGE_LABELS[stageOf(progress)] ?? "Working"}…</b>{" "}
                <span style={{ color: "var(--text-2)" }}>
                  {progress?.progress.records ? `${progress.progress.records} records so far · ` : ""}
                  live web research usually takes about a minute
                </span>
                <div className="bar">
                  <i style={{ width: `${percentOf(progress, runStartedAt)}%` }} />
                </div>
              </>
            )}
          </div>
        )}

        {!version ? (
          <div className="empty">
            <div>
              <h3>{running ? "Digging…" : datasetQ.isLoading ? "Loading…" : "No results yet"}</h3>
              {!running && !datasetQ.isLoading && (
                <>
                  <p>This search hasn’t produced a dataset yet.</p>
                  <button className="btn blue" onClick={() => runAgain.mutate()}>
                    <RotateCw size={14} /> Run now
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="board-body">
            <div className="table-pane">
              <div className="toolbar">
                <div className="seg">
                  {(
                    [
                      ["all", "All", records.length],
                      ["review", "Needs review", reviewCount],
                      ["verified", "Verified", records.length - reviewCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button key={key} className={tab === key ? "on" : undefined} onClick={() => setTab(key)}>
                      {label}
                      <span className="n">{count}</span>
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={14} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${view.noun}`} />
                </label>
              </div>
              <div className="table-scroll">
                <table className="data-grid">
                  <thead>
                    <tr>
                      <th className="n">#</th>
                      {[...view.columns.map(([key, label]) => ({ key, label })), { key: "status", label: "Verification" }].map((column, index) => (
                        <Fragment key={column.key}>
                        <th
                          style={{ cursor: "pointer" }}
                          onClick={() =>
                            setSort((current) =>
                              current?.key === column.key
                                ? current.dir === 1
                                  ? { key: column.key, dir: -1 }
                                  : null
                                : { key: column.key, dir: 1 },
                            )
                          }
                        >
                          {column.label}
                          {sort?.key === column.key ? (
                            <span className="f">{sort.dir === 1 ? "▲" : "▼"}</span>
                          ) : (
                            <Filter size={11} className="f" />
                          )}
                        </th>
                        {index === 0 && <th title="Who has been contacted — click a row’s mark to change it">Outreach</th>}
                        </Fragment>
                      ))}
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((record) => {
                      const status = statusText(record);
                      const mark = outreach[record.canonicalEntityId];
                      return (
                        <tr
                          key={record.id}
                          className={panel?.kind === "record" && panel.key === record.canonicalEntityId ? "sel" : undefined}
                          onClick={() => setPanel({ kind: "record", key: record.canonicalEntityId })}
                        >
                          <td className="n">{record.rank}</td>
                          {view.columns.map(([key], index) => (
                            <Fragment key={key}>
                              <Cell className={index === 0 ? "co" : undefined} value={record.fields[key]} />
                              {index === 0 && (
                                <td className="oc">
                                  <OutreachButton status={mark?.status ?? "pending"} onChange={(next) => void setOutreach(record.canonicalEntityId, { status: next })} />
                                </td>
                              )}
                            </Fragment>
                          ))}
                          <td>
                            <span className={`st${status === "Needs review" ? " review" : status === "Verified" ? "" : " warn"}`}>{status}</span>
                          </td>
                          <NoteCell note={mark?.note ?? ""} who={mark?.updatedBy ?? null} onSave={(note) => void setOutreach(record.canonicalEntityId, { note })} />
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={view.columns.length + 4} style={{ textAlign: "center", color: "var(--text-3)", padding: 30 }}>
                          Nothing matches this view.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {panel?.kind === "diff" && <DiffPanel diff={diff} onClose={() => setPanel(null)} />}
            {selected && (
              <RecordPanel
                record={selected}
                view={view}
                conflicts={conflictsFor.get(selected.id) ?? []}
                versionNumber={version.versionNumber}
                resolving={resolve.isPending ? resolve.variables?.id : undefined}
                onResolve={(id, decision) => resolve.mutate({ id, decision })}
                resolveError={resolve.isError ? resolve.error.message : null}
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        )}

        <div className="board-foot">
          Dig · collected, ranked, and traced back to source{version ? ` · v${version.versionNumber} of this dataset` : ""}
        </div>
      </div>
    </AppWindow>
  );
}

/** The search's name; click to rename it inline. Enter or clicking away saves, Escape cancels. */
function EditableTitle({ jobId, name }: { jobId: string; name: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async (value: string | null) => {
    const next = value?.trim();
    if (!next || next === name) return setEditing(false);
    setSaving(true);
    try {
      const { job } = await api<{ job: JobDetail["job"] }>(`/api/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ name: next }) });
      client.setQueryData<JobDetail>(["job", jobId], (current) => (current ? { ...current, job: { ...current.job, name: job.name } } : current));
      void client.invalidateQueries({ queryKey: ["jobs"] });
      setEditing(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return (
      <input
        className="title-edit"
        aria-label="Rename this search"
        defaultValue={name}
        autoFocus
        disabled={saving}
        maxLength={180}
        onFocus={(focus) => focus.target.select()}
        onBlur={(blur) => void save(blur.target.value)}
        onKeyDown={(key) => {
          if (key.key === "Enter") void save(key.currentTarget.value);
          if (key.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <h1 className="title-view">
      <button onClick={() => setEditing(true)} title="Rename this search">
        {name}
        <Pencil size={14} className="title-pencil" />
      </button>
    </h1>
  );
}

function intentLabel(intent: string) {
  const words = intent.replace(/_LOOKUP$/, "").toLowerCase().replace(/_/g, " ");
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words} lookup`;
}

type OutreachStatus = "pending" | "interested" | "declined";
interface Outreach {
  status: OutreachStatus;
  note: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

const OUTREACH: Record<OutreachStatus, { label: string; next: OutreachStatus }> = {
  pending: { label: "Not contacted", next: "interested" },
  interested: { label: "Confirmed interested", next: "declined" },
  declined: { label: "Declined", next: "pending" },
};

/** Click to cycle: not contacted → interested → declined → not contacted. */
function OutreachButton({ status, onChange }: { status: OutreachStatus; onChange: (next: OutreachStatus) => void }) {
  const meta = OUTREACH[status] ?? OUTREACH.pending;
  return (
    <button
      className={`ob ${status}`}
      title={`${meta.label} — click to mark ${OUTREACH[meta.next].label.toLowerCase()}`}
      aria-label={`Outreach: ${meta.label}. Click to change.`}
      onClick={(click) => {
        click.stopPropagation();
        onChange(meta.next);
      }}
    >
      {status === "interested" ? <Check size={13} strokeWidth={3} /> : status === "declined" ? <X size={13} strokeWidth={3} /> : <Clock size={12} />}
    </button>
  );
}

/** A short shared note; click to edit. Enter or clicking away saves, Escape cancels. */
function NoteCell({ note, who, onSave }: { note: string; who: string | null; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    const finish = (value: string | null) => {
      setEditing(false);
      if (value !== null && value.trim() !== note) onSave(value.trim());
    };
    return (
      <td className="note editing" onClick={(click) => click.stopPropagation()}>
        <input
          autoFocus
          defaultValue={note}
          maxLength={280}
          placeholder="e.g. will get back to us next week"
          onBlur={(blur) => finish(blur.target.value)}
          onKeyDown={(key) => {
            if (key.key === "Enter") finish(key.currentTarget.value);
            if (key.key === "Escape") finish(null);
          }}
        />
      </td>
    );
  }
  return (
    <td
      className={`note${note ? "" : " empty"}`}
      title={note ? `${note}${who ? ` — ${who}` : ""}` : "Add a note"}
      onClick={(click) => {
        click.stopPropagation();
        setEditing(true);
      }}
    >
      {note || "Add note"}
    </td>
  );
}

function OutreachSummary({ records, outreach }: { records: DatasetRecord[]; outreach: Record<string, Outreach> }) {
  const count = (status: OutreachStatus) => records.filter((record) => (outreach[record.canonicalEntityId]?.status ?? "pending") === status).length;
  return (
    <span className="outreach-sum">
      Outreach: <b style={{ color: "#248a3d" }}>{count("interested")}</b> interested · <b style={{ color: "#c62828" }}>{count("declined")}</b> declined ·{" "}
      <b>{count("pending")}</b> not contacted
    </span>
  );
}

function Cell({ value, className }: { value?: string; className?: string }) {
  return value ? (
    <td className={className} title={value}>
      {value}
    </td>
  ) : (
    <td className="muted">—</td>
  );
}

function RecordPanel(props: {
  record: DatasetRecord;
  view: { columns: Pair[]; cards: Pair[] };
  conflicts: Conflict[];
  versionNumber: number;
  resolving?: string;
  onResolve: (id: string, decision: "NEW" | "OLD") => void;
  resolveError: string | null;
  onClose: () => void;
}) {
  const { record } = props;
  const pending = props.conflicts.filter((conflict) => conflict.status === "PENDING");
  const settled = props.conflicts.filter((conflict) => conflict.status !== "PENDING");
  const [primary, ...rest] = props.view.columns.map(([key]) => key);
  const subtitle = rest.map((key) => record.fields[key]).filter(Boolean).slice(0, 2).join(" · ");
  return (
    <aside className="detail">
      <div className="detail-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{record.fields[primary ?? ""] ?? record.label}</h2>
          <div className="sub">{subtitle}</div>
        </div>
        <button className="btn" onClick={props.onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="detail-body">
        {pending.map((conflict) => (
          <div key={conflict.id} className="card conflict">
            <h4>
              <AlertTriangle size={16} color="#f0a030" /> Conflict on “{conflict.field}”
            </h4>
            <div className="when">detected on run · {day(conflict.detectedAt, true)}</div>
            <div className="vbox">
              <div className="k">
                <span>PREVIOUS</span>
                <span>{day(conflict.oldEvidence?.collectedAt)}</span>
              </div>
              <div className="v">{conflict.oldValue || "—"}</div>
            </div>
            <div className="vbox new">
              <div className="k">
                <span>NEW</span>
                <span>{day(conflict.newEvidence?.collectedAt ?? conflict.detectedAt)}</span>
              </div>
              <div className="v">{conflict.newValue || "—"}</div>
            </div>
            {conflict.reason && (
              <p className="why">
                <b>Jev:</b> {conflict.reason}
              </p>
            )}
            <div className="actions">
              <button className="btn blue" disabled={Boolean(props.resolving)} onClick={() => props.onResolve(conflict.id, "NEW")}>
                Keep new
              </button>
              <button className="btn" disabled={Boolean(props.resolving)} onClick={() => props.onResolve(conflict.id, "OLD")}>
                Keep previous
              </button>
            </div>
            {props.resolveError && <p className="err" style={{ margin: "10px 0 0" }}>Couldn’t save that decision: {props.resolveError}</p>}
          </div>
        ))}

        {settled.map((conflict) => (
          <div key={conflict.id} className="card" style={{ fontSize: 13, color: "#3a3a3c" }}>
            <div className="cap">
              {conflict.status === "AUTO_RESOLVED" ? "Auto-resolved by Jev" : "Resolved by you"} · {conflict.field}
            </div>
            Kept <b>{conflict.decision === "OLD" ? conflict.oldValue : conflict.newValue}</b>
            {conflict.decision !== "OLD" && conflict.oldValue ? <> over {conflict.oldValue}</> : null}.
            {conflict.reason && <div style={{ color: "var(--text-2)", marginTop: 6 }}>{conflict.reason}</div>}
          </div>
        ))}

        {props.view.cards.map(([key, label]) => {
          const value = record.fields[key];
          if (!value) return null;
          return (
            <FieldCard
              key={key}
              field={key}
              label={label}
              value={value}
              evidence={pickEvidence(record.evidence, key, value)}
              versionNumber={props.versionNumber}
            />
          );
        })}
      </div>
    </aside>
  );
}

function pickEvidence(evidence: Evidence[], field: string, value: string) {
  const forField = evidence.filter((item) => item.fieldName === field);
  return forField.find((item) => item.excerpt.toLowerCase().includes(value.toLowerCase())) ?? forField[0];
}

function FieldCard(props: { field: string; label: string; value: string; evidence?: Evidence; versionNumber: number }) {
  const { field, value, evidence } = props;
  if (field === "last_verified") {
    return (
      <div className="card">
        <div className="cap">{props.label}</div>
        <div className="val">{day(value, true)}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          Collected this run{props.versionNumber > 1 ? `, superseding the v${props.versionNumber - 1} snapshot` : ""}.
        </div>
      </div>
    );
  }
  const quote = evidence && !LINK_FIELDS.has(field) ? around(evidence.excerpt, value) : null;
  return (
    <div className="card">
      <div className="cap">{props.label}</div>
      <div className="val">
        {LINK_FIELDS.has(field) ? (
          <a href={value} target="_blank" rel="noreferrer" style={{ color: "var(--link)", textDecoration: "none" }}>
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          value
        )}
      </div>
      {quote && (
        <div className="quote">
          “{quote.before}
          <b>{quote.hit}</b>
          {quote.after}”
        </div>
      )}
      {evidence && (
        <div className="src">
          <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" title={evidence.sourceTitle}>
            {evidence.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
          <span className={`chip ${evidence.authority}`}>{evidence.authority.toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

function DiffPanel({ diff, onClose }: { diff: Diff | null; onClose: () => void }) {
  const groups: Array<[string, Diff["added"], string]> = diff
    ? [
        ["Added", diff.added, "#248a3d"],
        ["Changed", diff.changed, "#b26a00"],
        ["Dropped", diff.removed, "#c62828"],
      ]
    : [];
  return (
    <aside className="detail">
      <div className="detail-head">
        <div style={{ flex: 1 }}>
          <h2>Full diff</h2>
          <div className="sub">{diff?.firstVersion || !diff ? "This is the first version — nothing to compare yet." : "Compared with the previous run"}</div>
        </div>
        <button className="btn" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="detail-body">
        {diff && !diff.firstVersion &&
          groups.map(([title, entries, color]) => (
            <div key={title} className="card">
              <div className="cap" style={{ color }}>
                {title} · {entries.length}
              </div>
              {entries.length === 0 && <div style={{ fontSize: 13, color: "var(--text-3)" }}>None</div>}
              {entries.map((entry) => (
                <div key={entry.canonicalEntityId} style={{ fontSize: 13, padding: "5px 0", borderTop: "1px solid #f0f0f2" }}>
                  <b>{entry.label}</b>
                  {entry.fields.map((change) => (
                    <div key={change.field} style={{ color: "var(--text-2)" }}>
                      {change.field}: {change.from || "—"} → {change.to || "—"}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
      </div>
    </aside>
  );
}

function around(excerpt: string, value: string) {
  const at = excerpt.toLowerCase().indexOf(value.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - 110);
  const end = Math.min(excerpt.length, at + value.length + 110);
  return {
    before: (start > 0 ? "…" : "") + excerpt.slice(start, at),
    hit: excerpt.slice(at, at + value.length),
    after: excerpt.slice(at + value.length, end) + (end < excerpt.length ? "…" : ""),
  };
}

function day(iso: string | undefined | null, withYear = false) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

function when(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return new Date().toDateString() === date.toDateString() ? `today at ${time}` : `${day(iso)} at ${time}`;
}

function stageOf(progress: JobProgress | null) {
  const stage = progress?.progress.stage;
  return stage && stage !== "QUEUED" ? stage : progress?.status ?? "QUEUED";
}

/** Real pipeline percent once stages report; during the ~1 min live collection, an elapsed-time estimate. */
function percentOf(progress: JobProgress | null, startedAt: number) {
  const reported = progress?.progress.percent ?? 0;
  if (stageOf(progress) !== "COLLECTING" && stageOf(progress) !== "QUEUED") return Math.max(60, reported);
  const seconds = (Date.now() - startedAt) / 1000;
  return Math.max(reported, Math.round(4 + 56 * (1 - Math.exp(-seconds / 35))));
}

function emptyProgress(stage: string): JobProgress["progress"] {
  return { stage, percent: 2, sourcesPlanned: 0, sourcesScanned: 0, documents: 0, records: 0, valid: 0, duplicates: 0, conflicts: 0 };
}
