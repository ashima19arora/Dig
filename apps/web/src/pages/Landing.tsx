import { Heart, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const HEADLINE: Array<{ text: string; hl?: boolean; br?: boolean }> = [
  { text: "We " },
  { text: "dig the internet", hl: true },
  { text: " for" },
  { text: "", br: true },
  { text: "you, so you don’t have to." },
];
const HEADLINE_LENGTH = HEADLINE.reduce((sum, part) => sum + part.text.length, 0);

function Typewriter() {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    let count = 0;
    let timer = window.setTimeout(function tick() {
      count += 1;
      setTyped(count);
      if (count < HEADLINE_LENGTH) timer = window.setTimeout(tick, 42 + Math.random() * 50);
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  let remaining = typed;
  return (
    <h1 className="hero-title" aria-label="We dig the internet for you, so you don’t have to.">
      {HEADLINE.map((part, index) => {
        if (part.br) return <br key={index} />;
        const shown = part.text.slice(0, Math.max(0, remaining));
        remaining -= part.text.length;
        return shown ? (
          <span key={index} className={part.hl ? "hl" : undefined}>
            {shown}
          </span>
        ) : null;
      })}
      <span className="caret" />
    </h1>
  );
}

/*
  Offsets are in source-art pixels (the 4320×3000 illustration), snapped to the
  art's pixel grid so the pupils move like pixel art rather than sliding.
*/
const LOOK_RANGE = { x: 60, up: 18, down: 12 };
const IDLE_GLANCES: Array<[number, number]> = [
  [-LOOK_RANGE.x, 0],
  [LOOK_RANGE.x, 0],
  [0, -LOOK_RANGE.up],
  [0, LOOK_RANGE.down],
  [0, 0],
];

function snap(value: number, step: number) {
  return Math.round(value / step) * step;
}

function MoleEyes() {
  const [look, setLook] = useState<[number, number]>([0, 0]);
  const [blinking, setBlinking] = useState(false);
  const lensRef = useRef<HTMLDivElement>(null);

  // Follow the cursor anywhere on the page; after ~3s of stillness, glance around on its own.
  useEffect(() => {
    let idleTimer = 0;
    let glanceTimer = 0;
    const glance = (step: number) => {
      setLook(IDLE_GLANCES[step % IDLE_GLANCES.length] as [number, number]);
      const pause = step % IDLE_GLANCES.length === IDLE_GLANCES.length - 1 ? 2600 : 750;
      glanceTimer = window.setTimeout(() => glance(step + 1), pause);
    };
    const armIdle = () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(glanceTimer);
      idleTimer = window.setTimeout(() => glance(0), 3000);
    };
    const onMove = (event: MouseEvent) => {
      const lens = lensRef.current?.getBoundingClientRect();
      if (lens) {
        const nx = Math.max(-1, Math.min(1, (event.clientX - (lens.left + lens.width / 2)) / (window.innerWidth * 0.4)));
        const ny = Math.max(-1, Math.min(1, (event.clientY - (lens.top + lens.height / 2)) / (window.innerHeight * 0.4)));
        setLook([snap(nx * LOOK_RANGE.x, 20), snap(ny < 0 ? ny * LOOK_RANGE.up : ny * LOOK_RANGE.down, 6)]);
      }
      armIdle();
    };
    window.addEventListener("mousemove", onMove);
    armIdle();
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(idleTimer);
      window.clearTimeout(glanceTimer);
    };
  }, []);

  // Blink roughly every 4 seconds.
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlinking(true);
        timer = window.setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 140);
      }, 3500 + Math.random() * 1000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const [dx, dy] = look;
  // The far (right) lens is foreshortened in the 3/4 view, so that pupil travels less.
  const rdx = Math.max(-24, Math.min(4, snap(dx * 0.4, 4)));
  return (
    <div className={blinking ? "blinking" : undefined}>
      <div className="lens left" ref={lensRef}>
        <div className="pupil" style={{ transform: `translate(${(dx / 72) * 100}%, ${(dy / 87) * 100}%)` }}>
          <i />
        </div>
      </div>
      <div className="lens right">
        <div className="pupil" style={{ transform: `translate(${(rdx / 42) * 100}%, ${(dy / 65) * 100}%)` }}>
          <i />
        </div>
      </div>
    </div>
  );
}

