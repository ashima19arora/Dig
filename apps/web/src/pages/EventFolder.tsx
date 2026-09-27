import { BookOpen, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, type JobSummary } from "../api";
import { AppWindow, FolderIcon, NewFolderIcon } from "../components/Shell";
import { FOLDERS, linkJob, ORG_NAME, touchEvent, updateEvent, useEvents, type DigEvent, type FolderKey } from "../events";
import { EventSheet } from "./EventSheet";

export function EventFolder() {
  const { eventId = "" } = useParams();
  const event = useEvents().find((item) => item.id === eventId);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (event) touchEvent(event.id);
    // only on open, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!event) return <Navigate to="/dashboard" replace />;

  return (
    <AppWindow
      crumbs={[{ label: ORG_NAME, to: "/dashboard" }, { label: event.name }]}
      sidebar={null}
      actions={
        <>
          <button className="btn amber" onClick={() => setAsking(true)}>
            <Plus size={15} strokeWidth={2.4} /> New Query
          </button>
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit README
          </button>
        </>
      }
      search={{ value: "", onChange: () => undefined }}
      status={`${FOLDERS.length} folders`}
    >
      <div className="content">
        <section className="readme">
          <header>
            <BookOpen size={14} /> README
          </header>
          <div className="body">
            <h1>{event.name}</h1>
            {event.description && <p>{event.description}</p>}
            <ul>
              {event.date && (
                <li>
                  <b>Event date:</b> {event.date}
                </li>
              )}
              {event.targets && (
                <li>
                  <b>Targets:</b> {event.targets}
                </li>
              )}
            </ul>
          </div>
        </section>

        <div className="label-muted">Job Types</div>
        <div className="folders">
          {FOLDERS.map((folder) => (
            <JobFolder key={folder.key} event={event} folder={folder.key} label={folder.label} />
          ))}
          <button className="folder new" onClick={() => setAsking(true)}>
            <NewFolderIcon />
            <span className="name">New Query</span>
          </button>
        </div>
      </div>

      {editing && (
        <EventSheet
          title="Edit README"
          submitLabel="Save"
          initial={event}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => {
            updateEvent(event.id, values);
            setEditing(false);
          }}
        />
      )}
      {asking && <NewQuerySheet event={event} onClose={() => setAsking(false)} />}
    </AppWindow>
  );
}

function JobFolder({ event, folder, label }: { event: DigEvent; folder: FolderKey; label: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  const linked = event.jobs[folder];
  return (
    <Link to={`/events/${event.id}/${folder}`} className="folder">
      <FolderIcon />
      <span className="name">{label}</span>
      <button
        className={`more${open ? " open" : ""}`}
        aria-label={`More actions for ${label}`}
        onClick={(click) => {
          click.preventDefault();
          click.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="menu" onClick={(click) => click.preventDefault()}>
          <button onClick={() => navigate(`/events/${event.id}/${folder}`)}>Open</button>
          {linked && (
            <button onClick={() => updateEvent(event.id, { jobs: { ...event.jobs, [folder]: undefined } })}>
              Unlink current search
            </button>
          )}
        </div>
      )}
    </Link>
  );
}

/** Creates a real live job, links it to this event's folder, starts it, and opens the Job Board. */
export function NewQuerySheet({ event, onClose, initialQuery }: { event: DigEvent; onClose: () => void; initialQuery?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery ?? "find sponsors for hackathons in India");
  const [folder, setFolder] = useState<FolderKey>("sponsors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = FOLDERS.find((item) => item.key === folder)?.live ?? false;

  const submit = async (form: FormEvent) => {
    form.preventDefault();
    if (!live || query.trim().length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const { job } = await api<{ job: JobSummary }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), live: true }),
      });
      await api("/api/jobs/" + job.id + "/run", { method: "POST" });
      linkJob(event.id, folder, job.id);
      navigate(`/events/${event.id}/${folder}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the search.");
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <form className="sheet" onSubmit={submit} onClick={(click) => click.stopPropagation()}>
        <h3>New query</h3>
        <p className="hint">Dig searches the live web, keeps only facts it can quote from a source page, and files the result under this event.</p>
        <label>Folder</label>
        <select value={folder} onChange={(change) => setFolder(change.target.value as FolderKey)}>
          {FOLDERS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
              {item.live ? "" : " — not available yet"}
            </option>
          ))}
        </select>
        <label>What should Dig find?</label>
        <textarea rows={3} value={query} onChange={(change) => setQuery(change.target.value)} autoFocus />
        {!live && <p className="hint" style={{ marginTop: 8 }}>Only sponsor research is wired to the live pipeline so far.</p>}
        {error && <p className="err">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn blue" disabled={busy || !live || query.trim().length < 8}>
            {busy ? "Starting…" : "Start digging"}
          </button>
        </div>
      </form>
    </div>
  );
}
