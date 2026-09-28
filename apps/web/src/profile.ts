import { useSyncExternalStore } from "react";

/*
  The signed-in person, FRONTEND-ONLY for now. Auth is cosmetic, so the sign-up / log-in forms and the
  Profile page write here (localStorage). Swap for the real session once the backend has accounts.
*/

export interface Profile {
  name: string;
  email: string;
  role: string;
}

const KEY = "dig-profile-v1";
const EMPTY: Profile = { name: "", email: "", role: "" };

let cache: Profile | null = null;
const listeners = new Set<() => void>();

function load(): Profile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Profile>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function saveProfile(patch: Partial<Profile>) {
  cache = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage blocked: keep the in-memory copy for this session
  }
  for (const listener of listeners) listener();
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}
