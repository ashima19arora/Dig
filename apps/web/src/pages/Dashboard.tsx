import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppWindow, FolderIcon, NewFolderIcon, type SideView } from "../components/Shell";
import { createEvent, ORG_NAME, updateEvent, useEvents, type DigEvent } from "../events";
import { EventSheet } from "./EventSheet";

const TITLES = { favourites: "Favourites", recent: "Recent", archived: "Archived" } as const;

export function Dashboard() {
  const [params] = useSearchParams();
  const view = (["favourites", "recent", "archived"].includes(params.get("view") ?? "") ? params.get("view") : "recent") as Exclude<SideView, null>;
  const events = useEvents();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const shown = events
    .filter((event) => (view === "archived" ? event.archived : !event.archived && (view === "recent" || event.favourite)))
    .filter((event) => event.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  return (
    <AppWindow
      crumbs={[{ label: ORG_NAME }]}
      sidebar={view}
      search={{ value: query, onChange: setQuery }}
      status={`${shown.length} event${shown.length === 1 ? "" : "s"}`}
    >
      <div className="content">
        <h5>{TITLES[view]}</h5>
        <div className="folders">
          {shown.map((event) => (
            <EventTile key={event.id} event={event} />
          ))}
          {view !== "archived" && (
            <button className="folder new" onClick={() => setCreating(true)}>
              <NewFolderIcon />
              <span className="name">New Event</span>
            </button>
          )}
        </div>
      </div>
      {creating && (
        <EventSheet
          title="New event"
          submitLabel="Create event"
          onCancel={() => setCreating(false)}
          onSubmit={(values) => {
            const event = createEvent(values);
            setCreating(false);
            navigate(`/events/${event.id}`);
          }}
        />
      )}
    </AppWindow>
  );
}

function EventTile({ event }: { event: DigEvent }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <Link to={`/events/${event.id}`} className="folder">
      <FolderIcon starred={event.favourite} />
      <span className="name">{event.name}</span>
      <button
        className={`more${open ? " open" : ""}`}
        aria-label={`More actions for ${event.name}`}
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
          <button onClick={() => updateEvent(event.id, { favourite: !event.favourite })}>
            {event.favourite ? "Remove from Favourites" : "Add to Favourites"}
          </button>
          <button onClick={() => updateEvent(event.id, { archived: !event.archived })}>
            {event.archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      )}
    </Link>
  );
}
