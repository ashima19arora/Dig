import { BookOpen, Pencil, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type JobSummary } from "../api";
import { AppWindow, FolderTile, NewFolderIcon } from "../components/Shell";
import { FOLDERS, folderLabel, linkJob, ORG_NAME, renameFolder, touchEvent, updateEvent, useEvents, type DigEvent, type FolderKey } from "../events";
import { EventSheet } from "./EventSheet";

export function EventFolder() {
  const { eventId = "" } = useParams();
  const event = useEvents().find((item) => item.id === eventId);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (event) touchEvent(event.id);
    // only on open, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!event) return <Navigate to="/dashboard" replace />;
  const folders = FOLDERS.filter((folder) => folderLabel(event, folder.key).toLowerCase().includes(filter.trim().toLowerCase()));

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
      search={{ value: filter, onChange: setFilter, placeholder: "Search folders" }}
      status={`${folders.length} folder${folders.length === 1 ? "" : "s"}`}
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
          {folders.map((folder) => (
            <JobFolder key={folder.key} event={event} folder={folder.key} />
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

function JobFolder({ event, folder }: { event: DigEvent; folder: FolderKey }) {
  const navigate = useNavigate();
  const linked = event.jobs[folder];
  return (
    <FolderTile
      to={`/events/${event.id}/${folder}`}
      name={folderLabel(event, folder)}
      onRename={(name) => renameFolder(event.id, folder, name)}
      menu={[
        { label: "Open", onClick: () => navigate(`/events/${event.id}/${folder}`) },
        ...(linked
          ? [{ label: "Unlink current search", onClick: () => updateEvent(event.id, { jobs: { ...event.jobs, [folder]: undefined } }) }]
          : []),
      ]}
    />
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
  // What Dig would search for, checked as you type: only sponsor research is supported this pass.
  const [check, setCheck] = useState<{ query: string; supported: boolean; intent: string } | null>(null);
  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 8) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      api<{ supported: boolean; blueprint: { intent: string }; match: { confidence: number } }>("/api/blueprints/preview", {
        method: "POST",
        body: JSON.stringify({ query: trimmed }),
      })
        // A low-confidence match is just the matcher's fallback, so don't claim to know what the search is.
        .then(
          (preview) =>
            !stale &&
            setCheck({ query: trimmed, supported: preview.supported, intent: preview.match.confidence < 0.4 ? "" : preview.blueprint.intent }),
        )
        .catch(() => undefined); // the create call below reports real errors
    }, 350);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);
  const unsupported = check?.query === trimmed && !check.supported ? check.intent : null;

  const submit = async (form: FormEvent) => {
    form.preventDefault();
    if (!live || unsupported || trimmed.length < 8) return;
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
      if (caught instanceof ApiError && caught.code === "UNSUPPORTED_INTENT") {
        setCheck({ query: trimmed, supported: false, intent: "" });
      } else {
        setError(caught instanceof Error ? caught.message : "Could not start the search.");
      }
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
              {folderLabel(event, item.key)}
              {item.live ? "" : " — not available yet"}
            </option>
          ))}
        </select>
        <label>What should Dig find?</label>
        <textarea rows={3} value={query} onChange={(change) => setQuery(change.target.value)} autoFocus />
        {!live && <p className="hint" style={{ marginTop: 8 }}>Only sponsor research is wired to the live pipeline so far.</p>}
        {live && unsupported !== null && (
          <div className="notice" role="status">
            <b>That search isn’t supported yet.</b> {unsupported ? `It reads as ${describeIntent(unsupported)}, but ` : ""}Dig can only
            research <b>sponsors</b> right now. Try something like “find sponsors for hackathons in India”.
          </div>
        )}
        {error && <p className="err">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn blue" disabled={busy || !live || unsupported !== null || trimmed.length < 8}>
            {busy ? "Starting…" : "Start digging"}
          </button>
        </div>
      </form>
    </div>
  );
}

function describeIntent(intent: string) {
  const words = intent.replace(/_LOOKUP$/, "").toLowerCase().replace(/_/g, " ");
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words} search`;
}