// Tile centres across the flowchart strip: Collect, Clean, Rank, Output.
const TILE_START = 0.133;
const TILE_END = 0.88;

function Flowchart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pos = 0; // 0 → Collect … 1 → Output; beyond [0,1] the glow fades while it wraps
    let target = 0;
    let lastScroll = -Infinity;
    let last = performance.now();
    let frame = 0;

    const progress = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const vh = window.innerHeight;
      return Math.max(0, Math.min(1, (vh * 0.95 - rect.top) / (vh * 0.65)));
    };
    const onScroll = () => {
      target = progress();
      lastScroll = performance.now();
    };
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (now - lastScroll < 220) {
        pos += (target - pos) * 0.18; // scroll drives the glow
      } else {
        pos += dt * 0.00019; // then it keeps travelling on its own
        if (pos > 1.15) pos = -0.15;
      }
      const glow = glowRef.current;
      if (glow) {
        const clamped = Math.max(0, Math.min(1, pos));
        const fade = pos < 0 ? 1 + pos / 0.15 : pos > 1 ? 1 - (pos - 1) / 0.15 : 1;
        glow.style.left = `${(TILE_START + (TILE_END - TILE_START) * clamped) * 100}%`;
        glow.style.opacity = String(Math.max(0, fade));
      }
      frame = requestAnimationFrame(loop);
    };
    target = progress();
    pos = target;
    window.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="flow" ref={wrapRef}>
      <img src="/art/flow.png" alt="Collect, then Clean, then Rank, then Output" />
      <div className="flow-glow" ref={glowRef} />
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/">
          <img src="/art/logo.png" alt="Dig" />
        </Link>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/login" className="px-btn">
            Log in
          </Link>
          <Link to="/signup" className="px-btn">
            Sign up
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="lantern-glow" />
        <MoleEyes />
        <div className="hero-copy">
          <Typewriter />
          <p className="hero-sub">
            Sponsors, judges, speakers — found, sourced, and organized into one space, so your whole team can focus on
            running the event instead of manually hunting for contacts.
          </p>
        </div>
        <div className="hero-ctas">
          <button className="px-btn lg" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
            <Play size={12} fill="currentColor" style={{ display: "inline" }} /> Watch 60-second demo
          </button>
          <button className="px-btn lg" onClick={() => navigate("/signup")}>
            Sign up free
          </button>
          <button className="px-btn lg" onClick={() => navigate("/login")}>
            Log in
          </button>
        </div>
      </section>

      <section className="section" id="how" style={{ paddingTop: 56 }}>
        <div className="kicker pixel">How a Dig works</div>
        <h2>One request in. A sourced sheet out.</h2>
        <p className="lede">
          Every job rides the same line — collected, cleaned, ranked and delivered — so you always know where your results
          came from.
        </p>
        <Flowchart />

        <div className="features">
          <div className="feature">
            <img src="/art/icon-folder.png" alt="" />
            <h3>Every event, organized.</h3>
            <p>Sponsors, judges, speakers in one dashboard per event.</p>
          </div>
          <div className="feature">
            <img src="/art/icon-lens.png" alt="" />
            <h3>Sourced, not guessed.</h3>
            <p>Every contact traced back to where it came from.</p>
          </div>
          <div className="feature">
            <img src="/art/icon-refresh.png" alt="" />
            <h3>Never stale.</h3>
            <p>Re-run a job anytime and see exactly what changed.</p>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        made with <Heart size={12} fill="currentColor" style={{ display: "inline", verticalAlign: -1 }} /> during Code Cubicle 6.0 by{" "}
        <b>[Name 1]</b> &amp; <b>[Name 2]</b>
      </footer>
    </div>
  );
}
