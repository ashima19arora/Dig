import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AppWindow } from "../components/Shell";
import { eventStored, ROOT_CRUMB, useEvents, type DigEvent } from "../events";
import { notify, notifyError } from "../toast";

interface KickoffTask {
  id: string;
  title: string;
  why: string;
  due: string;
  search: { folder: string; query: string } | null;
}

interface KickoffPlan {
  eventName: string;
  eventDate: string;
  today: string;
  daysLeft: number | null;
  urgent: boolean;
  summary: string;
  assumptions: string[];
  phases: Array<{ title: string; start: string; end: string; tasks: KickoffTask[] }>;
}

interface Saved {
  request: string;
  plan: KickoffPlan;
  done: string[];
  updatedAt: string;
}

const FOLDER_NOUN: Record<string, string> = {
  sponsors: "sponsors",
  judges: "judges and speakers",
  jobs: "roles",
  leads: "leads",
  competitors: "competitors",
};

function shortDate(iso: string) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
}

/** Kickoff: tell it about the event and the time you have; it writes a dated plan, saved with the event. */
export function Kickoff() {
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") ?? "";
  const { events } = useEvents();
  const client = useQueryClient();
  const [request, setRequest] = useState("");

  const savedQ = useQuery({
    queryKey: ["kickoff", eventId],
    queryFn: () => api<{ saved: Saved | null }>(`/api/kickoff/${eventId}`),
    enabled: Boolean(eventId),
  });
  const saved = eventId ? savedQ.data?.saved ?? null : null;

  // Picking an event with an earlier plan shows what was asked last time.
  useEffect(() => {
    setRequest(saved?.request ?? "");
  }, [eventId, saved?.request]);

  const plan = useMutation({
    mutationFn: () =>
      api<{ event: DigEvent; saved: Saved }>("/api/kickoff", {
        method: "POST",
        body: JSON.stringify({ request, ...(eventId ? { eventId } : {}) }),
      }),
    onSuccess: (result) => {
      eventStored(result.event);
      client.setQueryData(["kickoff", result.event.id], { saved: result.saved });
      if (!eventId) notify(`Created the event “${result.event.name}” with its plan`, "info");
      setParams({ event: result.event.id });
    },
    onError: (error) => notifyError(error),
  });

  const toggle = async (taskId: string) => {
    if (!saved || !eventId) return;
    const done = saved.done.includes(taskId) ? saved.done.filter((id) => id !== taskId) : [...saved.done, taskId];
    client.setQueryData(["kickoff", eventId], { saved: { ...saved, done } });
    try {
      await api(`/api/kickoff/${eventId}/done`, { method: "PUT", body: JSON.stringify({ done }) });
    } catch (error) {
      client.setQueryData(["kickoff", eventId], { saved });
      notifyError(error);
    }
  };

  const view = saved?.plan;
  const currentEvent = events.find((event) => event.id === eventId);
  const navigate = useNavigate();
  /** True when this event's folder already holds a search, so the task opens its results. */
  const filedIn = (folder: string) => Boolean(currentEvent?.jobs[folder as keyof DigEvent["jobs"]]);
  /** An empty folder: start the search with the plan's query and go to the folder to watch it run. */
  const startSearch = useMutation({
    mutationFn: (query: string) =>
      api<{ folder: string; event: DigEvent }>(`/api/events/${eventId}/searches`, { method: "POST", body: JSON.stringify({ query }) }),
    onSuccess: (result) => {
      eventStored(result.event);
      navigate(`/events/${eventId}/${result.folder}`);
    },
    onError: (error) => notifyError(error),
  });
  const total = view?.phases.reduce((sum, phase) => sum + phase.tasks.length, 0) ?? 0;

  return (
    <AppWindow crumbs={[{ label: ROOT_CRUMB, to: "/dashboard" }, { label: "Toolkit", to: "/agents" }, { label: "Kickoff" }]} sidebar="agents">
      <div className="content">
      <div className="kickoff">
        <header>
          <h2>Kickoff</h2>
          <p>Tell Kickoff about your event and how much time you have. It writes a dated plan and saves it with the event.</p>
        </header>

        <div className="kickoff-form">
          <select aria-label="Event" value={eventId} onChange={(event) => setParams(event.target.value ? { event: event.target.value } : {})}>
            <option value="">New event (Kickoff creates it)</option>
            {events
              .filter((event) => !event.archived)
              .map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                  {event.date ? ` · ${event.date}` : ""}
                </option>
              ))}
          </select>
          <textarea
            rows={4}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            maxLength={2000}
            placeholder={
              eventId
                ? "What has changed or what is worrying you? e.g. “The date moved to 10 Oct. No sponsors or judges confirmed yet.”"
                : "Describe the event in your own words. e.g. “Our first developer conference, about 200 people in Mumbai, sometime next month. We have never done this.”"
            }
          />
          <div className="kickoff-actions">
            <button className="btn blue" disabled={plan.isPending || request.trim().length < 10} onClick={() => plan.mutate()}>
              {plan.isPending ? "Planning… about 20 seconds" : view ? "Re-plan" : "Plan it"}
            </button>
            {view && <span>Re-planning replaces this plan and clears its checkboxes.</span>}
          </div>
        </div>

        {eventId && savedQ.isLoading && <p className="kickoff-muted">Loading the plan…</p>}

        {view && (
          <section className="kickoff-plan">
            <div className="kickoff-plan-head">
              <div>
                <h3>{view.eventName}</h3>
                <div className="kickoff-meta">
                  {view.eventDate ? shortDate(view.eventDate) : "No date yet"}
                  {view.daysLeft !== null && ` · ${view.daysLeft} days left`}
                  {view.urgent && <b> · Tight timeline</b>}
                  {` · ${saved?.done.length ?? 0} of ${total} done`}
                </div>
              </div>
              <Link to={`/events/${eventId}`} className="kickoff-open">Open event</Link>
            </div>
            {view.summary && <p className="kickoff-summary">{view.summary}</p>}
            {view.assumptions.length > 0 && (
              <p className="kickoff-assumed">Assumed: {view.assumptions.join(" · ")}. Re-plan with the real details if any are wrong.</p>
            )}

            {view.phases.map((phase) => (
              <div key={phase.title} className="kickoff-phase">
                <h4>
                  {phase.title}
                  <span>
                    {shortDate(phase.start)}
                    {phase.end !== phase.start ? ` – ${shortDate(phase.end)}` : ""}
                  </span>
                </h4>
                <ul>
                  {phase.tasks.map((task) => {
                    const done = saved?.done.includes(task.id) ?? false;
                    return (
                      <li key={task.id} className={done ? "done" : undefined}>
                        <input type="checkbox" checked={done} onChange={() => void toggle(task.id)} aria-label={`Done: ${task.title}`} />
                        <div className="kickoff-task">
                          <div className="kickoff-task-title">{task.title}</div>
                          {task.why && <div className="kickoff-why">{task.why}</div>}
                        </div>
                        {task.search ? (
                          filedIn(task.search.folder) ? (
                            <Link className="kickoff-find" to={`/events/${eventId}/${task.search.folder}`} title="Open the results already in this folder">
                              Open {FOLDER_NOUN[task.search.folder] ?? "results"} <ArrowRight size={12} />
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className="kickoff-find"
                              title={`Starts the search: ${task.search.query}`}
                              disabled={startSearch.isPending}
                              onClick={() => startSearch.mutate(task.search!.query)}
                            >
                              {startSearch.isPending && startSearch.variables === task.search.query ? "Starting…" : `Find ${FOLDER_NOUN[task.search.folder] ?? "results"}`}{" "}
                              <ArrowRight size={12} />
                            </button>
                          )
                        ) : (
                          <span />
                        )}
                        <span className="kickoff-due">{shortDate(task.due)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="kickoff-muted">Suggested plan from Dig’s assistant. Adjust it to your situation.</p>
          </section>
        )}
      </div>
      </div>
    </AppWindow>
  );
}
