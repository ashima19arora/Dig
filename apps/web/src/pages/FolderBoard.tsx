import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ago, api, type JobSummary } from "../api";
import { AppWindow, FolderIcon, type Crumb } from "../components/Shell";
import { FOLDERS, linkJob, useEvents, type FolderKey } from "../events";
import { NewQuerySheet } from "./EventFolder";
import { JobBoard } from "./JobBoard";

/** /events/:eventId/:folder — shows the Job Board for the job linked to that event folder. */
export function FolderBoard() {
  const { eventId = "", folder = "" } = useParams();
  const event = useEvents().find((item) => item.id === eventId);
  const meta = FOLDERS.find((item) => item.key === folder);
  if (!event || !meta) return <Navigate to={event ? `/events/${eventId}` : "/dashboard"} replace />;

  const folderIcon = <FolderIcon size={17} />;
  const crumbs: Crumb[] = [
    { label: event.name, to: `/events/${event.id}`, icon: folderIcon },
    { label: "Job Board", to: `/events/${event.id}`, icon: folderIcon },
  ];
  const jobId = event.jobs[meta.key];
  if (jobId) return <JobBoard jobId={jobId} crumbs={[...crumbs, { label: meta.label, icon: folderIcon }]} />;
  return <Unlinked eventId={event.id} folder={meta.key} label={meta.label} live={meta.live} crumbs={[...crumbs, { label: meta.label, icon: folderIcon }]} />;
}

function Unlinked(props: { eventId: string; folder: FolderKey; label: string; live: boolean; crumbs: Crumb[] }) {
  const event = useEvents().find((item) => item.id === props.eventId);
  const [asking, setAsking] = useState(false);
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<{ jobs: JobSummary[] }>("/api/jobs"),
    enabled: props.live,
  });
  // Existing live sponsor searches that already have a dataset can be filed under this folder.
  const reusable = (jobs.data?.jobs ?? []).filter(
    (job) => !job.demo && job.blueprint.intent === "SPONSOR_LOOKUP" && job.versionNumber !== null,
  );

  return (
    <AppWindow crumbs={props.crumbs} sidebar={false}>
      <div className="empty">
        {!props.live ? (
          <div style={{ maxWidth: 420 }}>
            <h3>{props.label} isn’t wired up yet</h3>
            <p>
              The live research pipeline only supports sponsor research today. There’s no {props.label.toLowerCase()} intent in
              the backend yet, so this folder has nothing real to show.
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 520, width: "100%" }}>
            <h3>No sponsor search in this folder yet</h3>
            <p style={{ margin: "0 0 16px" }}>Start a new live search, or file an existing one here.</p>
            <button className="btn blue" onClick={() => setAsking(true)}>
              Start a sponsor search
            </button>
            {reusable.length > 0 && (
              <div className="card" style={{ marginTop: 24, textAlign: "left", padding: 0, maxHeight: 300, overflow: "auto" }}>
                {reusable.map((job) => (
                  <button
                    key={job.id}
                    className="side-item"
                    style={{ borderRadius: 0, padding: "10px 14px", borderBottom: "1px solid #f0f0f2" }}
                    onClick={() => linkJob(props.eventId, props.folder, job.id)}
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
        )}
      </div>
      {asking && event && <NewQuerySheet event={event} onClose={() => setAsking(false)} />}
    </AppWindow>
  );
}
