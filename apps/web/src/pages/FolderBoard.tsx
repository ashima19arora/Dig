import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { FOLDER_INTENTS } from "@dig/schemas";
import { ago, api, type JobSummary } from "../api";
import { AppWindow, FolderIcon, type Crumb } from "../components/Shell";
import { FOLDERS, folderLabel, linkJob, ROOT_CRUMB, useEvents, type DigEvent, type FolderKey } from "../events";
import { NewQuerySheet } from "./EventFolder";
import { JobBoard } from "./JobBoard";

/** /events/:eventId/:folder — the Job Board for the search filed in that event folder. */
export function FolderBoard() {
  const { eventId = "", folder = "" } = useParams();
  const { events, loading } = useEvents();
  const event = events.find((item) => item.id === eventId);
  const meta = FOLDERS.find((item) => item.key === folder);
  if (loading) return <AppWindow crumbs={[{ label: ROOT_CRUMB, to: "/dashboard" }]} sidebar={false}><div className="empty">Loading…</div></AppWindow>;
  if (!event || !meta) return <Navigate to={event ? `/events/${eventId}` : "/dashboard"} replace />;

  const folderIcon = <FolderIcon size={17} />;
  const label = folderLabel(event, meta.key);
  const crumbs: Crumb[] = [
    { label: event.name, to: `/events/${event.id}`, icon: folderIcon },
    { label: "Job Board", to: `/events/${event.id}`, icon: folderIcon },
    { label, icon: folderIcon },
  ];
  const jobId = event.jobs[meta.key];
  if (jobId) return <JobBoard key={jobId} jobId={jobId} crumbs={crumbs} />;
  return <Unlinked event={event} folder={meta.key} label={label} crumbs={crumbs} />;
}

function Unlinked(props: { event: DigEvent; folder: FolderKey; label: string; crumbs: Crumb[] }) {
  const [asking, setAsking] = useState(false);
  const [initialQ, setInitialQ] = useState<string | undefined>(undefined);
  const meta = FOLDERS.find((item) => item.key === props.folder)!;
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<{ jobs: JobSummary[] }>("/api/jobs") });
  // Your earlier searches of the same kind that already have results can be filed here.
  const reusable = (jobs.data?.jobs ?? []).filter((job) => job.blueprint.intent === FOLDER_INTENTS[props.folder] && job.versionNumber !== null);

  const startWith = (q: string) => {
    setInitialQ(q);
    setAsking(true);
  };

  return (
    <AppWindow crumbs={props.crumbs} sidebar={false}>
      <div className="empty">
        <div style={{ maxWidth: 520, width: "100%" }}>
          <h3>No {meta.noun} search in this folder yet</h3>
          <p style={{ margin: "0 0 16px" }}>Start a new live search, or file one of your earlier searches here.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn blue" onClick={() => startWith(meta.example)}>
              Start a {props.folder === "judges" ? "judge & mentor" : meta.noun} search
            </button>
            {props.folder === "judges" && (
              <button className="btn" onClick={() => startWith("Keynote speakers and tech experts for our hackathon in India")}>
                Start a speaker search
              </button>
            )}
          </div>
          {jobs.isError && <p className="err" style={{ marginTop: 16 }}>Couldn’t load your earlier searches: {String(jobs.error)}</p>}
          {reusable.length > 0 && (
            <div className="card" style={{ marginTop: 24, textAlign: "left", padding: 0, maxHeight: 300, overflow: "auto" }}>
              {reusable.map((job) => (
                <button
                  key={job.id}
                  className="side-item"
                  style={{ borderRadius: 0, padding: "10px 14px", borderBottom: "1px solid #f0f0f2" }}
                  onClick={() => void linkJob(props.event.id, props.folder, job.id)}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: 600 }}>{job.name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-2)" }}>
                      “{job.query}” · {job.rowCount} records · {ago(job.lastRunAt ?? job.updatedAt)}
                    </span>
                  </span>
                  <span className="count">Use</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {asking && <NewQuerySheet event={props.event} initialQuery={initialQ ?? meta.example} onClose={() => setAsking(false)} />}
    </AppWindow>
  );
}
