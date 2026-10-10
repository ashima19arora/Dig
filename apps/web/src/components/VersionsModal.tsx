import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Set to true to show the pop-up once per browser visit instead of on every load. */
export const SHOW_ONCE_PER_VISIT = false;
const SEEN_THIS_VISIT_KEY = "dig-versions-seen";

export function shouldShowVersions(): boolean {
  if (!SHOW_ONCE_PER_VISIT) return true;
  try {
    return sessionStorage.getItem(SEEN_THIS_VISIT_KEY) !== "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_THIS_VISIT_KEY, "1");
  } catch {
    // Storage can be blocked; the pop-up then just shows again.
  }
}

/** Each row: what version 1 did, and what replaced it in version 2. */
const CHANGES: Array<[string, string]> = [
  ["Sourced lists for sponsors, judges, jobs, leads and competitors.", "Contacts added: LinkedIn, GitHub and work emails, matched by name and organisation."],
  ["Judges and speakers came back mostly as names.", "Expertise and “what they do” filled in from each person’s own page."],
  ["One contact per company.", "“Another” finds the next person when the first doesn’t reply."],
  ["Rows ranked by how recent their sources were.", "The most complete rows come first."],
  ["Interested or declined marks.", "Four outreach states, and pitch emails written from sourced facts."],
  ["Re-runs flagged every disagreement for you.", "Clear changes settle themselves; only real disagreements reach you."],
  ["CSV, Excel and JSON downloads.", "Plus a clean black-and-white PDF report."],
  ["Search only.", "Toolkit: plan with Kickoff, read a list with Lens, combine with Merger."],
];

/** What changed between the online round and now. Closes with X, Esc, a click outside, or the button. */
export function VersionsModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => {
    markSeen();
    onClose();
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="versions-backdrop" onClick={close}>
      <div ref={dialog} className="versions-card" role="dialog" aria-modal="true" aria-labelledby="versions-title" onClick={(click) => click.stopPropagation()}>
        <button type="button" className="versions-x" onClick={close} aria-label="Close">
          <X size={18} />
        </button>
        <h2 id="versions-title">v1 → v2: You spoke, we dug</h2>
        <p className="versions-sub">What we changed after the online round.</p>
        <p className="versions-ack">Thank you for your feedback in the online round. We took it to heart and kept building.</p>

        <div className="versions-grid">
          <div className="versions-head">
            <b>Version 1</b>
            <span>(before the online round)</span>
          </div>
          <div className="versions-line" aria-hidden />
          <div className="versions-head v2">
            <b>Version 2</b>
            <span>(after the online round)</span>
          </div>
          {CHANGES.map(([before, after]) => (
            <div key={before} className="versions-row">
              <p className="versions-v1">{before}</p>
              <div className="versions-line" aria-hidden />
              <p className="versions-v2">{after}</p>
            </div>
          ))}
        </div>

        <p className="versions-todo">
          <b>Still on our list:</b> dedicated searches for events, funding, market trends, products, vendors and company
          profiles.
        </p>

        <button type="button" className="px-btn versions-go" data-autofocus onClick={close}>
          Continue to Dev Log
        </button>
      </div>
    </div>
  );
}
