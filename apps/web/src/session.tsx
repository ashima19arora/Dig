import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, api } from "./api";
import { queryClient } from "./query";

export interface Session {
  user: { id: string; name: string; email: string; role: string };
  workspace: { id: string; name: string };
}

/** The signed-in user, `null` when logged out, `undefined` while the check is in flight. */
export function useSession() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Session>("/api/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  return { session: query.data, loading: query.isLoading, error: query.error };
}

export async function logOut() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    queryClient.clear();
    queryClient.setQueryData(["me"], null);
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

/** Renders app screens only for a signed-in user; otherwise sends them to log in and back here afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, error } = useSession();
  const location = useLocation();
  if (loading) return <div className="boot">Loading…</div>;
  if (error) {
    return (
      <div className="boot">
        <div>
          <b>Dig can’t reach its server.</b>
          <p>{error instanceof Error ? error.message : String(error)}</p>
          <button className="btn" onClick={() => void queryClient.invalidateQueries({ queryKey: ["me"] })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}
