import type { ReactNode } from "react";
import { MarketingFooter, MarketingNav, PixelHeading, Reveal } from "../components/Marketing";

const TECH: Array<Array<[string, string]>> = [
  [["typescript", "TypeScript"], ["nodejs", "Node.js"], ["express", "Express"], ["sqlite", "SQLite"]],
  [["zod", "Zod"], ["react", "React"], ["vite", "Vite"], ["tailwind", "Tailwind CSS"]],
  [["tanstack-query", "TanStack Query"], ["tanstack-table", "TanStack Table"], ["react-router", "React Router"], ["vitest", "Vitest"]],
  [["tavily", "Tavily"], ["groq", "Groq"], ["hunter", "Hunter.io"], ["openrouter", "Jev · OpenRouter"], ["github", "GitHub API"]],
];

/** Services without a logo file get a small lettered badge the same size as the logos. */
const HAS_LOGO = new Set(["typescript", "nodejs", "express", "sqlite", "zod", "react", "vite", "tailwind", "tanstack-query", "tanstack-table", "react-router", "vitest", "tavily", "groq"]);

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
          intro="Dig is a source-grounded research pipeline. A plain-language question becomes a set of web searches (Tavily), extracted by an LLM (Groq) and checked field by field against its source page. Contact details come from LinkedIn and GitHub pages and from Hunter.io's web-sourced emails, and Jev helps decide which value to trust when pages disagree. Every result traces back to a real page, and every re-run shows what changed instead of duplicating it."
        >
          <div className="bricks">
            {TECH.map((row, index) => (
              <div key={index} className="brick-row">
                {row.map(([key, label]) => (
                  <div key={key} className="brick">
                    {HAS_LOGO.has(key) ? <img src={icon(`tech-${key}`)} alt="" /> : <span className="brick-badge" aria-hidden>{label.charAt(0)}</span>}
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
          intro="Every search follows the same ten steps. A value is kept only if it is on its source page, contacts count only when the name and the organisation match, and the most complete rows come first. On a re-run, clear changes are settled automatically and real disagreements are handed to you."
        >
          <div className="pipe pipe-v2">
            <div className="pipe-bar">
              <i />
              <i />
              <i />
              <span>dig_pipeline.sh</span>
            </div>
            <div className="pipe-body">
              <img
                className="pipe-diagram"
                src="/art/pipeline-v2.png"
                alt="Dig pipeline: your question, then understand, search, extract, ground, enrich, describe, trust, normalize and dedupe and validate, rank, and compare on re-run, giving a sourced, versioned list. From the list you can track outreach, write a pitch, use Toolkit, or export."
              />
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
