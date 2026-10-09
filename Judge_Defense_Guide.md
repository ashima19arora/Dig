# Dig · Hackathon Pitch Defense & Judge Q&A Guide

> **How to win the room when judges ask the toughest questions.**  
> This guide equips you with battle-tested, authoritative answers to every skeptical question judges will ask about ChatGPT, LinkedIn, web scrapers, data accuracy, moats, and business viability.

---

## The Master Framework: How to Frame Dig

Whenever a judge compares Dig to ChatGPT or LinkedIn, anchor your answer on this equation:

$$\text{ChatGPT/LinkedIn} = \text{Data / Text Generators}$$
$$\text{Dig} = \text{Source-Grounded Intelligence Pipeline + Governed Execution Engine}$$

> **The 30-Second Mic Drop:**  
> *"ChatGPT gives you a text bullet list today and a different hallucinated list tomorrow with zero memory. LinkedIn gives you a walled garden of individual profile cards with no event context. Dig gives you a multi-source corroborated intelligence pipeline with time-series diffs, conflict resolution, and governed multi-channel execution that takes you from a raw goal to approved outreach in 30 seconds."*

---

## 1. The Big Two: ChatGPT & LinkedIn

---

### Question 1: "Why wouldn't I just use ChatGPT (or Perplexity / Claude) to find these sponsors and leads?"

#### ❌ The Losing Answer:
*"Because ChatGPT hallucinates and doesn't have real-time data."*  
*(Judges will counter: "Perplexity and ChatGPT Search have web browsing now.")*

#### 🏆 The Winning Knockout Answer:
> *"Perplexity and ChatGPT Search are **stateless query interfaces**, not **intelligence pipelines**. Here are 4 reasons why ChatGPT fails for real operations:
> 
> 1. **Zero Time-Series State & Diffs:** If you ask ChatGPT for sponsors today, you get 10 names. If you ask next month, you get 10 different names. It cannot tell you: *'Company X dropped out, Company Y upgraded to Title Sponsor, and Company Z hired a new Head of Developer Relations.'* Dig maintains snapshot versioning and produces clean time-series diffs (Added / Changed / Removed).
> 2. **No Conflict Resolution Engine:** When two web pages list conflicting contact emails or sponsorship tiers, ChatGPT picks one at random or averages them out. Dig has an algorithmic conflict engine that evaluates **recency vs. domain authority** to auto-resolve or flag genuine discrepancies for human review.
> 3. **Structured Entity Resolution:** ChatGPT outputs raw Markdown text that you still have to manually copy into spreadsheets. Dig normalizes entities, deduplicates aliases (e.g. *Google India* vs *Google LLC*), extracts verified contact paths, and exports clean CSV/Excel/JSON.
> 4. **Execution Bridge:** ChatGPT stops at the answer. Dig takes those verified leads directly into an interactive visual workflow (`Flow`) with personal API gateways (Google OAuth, Twilio WhatsApp, LinkedIn) and mandatory human approval gates."*

**Mic Drop:**  
> *"ChatGPT is where research starts; Dig is where research gets audited, tracked over time, and executed."*

---

### Question 2: "Why wouldn't I just use LinkedIn or LinkedIn Sales Navigator for jobs and leads?"

#### ❌ The Losing Answer:
*"Because LinkedIn is expensive and doesn't have hackathon sponsors."*

#### 🏆 The Winning Knockout Answer:
> *"LinkedIn is a **single walled garden**. It only knows what individual employees put on their personal profiles. 
> 
> 1. **Multi-Source Triangulation:** Hackathon sponsorship doesn't live on LinkedIn profile bios. It lives across hackathon portals (Devfolio, Unstop, HackerEarth), GitHub repositories, university press releases, and YouTube event streams. Dig crawls across the open web and corroborates entities across all of them.
> 2. **Intent Context vs. Static Titles:** On LinkedIn, searching for 'Developer Relations' gives you 5,000 people who have no budget or interest in your hackathon. Dig looks for *active sponsorship signals*—companies that have sponsored similar events in your region within the last 90 days.
> 3. **The Workflow Chasm:** On LinkedIn, once you find 20 people, you still have to manually copy their names, look up their emails, write personalized messages one by one, and track them in a spreadsheet. In Dig, you formulate a single Mission (*'Find 20 sponsors with verified contact path'*), and Dig extracts, ranks, drafts multi-channel pitches, and queues them in a visual pipeline in under 30 seconds."*

