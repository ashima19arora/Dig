import { useEffect } from "react";

/** Every pop-up's backdrop. Clicking the backdrop already closes the pop-up, so Esc does the same. */
const BACKDROPS = ".scrim, .flow-modal-backdrop, .pitch-modal-overlay, .macos-modal-backdrop, .toolkit-intro-backdrop";

/**
 * Esc closes the topmost open pop-up, the same way clicking outside it does.
 * One handler for the whole app, so every pop-up behaves the same.
 */
export function EscapeCloses() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const open = document.querySelectorAll<HTMLElement>(BACKDROPS);
      const top = open[open.length - 1];
      if (!top) return;
      event.preventDefault();
      top.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
