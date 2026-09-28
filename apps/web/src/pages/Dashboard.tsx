import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppWindow, FolderTile, NewFolderIcon } from "../components/Shell";
import { createEvent, ORG_NAME, updateEvent, useEvents, type DigEvent } from "../events";
import { EventSheet } from "./EventSheet";

const TITLES = { favourites: "Favourites", recent: "Recent", archived: "Archived" } as const;

export function Dashboard() {
  const [params] = useSearchParams();
  const view = (["favourites", "recent", "archived"].includes(params.get("view") ?? "") ? params.get("view") : "recent") as keyof typeof TITLES;
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
  return (
    <FolderTile
      to={`/events/${event.id}`}
      name={event.name}
      starred={event.favourite}
      onRename={(name) => updateEvent(event.id, { name })}
      menu={[
        {
          label: event.favourite ? "Remove from Favourites" : "Add to Favourites",
          onClick: () => updateEvent(event.id, { favourite: !event.favourite }),
        },
        { label: event.archived ? "Unarchive" : "Archive", onClick: () => updateEvent(event.id, { archived: !event.archived }) },
      ]}
    />
  );
}
