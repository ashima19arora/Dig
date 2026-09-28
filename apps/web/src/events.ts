import { useQuery } from "@tanstack/react-query";
import type { FolderKey } from "@dig/schemas";
import { api } from "./api";
import { queryClient } from "./query";
import { notifyError } from "./toast";

/*
  Events belong to the signed-in user and live in the API's database. Each event has one folder per
  research intent; a folder points at the search whose results it shows.
*/

export type { FolderKey };

export const FOLDERS: Array<{ key: FolderKey; label: string; noun: string; example: string }> = [
  { key: "sponsors", label: "Sponsors", noun: "sponsor", example: "Find sponsors for hackathons in India" },
  { key: "judges", label: "Judges & Mentors", noun: "judge or mentor", example: "AI researchers who could judge our hackathon in Delhi" },
  { key: "jobs", label: "Jobs", noun: "job", example: "Frontend internships in Bangalore" },
  { key: "leads", label: "Leads", noun: "lead", example: "D2C skincare brands in Mumbai we could pitch our analytics tool to" },
  { key: "competitors", label: "Competitors", noun: "competitor", example: "What are the alternatives to Notion?" },
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
  folderNames: Partial<Record<FolderKey, string>>;
  /** folder → the search whose results that folder shows */
  jobs: Partial<Record<FolderKey, string>>;
}

export type EventFields = Pick<DigEvent, "name" | "description" | "date" | "targets">;

export const ROOT_CRUMB = "Events";

export function useEvents() {
  const query = useQuery({
    queryKey: ["events"],
    queryFn: async () => (await api<{ events: DigEvent[] }>("/api/events")).events,
  });
  return { events: query.data ?? [], loading: query.isLoading, error: query.error };
}

function store(event: DigEvent) {
  queryClient.setQueryData<DigEvent[]>(["events"], (list) =>
    list ? (list.some((item) => item.id === event.id) ? list.map((item) => (item.id === event.id ? event : item)) : [event, ...list]) : [event],
  );
}

export function eventStored(event: DigEvent) {
  store(event);
}

type EventPatch = Partial<EventFields> & {
  favourite?: boolean;
  archived?: boolean;
  touched?: boolean;
  folderNames?: Partial<Record<FolderKey, string>>;
  jobs?: Partial<Record<FolderKey, string | null>>;
};

/** Saves a change to an event. Failures are shown as a notice; resolves to the saved event, or undefined. */
export async function updateEvent(id: string, patch: EventPatch): Promise<DigEvent | undefined> {
  try {
    const { event } = await api<{ event: DigEvent }>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    store(event);
    return event;
  } catch (error) {
    notifyError(error);
    return undefined;
  }
}

export async function createEvent(input: EventFields): Promise<DigEvent> {
  const { event } = await api<{ event: DigEvent }>("/api/events", { method: "POST", body: JSON.stringify(input) });
  store(event);
  return event;
}

export const linkJob = (id: string, folder: FolderKey, jobId: string) => updateEvent(id, { jobs: { [folder]: jobId } });
export const unlinkJob = (id: string, folder: FolderKey) => updateEvent(id, { jobs: { [folder]: null } });
export const renameFolder = (id: string, folder: FolderKey, name: string) => updateEvent(id, { folderNames: { [folder]: name } });
export const touchEvent = (id: string) => updateEvent(id, { touched: true });

export function folderLabel(event: DigEvent, key: FolderKey): string {
  return event.folderNames?.[key] || (FOLDERS.find((folder) => folder.key === key)?.label ?? key);
}
