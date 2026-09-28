import { useSyncExternalStore } from "react";

/*
  Events are a FRONTEND-ONLY grouping. The API has jobs but no "event" entity
  above them, so events — and which job fills which folder — live in
  localStorage for now. Replace this module with real endpoints once the
  backend grows an events table.
*/

export type FolderKey = "sponsors" | "judges" | "speakers";

export const FOLDERS: Array<{ key: FolderKey; label: string; live: boolean }> = [
  { key: "sponsors", label: "Sponsors", live: true },
  { key: "judges", label: "Judges & Mentors", live: false },
  { key: "speakers", label: "Speakers", live: false },
];

export interface DigEvent {
  id: string;
  name: string;
  description: string;
  date: string;
  targets: string;
  favourite: boolean;
  archived: boolean;
  openedAt: string;
  /** folder → the job whose dataset that folder shows */
  jobs: Partial<Record<FolderKey, string>>;
  /** folder → the name the user gave it, when renamed */
  folderNames?: Partial<Record<FolderKey, string>>;
}

export const ORG_NAME = "Geek Room";
const KEY = "dig-events-v1";

const SEED: DigEvent[] = [
  {
    id: "code-cubicle-6",
    name: "Code Cubicle 6.0",
    description: "6th season of Geek Room’s flagship hackathon.",
    date: "Nov 14–15",
    targets: "15+ sponsors, 8 judges, 20 student teams",
    favourite: true,
    archived: false,
    openedAt: "2026-09-27T10:00:00.000Z",
    jobs: {},
  },
  {
    id: "university-tech-talk",
    name: "University Tech Talk",
    description: "An evening talk series for first- and second-year students.",
    date: "Dec 3",
    targets: "3 speakers, 2 sponsors",
    favourite: false,
    archived: false,
    openedAt: "2026-09-26T10:00:00.000Z",
    jobs: {},
  },
];

let cache: DigEvent[] | null = null;
const listeners = new Set<() => void>();

function load(): DigEvent[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DigEvent[]) : SEED;
  } catch {
    cache = SEED;
  }
  return cache;
}

function save(next: DigEvent[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: keep the in-memory copy for this session
  }
  for (const listener of listeners) listener();
}

export function useEvents(): DigEvent[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
  );
}

export function updateEvent(id: string, patch: Partial<DigEvent>) {
  save(load().map((event) => (event.id === id ? { ...event, ...patch } : event)));
}

export function linkJob(id: string, folder: FolderKey, jobId: string) {
  const event = load().find((item) => item.id === id);
  if (event) updateEvent(id, { jobs: { ...event.jobs, [folder]: jobId } });
}

export function createEvent(input: Pick<DigEvent, "name" | "description" | "date" | "targets">): DigEvent {
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  let id = base;
  for (let n = 2; load().some((event) => event.id === id); n += 1) id = `${base}-${n}`;
  const event: DigEvent = { ...input, id, favourite: false, archived: false, openedAt: new Date().toISOString(), jobs: {} };
  save([event, ...load()]);
  return event;
}

export function folderLabel(event: DigEvent, key: FolderKey): string {
  return event.folderNames?.[key] || (FOLDERS.find((folder) => folder.key === key)?.label ?? key);
}

export function renameFolder(id: string, key: FolderKey, name: string) {
  const event = load().find((item) => item.id === id);
  if (event) updateEvent(id, { folderNames: { ...event.folderNames, [key]: name } });
}

export function touchEvent(id: string) {
  updateEvent(id, { openedAt: new Date().toISOString() });
}
