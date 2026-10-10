import { Info } from "lucide-react";
import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 350;
const TAP_HIDE_MS = 4000;

interface Position {
  top: number;
  left: number;
  above: boolean;
}

/** Below the target if there is room, otherwise above; kept inside the window horizontally. */
function place(target: DOMRect, tip: { width: number; height: number }): Position {
  const gap = 8;
  const margin = 8;
  const above = target.bottom + gap + tip.height > window.innerHeight - margin && target.top - gap - tip.height > margin;
  const left = Math.min(Math.max(target.left + target.width / 2 - tip.width / 2, margin), window.innerWidth - tip.width - margin);
  return { top: above ? target.top - gap - tip.height : target.bottom + gap, left, above };
}

/**
 * Plain-words help for a control. Shows after a short delay on hover, at once on keyboard focus,
 * and on tap for touch screens. Drawn above everything so table edges never clip it.
 */
export function Tip({ text, children, block }: { text: ReactNode; children: ReactNode; block?: boolean }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPosition(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Measure once the bubble exists, then place it.
  useEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const target = (anchor.current.firstElementChild ?? anchor.current).getBoundingClientRect();
    setPosition(place(target, { width: bubble.current.offsetWidth, height: bubble.current.offsetHeight }));
    const close = () => hide();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": open ? id : undefined })
    : children;

  return (
    <span
      ref={anchor}
      className={block ? "tip-anchor block" : "tip-anchor"}
      onMouseEnter={() => show(SHOW_DELAY_MS)}
      onMouseLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
      onKeyDown={(key) => {
        if (key.key === "Escape") hide();
      }}
      onPointerDown={(pointer) => {
        // Touch has no hover: a tap shows the help for a few seconds.
        if (pointer.pointerType !== "touch") return;
        show(0);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(hide, TAP_HIDE_MS);
      }}
    >
      {child}
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className={`tip-bubble${position?.above ? " above" : ""}`}
            style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A small (i) for places where the help matters on touch screens too. */
export function InfoTip({ text, label = "More information" }: { text: ReactNode; label?: string }) {
  return (
    <Tip text={text}>
      <button type="button" className="info-tip" aria-label={label} onClick={(click) => click.stopPropagation()}>
        <Info size={12} />
      </button>
    </Tip>
  );
}
