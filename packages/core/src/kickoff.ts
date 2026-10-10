import { FOLDER_KEYS, type FolderKey } from "@dig/schemas";

/**
 * Kickoff: turns "here is my event, here is how much time I have" into a short dated plan.
 * The model drafts it; these rules decide what is kept, so the plan is always usable.
 */

export interface KickoffTask {
  id: string;
  title: string;
  why: string;
  due: string;
  /** A search Dig can run for this task, filed in the event's folder of that kind. */
  search: { folder: FolderKey; query: string } | null;
}

export interface KickoffPhase {
  title: string;
  start: string;
  end: string;
  tasks: KickoffTask[];
}

export interface KickoffPlan {
  eventName: string;
  /** YYYY-MM-DD, or "" when no date was given. */
  eventDate: string;
  today: string;
  daysLeft: number | null;
  urgent: boolean;
  summary: string;
  assumptions: string[];
  phases: KickoffPhase[];
}

const MAX_PHASES = 4;
const MAX_TASKS = 4;
const DAY = 86_400_000;

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const time = Date.parse(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export const KICKOFF_SYSTEM =
  "You are an experienced event organizer helping someone plan an event. Write a short, practical, dated plan.\n" +
  "Rules:\n" +
  "- Work backwards from the event date. If no date is given, plan for 6 weeks from today and say so in assumptions.\n" +
  "- If there are fewer than 30 days left, it is urgent: put the slowest items first (sponsors, venue, judges and speakers, permissions), compress phases, and in the summary name one thing to cut or simplify.\n" +
  "- If it is a first-time event or details are missing, the first phase is \"Decide first\": date, budget, venue, size, and who owns what.\n" +
  "- The first phase should be what to do today or this week. 3 or 4 phases in total, at most 4 tasks each, ordered by date. Fewer, clearer tasks beat a long list.\n" +
  "- Each task: a short imperative title, one plain sentence on why it matters now, and a due date (YYYY-MM-DD) between today and the event date.\n" +
  "- When a task is finding sponsors, judges/mentors/speakers, hiring, leads, or competitors, add a search: folder is one of sponsors, judges, jobs, leads, competitors; query is a plain web research question like \"AI hackathon sponsors in Bangalore\". Otherwise search is null.\n" +
  "- Assumptions: up to 3 short lines, only for things the organizer did NOT say that you had to assume (size, date, budget). Never repeat what they told you. Do not invent facts about them.\n" +
  "- No hype words, no emojis.\n" +
  'Return JSON only: {"eventName": "...", "eventDate": "YYYY-MM-DD or empty", "summary": "1-2 sentences", "assumptions": ["..."], ' +
  '"phases": [{"title": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "tasks": [{"title": "...", "why": "...", "due": "YYYY-MM-DD", "search": {"folder": "sponsors", "query": "..."} or null}]}]}';

export function kickoffUserMessage(input: {
  today: Date;
  request: string;
  event: { name: string; date: string; description: string; targets: string } | null;
}): string {
  const weekday = input.today.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const lines = [`Today is ${isoDay(input.today)} (${weekday}).`];
  if (input.event) {
    lines.push("", "Event already set up:", `- name: ${input.event.name}`);
    if (input.event.date.trim()) lines.push(`- date as written: ${input.event.date.trim()}`);
    if (input.event.description.trim()) lines.push(`- about: ${input.event.description.trim().slice(0, 600)}`);
    if (input.event.targets.trim()) lines.push(`- targets: ${input.event.targets.trim().slice(0, 300)}`);
  }
  lines.push("", "What the organizer says:", input.request.trim().slice(0, 2000) || "(nothing more)");
  return lines.join("\n");
}

/**
 * Keep only a usable plan: real dates between today and the event, a bounded number of phases
 * and tasks, and searches only for the five kinds Dig can run. Returns null when nothing usable is left.
 */
export function cleanKickoffPlan(raw: unknown, today: Date, fallbackName = ""): KickoffPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const todayTime = parseDay(isoDay(today))!;
  let eventTime = parseDay(data.eventDate);
  if (eventTime !== null && eventTime < todayTime) eventTime = null;
  const horizon = eventTime ?? todayTime + 42 * DAY;
  const clampDay = (value: unknown, fallback: number) => {
    const time = parseDay(value) ?? fallback;
    return isoDay(new Date(Math.min(Math.max(time, todayTime), horizon)));
  };

  const phases: KickoffPhase[] = [];
  const rawPhases = Array.isArray(data.phases) ? data.phases : [];
  for (const [phaseIndex, rawPhase] of rawPhases.slice(0, MAX_PHASES).entries()) {
    if (!rawPhase || typeof rawPhase !== "object") continue;
    const phase = rawPhase as Record<string, unknown>;
    const title = text(phase.title, 60);
    const rawTasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    const tasks: KickoffTask[] = [];
    for (const rawTask of rawTasks.slice(0, MAX_TASKS)) {
      if (!rawTask || typeof rawTask !== "object") continue;
      const task = rawTask as Record<string, unknown>;
      const taskTitle = text(task.title, 90);
      if (!taskTitle) continue;
      const search = task.search && typeof task.search === "object" ? (task.search as Record<string, unknown>) : null;
      const folder = search && (FOLDER_KEYS as readonly string[]).includes(String(search.folder)) ? (search.folder as FolderKey) : null;
      const query = search ? text(search.query, 200) : "";
      tasks.push({
        id: `p${phaseIndex + 1}t${tasks.length + 1}`,
        title: taskTitle,
        why: text(task.why, 160),
        due: clampDay(task.due, horizon),
        search: folder && query.length >= 4 ? { folder, query } : null,
      });
    }
    if (!title || tasks.length === 0) continue;
    tasks.sort((a, b) => a.due.localeCompare(b.due));
    phases.push({
      title,
      start: clampDay(phase.start, Date.parse(`${tasks[0]!.due}T00:00:00Z`)),
      end: clampDay(phase.end, Date.parse(`${tasks[tasks.length - 1]!.due}T00:00:00Z`)),
      tasks,
    });
  }
  if (phases.length === 0) return null;

  const daysLeft = eventTime === null ? null : Math.round((eventTime - todayTime) / DAY);
  return {
    eventName: text(data.eventName, 160) || fallbackName || "New event",
    eventDate: eventTime === null ? "" : isoDay(new Date(eventTime)),
    today: isoDay(today),
    daysLeft,
    urgent: daysLeft !== null && daysLeft < 30,
    summary: text(data.summary, 400),
    assumptions: (Array.isArray(data.assumptions) ? data.assumptions : []).map((item) => text(item, 160)).filter(Boolean).slice(0, 3),
    phases,
  };
}