**Mic Drop:**  
> *"LinkedIn gives you an infinite phonebook. Dig gives you a filtered, verified deal pipeline with the outreach pre-drafted."*

---

## 2. Hard Technical & Architecture Questions

---

### Question 3: "Isn't this just a wrapper around the Tavily search API and an LLM?"

#### ❌ The Losing Answer:
*"No, we wrote lots of code and built a nice UI."*

#### 🏆 The Winning Knockout Answer:
> *"Search and LLM inference are only **15% of our codebase**. The core IP of Dig lives in our deterministic post-processing and governance pipeline:
> 
> 1. **The Field-Level Evidence Validator:** We run literal snippet matching to guarantee that every single extracted field (email, phone, tier) can be quoted verbatim from the source DOM. If an LLM attempts to infer or extrapolate, the pipeline rejects it before it ever hits the database.
> 2. **Canonical Entity Matching & Deduplication:** When 5 different event websites mention *'Microsoft'*, *'Microsoft Azure'*, and *'Microsoft India'*, our identity resolution engine unifies them into a single canonical entity with aggregated corroboration links.
> 3. **The Recency/Authority Conflict Graph:** We built an automated conflict reconciliation engine that compares source publication timestamps against canonical domain authority to settle discrepancies.
> 4. **Stateful Graph Orchestrator (`@xyflow/react` + BYOK Gateways):** We built a full visual DAG workflow engine with animated execution stages, dry-run simulations, and bring-your-own-key gateways for Google OAuth 2.0, Twilio, and LinkedIn.
> 
> Calling Dig a wrapper is like calling GitHub a wrapper around `git`—the value is in the collaboration, versioning, governance, and end-to-end execution."*

---

### Question 4: "What happens if a website has anti-scraping or the data is behind a login?"

#### 🏆 The Winning Knockout Answer:
> *"Dig is designed for **public verifiable intelligence**. Most hackathon sponsorship data, past jury rosters, hiring notices, and public contact directories are intentionally published on public indexable web pages (event sites, press releases, company blogs, job boards).
> 
> Furthermore, because Dig employs **multi-source corroboration**, it never relies on a single fragile page. If one page is blocked or paywalled, Dig cross-references the entity from alternative public corroborating sources like Devfolio archives, GitHub sponsors, university announcements, or press mentions."*

---

### Question 5: "How do you prevent spam if you have automated outreach?"

#### 🏆 The Winning Knockout Answer:
> *"We built Dig on a strict **Human-in-the-Loop Governance** philosophy:
> 
> 1. **Mandatory Human Verification Gate:** In our visual workflow canvas (`Flow`), outreach nodes cannot fire autonomously. The execution graph automatically pauses with a high-priority approval banner.
> 2. **Interactive Pitch Preview Modal:** Organizers can review every email, WhatsApp message, and LinkedIn pitch, edit the body or subject line, switch between personal Google OAuth or Twilio gateways, and run a **dry-run simulation** before any real byte leaves the system.
> 3. **Zero Cold Spam:** Dig filters out low-confidence records and requires verified contact paths, preventing blind mass emailing."*

---

## 3. Product, Business & Moat Questions

---

### Question 6: "What is your moat? What stops a competitor from building this in a weekend?"

