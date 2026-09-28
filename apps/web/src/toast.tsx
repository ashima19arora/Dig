import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

/* Small app-wide notices, so a failed save or network error is always visible instead of silent. */

interface Toast {
  id: number;
  message: string;
  tone: "error" | "info";
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: Toast[]) {
  toasts = next;
  for (const listener of listeners) listener();
}

export function notify(message: string, tone: Toast["tone"] = "error") {
  const id = nextId++;
  emit([...toasts.filter((toast) => toast.message !== message), { id, message, tone }]);
  window.setTimeout(() => emit(toasts.filter((toast) => toast.id !== id)), 6000);
}

export function notifyError(error: unknown) {
  notify(error instanceof Error ? error.message : "Something went wrong. Please try again.");
}

export function Toasts() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
  if (list.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <span>{toast.message}</span>
          <button aria-label="Dismiss" onClick={() => emit(toasts.filter((item) => item.id !== toast.id))}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
