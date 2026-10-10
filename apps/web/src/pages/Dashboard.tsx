import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppWindow, FolderTile, NewFolderIcon } from "../components/Shell";
import { Tip } from "../components/Tip";
import { createEvent, ROOT_CRUMB, updateEvent, useEvents, type DigEvent } from "../events";
import { EventSheet } from "./EventSheet";

const TITLES = { favourites: "Favourites", recent: "Recent", archived: "Archived" } as const;

export function Dashboard() {
  const [params] = useSearchParams();
  const view = (["favourites", "recent", "archived"].includes(params.get("view") ?? "") ? params.get("view") : "recent") as keyof typeof TITLES;
  const { events, loading, error } = useEvents();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const shown = events
    .filter((event) => (view === "archived" ? event.archived : !event.archived && (view === "recent" || event.favourite)))
    .filter((event) => event.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  return (
    <AppWindow
      crumbs={[{ label: ROOT_CRUMB }]}
      sidebar={view}
      search={{ value: query, onChange: setQuery, placeholder: "Search events" }}
      status={loading ? "Loading…" : `${shown.length} event${shown.length === 1 ? "" : "s"}`}
    >
      <div className="content">
        <h5>{TITLES[view]}</h5>
        {error ? (
          <p className="err">Couldn’t load your events: {error instanceof Error ? error.message : String(error)}</p>
        ) : (
          <>
            {!loading && events.length === 0 && (
              <p className="hint-line">Create your first event — each one gets folders for sponsors, judges & mentors, jobs, leads and competitors.</p>
            )}
            <div className="folders">
              {shown.map((event) => (
                <EventTile key={event.id} event={event} />
              ))}
              {view !== "archived" && !loading && (
                <Tip text="Create an event: a hackathon, fest or project. It comes with folders for each kind of search.">
                  <button className="folder new" onClick={() => setCreating(true)}>
                    <NewFolderIcon />
                    <span className="name">New Event</span>
                  </button>
                </Tip>
              )}
            </div>
            {!loading && view !== "recent" && shown.length === 0 && (
              <p className="hint-line">{view === "archived" ? "Nothing archived." : "No favourites yet — use an event’s ⋯ menu to add one."}</p>
            )}
          </>
        )}
      </div>
      {creating && (
        <EventSheet
          title="New event"
          submitLabel="Create event"
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const event = await createEvent(values);
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
    <Tip text={`Open ${event.name}${event.date ? ` (${event.date})` : ""}. Use ··· to star, rename or archive it.`}>
    <FolderTile
      to={`/events/${event.id}`}
      name={event.name}
      starred={event.favourite}
      onRename={(name) => void updateEvent(event.id, { name })}
      menu={[
        {
          label: event.favourite ? "Remove from Favourites" : "Add to Favourites",
          onClick: () => void updateEvent(event.id, { favourite: !event.favourite }),
        },
        { label: event.archived ? "Unarchive" : "Archive", onClick: () => void updateEvent(event.id, { archived: !event.archived }) },
      ]}
    />
    </Tip>
  );
}
