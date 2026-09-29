<div align="center">

<img src="docs/dig-banner.png" alt="Dig" width="100%" />


[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Stack](https://img.shields.io/badge/stack-node%20%7C%20react%20%7C%20typescript-blue)]()
[![Grounding](https://img.shields.io/badge/every%20field-source--traced-orange)]()
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)


### We dig the internet for you, so you don't have to

Sponsors, judges, speakers — found, sourced, and organized into one space, so your whole team can focus on running the event instead of manually hunting for contacts.

**[▶ Watch the demo](https://youtu.be/wxyIEdSFLwU)** · **[Try it live](https://dig-ai.vercel.app/)**

</div>

## Table of contents

- [The problem](#the-problem)
- [What you get](#what-you-get)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Using Dig](#using-dig)
- [Getting started](#getting-started)
- [Vision](#vision)
- [The team](#the-team)


## The problem

Finding the right sponsor, mentor, judge, or lead still means hours of manual digging — tab after tab, list after list, hoping the sheet you're copying into isn't already out of date.

Everyone starts the same way, and it never gets faster: search Google for the obvious names, then go site by site — Unstop, HackerEarth, Devfolio — checking who's actually sponsoring right now. Hours later, you have a spreadsheet. Often it's just last year's list, copied forward, with no way to tell which sponsors have quietly dropped out or which contacts have since moved on. Nobody rechecks it, because rechecking means doing the whole search again.

The alternative isn't better. Ask a chatbot instead, and you get a fast, confident answer — with no source, no date, and no way to check if that email still works.

**Dig does the digging. You just ask.** Ask a question in plain language and it runs a real research pipeline: one search, matched to your intent, extracted into structured fields, and checked line by line against the page it came from. Every result is something you can click through and verify yourself — and re-running it later doesn't rebuild the list from scratch, it tells you exactly what changed.


## What you get

| | |
|---|---|
| **Every event, organized** | Sponsors, judges & mentors, jobs, leads and competitors — one dashboard per event. |
| **Sourced, not guessed** | Every contact traces back to where it came from. |
| **Never stale** | Re-run a job anytime and see exactly what changed. |
| **One folder per event** | Every search filed under the event it belongs to — not scattered across sheets and tabs. |
| **Conflicts, resolved for you** | When data changes, Dig decides what to trust automatically. It only asks you when it's genuinely unsure. |
| **Export and go** | CSV, Excel, or JSON — ready to hand to your team or plug into your own tools. |


## How it works

Dig is a single-search, source-grounded research pipeline. One natural-language question becomes one search, matched to an intent, extracted by an LLM, and checked field-by-field against its own source text before anything is shown to you. No hallucinated data, no unlabeled guesses — every result traces back to a real page, and every re-run resolves what changed instead of duplicating it.

```
                          QUERY INPUT
                 natural-language question in
                       intent matched
                      query plan built
                              │
                              ▼
                ┌─────────────┴─────────────┐
                ▼                           ▼
          [ MATCHED ]                 [ AMBIGUOUS ]
                └─────────────┬─────────────┘
                              ▼
   COLLECT ──▶ NORMALIZE ──▶ DEDUPE ──▶ VALIDATE ──▶ RANK
                              │
                              ▼
                       CONFLICT CHECK
              compare recency + authority
              auto-resolve if confident
              flag for review if not
                              │
                              ▼
                STRUCTURED, SOURCED RESULT
```

1. **Collect** — one search call, built from an intent-matched query plan
2. **Normalize** — raw extracted fields cleaned into a consistent shape
3. **Dedupe** — identity-matching merges duplicate records, flags near-matches for review
4. **Validate** — every field checked as a literal, traceable match to its source text
5. **Rank** — results ordered by strategy (activity, freshness, corroboration, source authority)

On a re-run, disagreeing sources are compared by recency and authority. Confident enough, Dig resolves it automatically. Not confident, it's flagged for you to decide.


## Tech stack

**Runtime**
`TypeScript` · `Node.js` · `Express` · `SQLite` · `Zod`

**Frontend**
`React` · `Vite` · `Tailwind CSS` · `TanStack Query` · `TanStack Table` · `React Router`

**Research pipeline**
`Tavily` (search) · `Groq` / `OpenAI` (extraction & reasoning)

**Testing**
`Vitest`


## Using Dig

**1. Sign up and log in**
Create an account to get your own workspace — every event and search you run is saved to it.

<p align="center"><img src="docs/screenshots/step-1-login.png" width="700" alt="" /></p>

**2. Create an event**
Every search lives inside an event — a hackathon, a conference, a talk. Start by creating one from your dashboard.

<p align="center"><img src="docs/screenshots/step-2-create-event.png" width="700" alt="" /></p>

**3. Ask your question**
Inside the event, click **New Query** and ask in plain language. Dig works out what you're looking for — sponsors, judges & mentors, jobs, leads or competitors — and files the results into the matching folder.

<p align="center"><img src="docs/screenshots/step-3-ask-question.png" width="700" alt="" /></p>

**4. Review sourced results**
Every result comes with a source you can click through and verify — nothing shown is a guess. As your team works the list, mark each row ✓ interested or ✗ declined and leave a short note so the next person knows where things stand.

<p align="center"><img src="docs/screenshots/step-4-review-results.png" width="700" alt="" /></p>

**5. Re-run and resolve conflicts**
Run the same search again later. Dig auto-resolves what it's confident about and only asks you when a source disagrees and it can't tell why.

<p align="center"><img src="docs/screenshots/step-5-resolve-conflicts.png" width="700" alt="" /></p>

**6. Export or generate a report**
Download the results as CSV, Excel, or JSON to hand off to your team — or generate a written report that cites every source and explains why the results were ranked the way they were.

<p align="center"><img src="docs/screenshots/step-6-export-report.png" width="700" alt="" /></p>


## Getting started

**Try it live:** [dig-ai.vercel.app](https://dig-ai.vercel.app/) — sign up, create an event, and ask your first question.

**Watch the demo:** [youtu.be/wxyIEdSFLwU](https://youtu.be/wxyIEdSFLwU)

**Or run it locally:**

Requirements: Node.js 22.13+ (24 recommended — see `.nvmrc`)

```bash
git clone https://github.com/ashima19arora/Dig.git
cd Dig
npm install

cp .env.example .env
# Required in .env:
#   TAVILY_API_KEY=...        (web search — tavily.com)
#   LLM_PROVIDER=groq
#   LLM_API_KEY=...           (console.groq.com)
#   LLM_MODEL=openai/gpt-oss-120b
# Everything else has working defaults.

npm run dev
```

Open [localhost:5173](http://localhost:5173), sign up, and start digging. Your account, events and results are stored in `data/dig.db` and survive restarts.

This starts the API and web app together — the web app on Vite's dev server, the API on Express with `tsx watch`.

### Deploying

- **API → [Railway](https://railway.app)** (a normal always-on Node server, so live searches can run in the background). Build from the repo root with start command `npm run db:migrate && npm start -w @dig/api`, attach a volume at `/data`, and set `DATABASE_PATH=/data/dig.db` plus the keys above.
- **Web → [Vercel](https://vercel.com)** from the repo root — build settings live in `vercel.json`, which also forwards `/api/*` to the Railway API, so the site and API share one domain and need no extra environment variables.


## Vision

Sponsors, mentors, judges — that's where Dig starts, but the problem it solves isn't specific to events. Anyone who has to turn a question into a trustworthy list is doing the same fifteen-tabs research by hand. Dig is built to be the one engine underneath all of it:

- **Event teams** — sponsors, judges, and mentors, sourced, not scraped from an old sheet.
- **Students** — course comparisons by price and content, pulled fresh instead of copied from a forum post.
- **Job seekers** — openings that are actually live right now, not a listing three months stale.
- **Sales teams** — lead lists that don't rot the week after you build them.
- **Researchers** — facts with a citation attached, not a chatbot's best guess.

Same pipeline, same grounding, same trust — just pointed at whatever you're digging for next.



## The team

Built by **Mayank** and **Ashima**, four days, one monorepo, and more coffee breaks than either of us will admit to. The full build, failure by failure, is in the [Dev Log](https://dig-ai.vercel.app/dev-log).

<div align="center">

made with ❤️ at Code Cubicle 6.0

</div>