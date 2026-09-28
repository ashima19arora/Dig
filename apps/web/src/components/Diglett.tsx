import { Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { GUIDE_URL } from "./Marketing";

/*
  Ask Diglett: a small help chat. Answers come from a fixed set of question/answer pairs matched by keywords —
  instant, offline, and no API cost. Anything it doesn't recognise points to the README walkthrough.
*/

interface Answer {
  keys: string[];
  text: string;
}

const ANSWERS: Answer[] = [
  {
    keys: ["what is dig", "what does this do", "what does dig do", "what is this", "about dig", "explain dig", "how does dig work", "how does this work"],
    text:
      "Dig finds real, sourced records on the live web — sponsors, judges & mentors, jobs, leads and competitors. Every value is quoted from a page you can click through, and re-running a search shows exactly what changed.",
  },
  {
    keys: ["search", "new query", "query", "start", "find", "how do i find", "how to find", "how do i get", "ask", "look for", "how do i use", "get started", "begin"],
    text:
      "Open an event and click New Query (top right). Ask in plain words — e.g. “AI researchers who could judge our hackathon in Delhi”. Dig works out what kind of search it is and files the results into the matching folder.",
  },
  {
    keys: ["needs review", "conflict", "review", "keep new", "keep previous", "disagree", "resolve"],
    text:
      "When a re-run finds a different value for an important field and the sources don't clearly agree, Dig marks it “Needs review” instead of guessing. Click Review conflicts, compare Previous and New, then choose Keep new or Keep previous. Clear-cut changes are resolved automatically.",
  },
  {
    keys: ["grounded", "sourced", "source", "verified", "verify", "hallucinat", "trust", "accurate", "real data", "made up", "fake", "evidence"],
    text:
      "Every field is kept only if it appears word for word on the page it cites. Click any row to see the exact quote and a link to the page. If Dig can't quote it, it doesn't show it — fewer results beats made-up ones.",
  },
  {
    keys: ["export", "download", "csv", "excel", "xlsx", "json", "report", "share", "spreadsheet"],
    text:
      "On a results board, use the Download menu: CSV, Excel or JSON — or Generate report for a written summary that cites every source and explains how the list was ranked. Export (top right) is a one-click CSV.",
  },
  {
    keys: ["outreach", "contacted", "contact status", "tick", "cross", "interested", "declined", "note", "who called", "mark"],
    text:
      "Next to each name there's an Outreach mark — click it to cycle not contacted → interested → declined, and use the Note column for a quick update (“will get back to us next week”). It's saved and stays put when you re-run the search.",
  },
  {
    keys: ["rename", "change name", "edit name", "title"],
    text: "Use the ⋯ menu on any event or folder and choose Rename. To rename a search, click its title at the top of the results board.",
  },
  {
    keys: ["run again", "re-run", "rerun", "refresh", "update", "stale", "latest", "changed", "diff"],
    text:
      "Click Run again on a results board. Dig searches again, compares with the last version and shows what was added, changed and dropped (Full diff ›). Your outreach marks carry over.",
  },
  {
    keys: ["what can", "supported", "types", "kinds of search", "which searches", "intents", "judges", "jobs", "leads", "competitors", "sponsors"],
    text:
      "Dig researches five things right now: sponsors, judges & mentors, jobs, leads and competitors. Other kinds of questions (company profiles, events, funding) get a clear “not supported yet” message.",
  },
  {
    keys: ["slow", "how long", "taking", "stuck", "waiting", "loading"],
    text:
      "Live searches usually take 10–90 seconds — sponsor searches are the longest because Dig also looks up contact details. The progress bar shows what it's doing; if something goes wrong you'll see a clear message and can click Run again.",
  },
  {
    keys: ["event", "folder", "organi"],
    text:
      "Each event has five folders — Sponsors, Judges & Mentors, Jobs, Leads and Competitors. A new query is filed into the folder that matches it, so everything for one event stays together.",
  },
  {
    keys: ["account", "log out", "logout", "profile", "password", "sign out"],
    text: "Your profile (avatar, top right) shows your details and recent searches. Log out is on the Profile page and in the sidebar. Everything you create is saved to your account.",
  },
  {
    keys: ["hi", "hello", "hey", "yo", "hii"],
    text: "Hi! Ask me how to search, what “needs review” means, how sourcing works, or how to export.",
  },
  {
    keys: ["thanks", "thank you", "thx", "cool", "great"],
    text: "Happy digging! Ask anything else any time.",
  },
];

const SUGGESTED = ["What is Dig?", "How do I search?", "What does “needs review” mean?", "How do I export?"];

/** Picks the answer whose keywords best match the question (longer phrase matches count for more). */
export function answerFor(question: string): string | null {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").replace(/\s+/g, " ")} `;
  let best: { score: number; answer: Answer } | null = null;
  for (const answer of ANSWERS) {
    let score = 0;
    for (const key of answer.keys) {
      // Short words must match whole ("hi" shouldn't match "this"); phrases can match anywhere.
      const hit = key.length <= 3 ? text.includes(` ${key} `) : text.includes(key);
      if (hit) score += key.split(" ").length * 2 + key.length / 20;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, answer };
  }
  return best?.answer.text ?? null;
}

interface Message {
  from: "you" | "diglett";
  text: string;
  fallback?: boolean;
}

const GREETING: Message = { from: "diglett", text: "Hi, I’m Diglett! Ask me anything about using Dig — or tap a question below." };

export function AskDiglett() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    const answer = answerFor(text);
    setMessages((current) => [
      ...current,
      { from: "you", text },
      answer
        ? { from: "diglett", text: answer }
        : { from: "diglett", text: "I don’t have an answer for that yet, but the Guide has a full walkthrough.", fallback: true },
    ]);
    setDraft("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <>
      {open && (
        <div className="diglett-panel chat" role="dialog" aria-label="Ask Diglett" onClick={(click) => click.stopPropagation()}>
          <div className="chat-head">
            <img src="/art/mole-avatar.png" alt="" />
            <b>Ask Diglett</b>
            <button aria-label="Close" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="chat-list" ref={listRef} aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={`bubble ${message.from === "you" ? "you" : "bot"}`}>
                {message.text}
                {message.fallback && (
                  <>
                    {" "}
                    <a href={GUIDE_URL} target="_blank" rel="noreferrer">
                      Open the Guide ↗
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="chat-suggest">
            {SUGGESTED.map((question) => (
              <button key={question} type="button" onClick={() => ask(question)}>
                {question}
              </button>
            ))}
          </div>
          <form className="chat-input" onSubmit={submit}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question…" autoFocus maxLength={200} />
            <button type="submit" disabled={!draft.trim()} aria-label="Send">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
      <button
        className="diglett"
        aria-label="Ask Diglett"
        aria-expanded={open}
        onClick={(click) => {
          click.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <img src="/art/mole-avatar.png" alt="" />
        <span className="dot" />
        {!open && <span className="diglett-tip">Ask Diglett</span>}
      </button>
    </>
  );
}
