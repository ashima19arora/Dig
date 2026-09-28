import type { ReactNode } from "react";
import { MarketingFooter, MarketingNav, PixelHeading, Reveal } from "../components/Marketing";

const TECH: Array<Array<[string, string]>> = [
  [["typescript", "TypeScript"], ["nodejs", "Node.js"], ["express", "Express"], ["sqlite", "SQLite"]],
  [["zod", "Zod"], ["react", "React"], ["vite", "Vite"], ["tailwind", "Tailwind CSS"]],
  [["tanstack-query", "TanStack Query"], ["tanstack-table", "TanStack Table"], ["react-router", "React Router"], ["vitest", "Vitest"]],
  [["tavily", "Tavily"], ["groq", "Groq"]],
];

const STAGES: Array<[string, string, string]> = [
  ["collect", "COLLECT", "blue"],
  ["normalize", "NORMALIZE", "violet"],
  ["dedupe", "DEDUPE", "orange"],
  ["validate", "VALIDATE", "green"],
  ["rank", "RANK", "indigo"],
];

const TOOLS: Array<[string, string, string]> = [
  ["claude", "Claude", "AI architecture & pair-programming"],
  ["cursor", "Cursor", "AI-assisted development"],
  ["antigravity", "Antigravity", "web development"],
];

function Section({ title, tag, intro, children }: { title: string; tag: string; intro: string; children: ReactNode }) {
  return (
    <Reveal className="why-card stack-card">
      <div className="stack-head">
        <PixelHeading>{title}</PixelHeading>
        <span className="stack-tag">{tag}</span>
      </div>
      <p className="stack-intro">{intro}</p>
      {children}
    </Reveal>
  );
}

const icon = (name: string) => `/art/stack/${name}.png`;

export function Stack() {
  return (
    <div className="landing mk-page">
      <MarketingNav />
      <header className="why-hero log-hero">
        <PixelHeading as="div" className="why-kicker" caret>
          THE_STACK
        </PixelHeading>
        <h1 className="log-title">What’s underneath the digging</h1>
      </header>

      <main className="why-body stack">
        <Section
          title="tech_stack"
          tag="01 · runtime"
          intro="Dig is a single-search, source-grounded research pipeline. One natural-language question becomes one Tavily search, matched to an intent, extracted by an LLM, and checked field-by-field against its own source text before anything is shown to you. No hallucinated data, no unlabeled guesses — every result traces back to a real page, and every re-run resolves what changed instead of duplicating it."
        >
          <div className="bricks">
            {TECH.map((row, index) => (
              <div key={index} className="brick-row">
                {row.map(([key, label]) => (
                  <div key={key} className="brick">
                    <img src={icon(`tech-${key}`)} alt="" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="execution_pipeline"
          tag="02 · pipeline"
          intro="Every search Dig runs follows the same path. One question is matched to an intent, turned into a single search call, and walked through five pipeline stages before it’s shown to you. Conflicts on a re-run get resolved automatically when the answer’s clear — and handed to you when it isn’t."
        >
          <div className="pipe" role="img" aria-label="Dig pipeline: query input, branch to matched or ambiguous, collect, normalize, dedupe, validate, rank, conflict check, structured sourced result.">
            <div className="pipe-bar">
              <i />
              <i />
              <i />
              <span>dig_pipeline.sh</span>
            </div>
            <div className="pipe-body">
              <div className="pipe-title">DIG PIPELINE ARCHITECTURE</div>
              <div className="pipe-node green pipe-query">
                <img src={icon("pipe-query")} alt="" />
                <div>
                  <b>query input</b>
                  <ul>
                    <li>natural-language question in</li>
                    <li>intent keyword match</li>
                    <li>query plan built</li>
                  </ul>
                </div>
              </div>
              <div className="pipe-arrow" />
              <div className="pipe-group pipe-branch">
                <div className="pipe-label">
                  <img src={icon("pipe-gear")} alt="" /> branch
                </div>
                <div className="pipe-fork">
                  <span className="pipe-tag blue">[ MATCHED ]</span>
                  <span className="pipe-tag pink">[ AMBIGUOUS ]</span>
                </div>
              </div>
              <div className="pipe-arrow" />
              <div className="pipe-group pipe-stages">
                {STAGES.map(([key, label, color], index) => (
                  <div key={key} className="pipe-step">
                    {index > 0 && <span className="pipe-next" aria-hidden />}
                    <div className={`pipe-stage ${color}`}>
                      <img src={icon(`pipe-${key}`)} alt="" />
                      {label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pipe-arrow" />
              <div className="pipe-node violet pipe-conflict">
                <img src={icon("pipe-conflict")} alt="" />
                <div>
                  <b>conflict check</b>
                  <ul>
                    <li>compare recency + authority</li>
                    <li>auto-resolve if confident</li>
                    <li>flag for human review if not</li>
                  </ul>
                </div>
              </div>
              <div className="pipe-arrow" />
              <div className="pipe-node green pipe-result">
                <img src={icon("pipe-result")} alt="" />
                <b>structured, sourced result</b>
              </div>
            </div>
          </div>
        </Section>

        <Section title="other_dev_tools" tag="03 · tooling" intro="The stack above is what Dig runs on. The tools below are what we built it with.">
          <div className="tools">
            {TOOLS.map(([key, name, note]) => (
              <div key={key} className="tool">
                <img src={icon(`tool-${key}`)} alt="" />
                <div>
                  <b>{name}</b>
                  <span>{note}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