#### 🏆 The Winning Knockout Answer:
> *"Anyone can call an LLM API in a weekend. Here is what they cannot build in a weekend:
> 
> 1. **The Historical Event Intelligence Graph:** As Dig runs, it builds a persistent local SQLite dataset of who sponsors what, at what tier, with what verified decision-makers, and how those sponsorships evolved across versions. That historical memory compounds with every search.
> 2. **The Conflict & Corroboration Engine:** Handling messy web data—where dates change, emails bounce, and sponsor tiers shift—requires complex deduplication, identity resolution, and conflict reconciliation algorithms that took rigorous testing across 62 unit test suites.
> 3. **End-to-End Vertical Integration:** Competitors either build a scraper (Clay/Apify), a CRM (HubSpot), or an email tool (Instantly). Dig vertically integrates the entire journey: from raw natural language intent &rarr; multi-source web extraction &rarr; time-series diffing &rarr; visual flow graph &rarr; personal gateway dispatch."*

---

### Question 7: "Who is the customer and how do you make money?"

#### 🏆 The Winning Knockout Answer:
> *"Our primary ICP is **Hackathon Organizers, Tech Conferences, Student Communities, and Startup Scout Teams**.
> 
> - **The Burning Pain:** An organizing team of 5 college students or founders spends 15 hours a week desperately hunting for sponsors and judges. If they miss sponsors, their event gets cancelled.
> - **Monetization (Metered SaaS):**
>   - **Community (Starter):** Free for individual students (5 runs, 2 lists, 1 event).
>   - **Pro Researcher (₹399/mo or ₹332/mo annual):** For active hackathons and campus teams (40 collection runs, 20 lists, 6 events, multi-channel pitch drafting).
>   - **Scale & Agency (₹1,190/mo or ₹990/mo annual):** For university fests, growth agencies, and VC scouting with high-volume concurrency.
> - **Unit Economics:** An agency charges ₹15,000–₹50,000 to scout event sponsors. Dig delivers 10x higher veracity for ₹399/mo—a 97% net savings."*

---

### Question 8: "Why did you build personal API gateways (Google OAuth, Twilio) instead of just sending all emails from Dig's server?"

#### 🏆 The Winning Knockout Answer:
> *"Because **nobody opens a cold sponsorship pitch from `noreply@dig-platform.com`**. 
> 
> Sponsorship and speaker outreach only succeed when the email comes directly from the authentic organizer—e.g. `mayank@hackathon.org` via their genuine Google Workspace or personal Gmail. By allowing users to Bring Their Own Keys (Google OAuth 2.0, Twilio WhatsApp, LinkedIn), messages land in the primary inbox with authentic sender headers and zero domain reputation penalty for Dig."*

---

## 4. Quick-Fire Cheat Sheet for Live Demo

| If the Judge says... | You respond with... |
| :--- | :--- |
| *"Looks like just another AI directory."* | *"Directories are static graveyards. Dig is an active pipeline that pulls live web data on demand and tracks changes over time."* |
| *"Why not use Apollo or ZoomInfo?"* | *"Apollo is built for B2B enterprise sales, not event intelligence. It doesn't know who sponsored last week's Devfolio hackathon or who judged an AI track."* |
| *"How do I know this data is real?"* | *"Click any row—we show the exact source URL and the literal sentence quoted from the live web page."* |
| *"What if I want to search for something other than the 5 folders?"* | *"Click 'Got Something Else?'—our natural language intent parser dynamically handles keynote speakers, grants, hardware lab sponsors, and custom scout targets."* |
| *"Is it ready for production?"* | *"Yes. The app is fully responsive, runs on Node 24 and React 19, backed by an embedded SQLite engine with zero cloud database latency, and passes all 62 test suites."* |

---

## 5. Summary: The Winning Closing Statement

> *"Judges, the world doesn't have a shortage of data. It has a shortage of verifiable truth and actionable execution. 
> 
> Chatbots guess. Spreadsheets rot. LinkedIn is walled off. 
> 
> Dig gives organizers and builders a source-grounded research pipeline that extracts verified facts, watches for changes, and drafts governed outreach ready for human approval. We dig the internet so teams can build great events."*
