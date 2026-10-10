# Dig · Features

> **We dig the internet for you, so you don't have to.**
> Dig turns a plain-language question into a sourced list of sponsors, judges and speakers, jobs, leads or competitors. Every value is copied from a real web page and links back to it. Re-running a list shows what changed instead of starting over.

---

## Contents

1. [How Dig works](#1-how-dig-works)
2. [What Dig can find](#2-what-dig-can-find)
3. [Contacts: LinkedIn, GitHub and email](#3-contacts-linkedin-github-and-email)
4. [Working a list](#4-working-a-list)
5. [Re-runs, changes and review](#5-re-runs-changes-and-review)
6. [Events](#6-events)
7. [Toolkit](#7-toolkit)
8. [Downloads](#8-downloads)
9. [Help and plain language](#9-help-and-plain-language)
10. [Under the hood](#10-under-the-hood)
11. [Prototype and known limits](#11-prototype-and-known-limits)

---

## 1. How Dig works

1. **Understand.** An LLM (Groq) reads the question and picks the kind of search, the subject and the place. A keyword matcher backs it up.
2. **Search.** Several web searches (Tavily) suited to that kind of search.
3. **Extract.** The LLM turns the pages into rows.
4. **Ground.** A value is kept only if it appears word for word on its source page. A website domain is never mistaken for an email.
5. **Enrich.** In parallel and time-boxed: LinkedIn and GitHub profiles, and work emails seen on the web (Hunter.io). A profile counts only when the **name and the organisation** both match.
6. **Describe.** An empty "What they do" or "Expertise" is filled with words copied from the person's or company's own page, and that page is cited.
7. **Trust and tidy.** Jev (via OpenRouter) helps score trust; duplicates merge; every row is validated.
8. **Rank.** Rows with the most details come first; recency, number of sources and source authority break ties.

## 2. What Dig can find

| Search | Columns |
| :--- | :--- |
| **Sponsors** | Company · Event · Tier · Contact · Email · LinkedIn |
| **Judges, mentors and speakers** | Name · Affiliation · Expertise · Event · Email · LinkedIn · GitHub |
| **Jobs and internships** | Role · Company · Location · Workplace · Email · LinkedIn |
| **Leads** | Company · What they do · Contact · Email · Phone · LinkedIn |
| **Competitors** | Competitor · Category · Pricing · Website · Email · LinkedIn |

- Questions about **companies, vendors or products** run as Leads.
- **Events, funding and market trends** are coming soon; Dig says so instead of guessing.

## 3. Contacts: LinkedIn, GitHub and email

- **LinkedIn and GitHub columns** show the profile link when it was found and matched.
- A **faded link marked "check"** matched the name only. Confirm it before writing.
- No profile found? The LinkedIn column offers a one-click LinkedIn search for that name and organisation.
- **Emails are never guessed.** They come from a public page or from Hunter.io's web-sourced results.
- **Another contact** (Sponsors and Leads): when the first person doesn't reply, add the next person at the same company. They appear under the company with their own outreach status, note and pitch. People Hunter already returned are handed out at no extra cost.

## 4. Working a list

- **Outreach states:** Not contacted, Waiting, Interested, Declined, with counts as tabs above the table.
- **Notes** on any row, shared with your team.
- **Pitch:** writes a short first email from the row's sourced facts, your event's README, and your name and role. No invented praise. Edit it, then copy it or open it in your email app. Dig does not send emails for you.
- **Details panel:** every value's source page and quote, contact paths, and history.
- **Resizable columns**, sorting, search and bulk actions on selected rows.

## 5. Re-runs, changes and review

- **Run again** checks the web for changes and shows what was **added**, **changed** or **not found again**, without duplicating rows.
- When two values disagree, Dig settles clear cases itself, such as the fuller, newer or more official value. For example "IBM" vs "Engineering & AI Leader, IBM" keeps the fuller value.
- Otherwise Jev weighs the evidence. Below 85% confidence, the row shows **Needs review** and you choose.
- "Not found again" does not prove a row is gone; the pages searched can differ between runs.

## 6. Events

- Each event has a **README** (dates, targets, deadlines) and a **folder** for each kind of search.
- The README keeps the team in sync and is used when drafting pitches.
- **Hide folders** an event doesn't need; their searches are kept.
- **Got Something Else?** files any question into the right folder.
- Star, archive and rename events and folders.

## 7. Toolkit

| Tool | What it does |
| :--- | :--- |
| **Kickoff** | Describe your event and deadline; get a short dated plan (3–4 phases). It goes urgent-first when time is short and starts with "Decide first" for first-time events. Tasks link straight to the right Dig search, and checkboxes are saved with the event. It can create the event for you. |
| **Lens** | A few plain insights per kind of list. Sponsors: tiers, repeat sponsors, named contact vs inbox. Judges: expertise by topic, academia vs industry, reachability. Jobs: remote split, who's hiring, where. Leads: segments, best leads to contact next. Competitors: pricing, categories, most compared. Plus outreach progress, changes and a PDF. |
| **Merger** | Combine several lists into one spreadsheet, merge duplicates, filter by outreach status, and export. |
| **Flow** | A visual outreach plan: list → filter → rank → draft → your approval → send. **Prototype:** it runs and pauses for approval, but does not send messages. |

## 8. Downloads

- **Excel, CSV and JSON**, including outreach status and notes.
- **PDF report** in plain black and white: summary, table, changes and sources.
- **Lens PDF** with the same insights as the page.

## 9. Help and plain language

- **Hover help** on buttons, tabs, badges and every column, explaining in one sentence what each one shows. It works on hover, keyboard focus and tap.
- **Diglett**, the in-app assistant, answers questions about your lists and about Dig.
- **Toolkit introduction**: a short pop-up the first time you open Toolkit, and again any time from "What is Toolkit?".
- **"Why a README?"**: a quiet note on the event page explaining what the README is for.
- **Show/hide password** on login and signup.
- **Every pop-up closes** with its X, the Esc key, or a click outside it.
- **Resizable columns** that remember their width per kind of list.
- Plain words throughout, such as "confidence" rather than internal terms.

## 10. Under the hood

```
apps/
  api/   Express + SQLite (node:sqlite), Tavily, Groq, Jev (OpenRouter), Hunter.io, GitHub API
  web/   React 19 + Vite, TanStack Query and Table, jsPDF
packages/
  core/      intents, extraction rules, enrichment, ranking, Kickoff plans, pitch rules
  schemas/   shared Zod schemas and types
  database/  schema.sql (applied on start; only adds tables and columns)
```

- **Tests:** Vitest suites in `packages/core` (`npm test`). Typecheck all packages with `npm run typecheck`.
- **Deploy:** the API on Railway (with a volume for the database) and the web app on Vercel.
- **Optional services:** Jev, Hunter.io and GitHub. Without them Dig falls back to built-in rules, and a list still publishes if a contact lookup fails.

## 11. Prototype and known limits

- **Flow does not send** emails or messages.
- **Pricing checkout is a demo:** choosing a plan does not take payment.
- **Results vary between runs,** because the pages the web search returns change.
- **Hunter.io's free plan** allows 50 searches a month, so email finding is capped per run.
