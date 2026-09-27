# Dig

Dig turns a business research question into a persistent, re-runnable, source-backed dataset.

A request becomes a **collection job**. Each run stores a dataset version. The next run diffs
that version, and contradictory fields become conflicts instead of silent overwrites.

## Run it

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:5173. The API listens on http://localhost:8787.

No API keys are required by default. `DEMO_MODE` defaults to on, so collection uses a
deterministic sample adapter. To collect from the live web for a specific job, create it with
`live: true` and set `TAVILY_API_KEY` plus `LLM_PROVIDER=openai` / `LLM_API_KEY` in `.env`.

```bash
npm test
```

## What stays deterministic

Intent matching, normalization, validation, dedupe, ranking, diffing, and exports do not call a
model. Conflict decisions go through a Jev-shaped provider; `mock` is the default and can be
swapped without changing the conflict rules.
