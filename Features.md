# Dig · Platform Features & Technical Architecture

> **We dig the internet for you, so you don't have to.**  
> Dig is an autonomous, source-grounded research and outbound execution engine for event organizers, founders, recruiters, and growth hackers. Every entity is corroborated against live web pages, every outreach step is governed by human approval, and every re-run tracks changes instead of recreating spreadsheets from scratch.

---

## Table of Contents

1. [Executive Overview & Core Philosophy](#1-executive-overview--core-philosophy)
2. [Feature Matrix at a Glance](#2-feature-matrix-at-a-glance)
3. [Module 1: Grounded Research Pipeline & Natural Intent Engine](#3-module-1-grounded-research-pipeline--natural-intent-engine)
4. [Module 2: Event Workspaces & Dataset Management](#4-module-2-event-workspaces--dataset-management)
5. [Module 3: Autonomous Mission Copilot](#5-module-3-autonomous-mission-copilot)
6. [Module 4: Visual Workflow Canvas & Outreach Flow](#6-module-4-visual-workflow-canvas--outreach-flow)
7. [Module 5: Lens — Executive Intelligence & Analytics](#7-module-5-lens--executive-intelligence--analytics)
8. [Module 6: Interactive Workload & ROI Calculator](#8-module-6-interactive-workload--roi-calculator)
9. [Module 7: "Ask Diglett" AI Assistant & UX Aesthetics](#9-module-7-ask-diglett-ai-assistant--ux-aesthetics)
10. [Architecture, Security & Technical Specifications](#10-architecture-security--technical-specifications)

---

## 1. Executive Overview & Core Philosophy

Finding sponsors, mentors, keynote speakers, hiring leads, or competitors has traditionally forced teams to spend **8–15 manual hours** copying and pasting between Google, Devfolio, Unstop, and stale spreadsheets. When organizations try replacing this manual labor with generic conversational chatbots, they face **hallucinated companies, dead contact links, and zero evidence provenance**.

Dig solves this problem with three foundational pillars:

1. **Grounded, Not Guessed**: Every single record traces back to an authentic live URL with an unedited snippet quote. Zero hallucinated data is permitted into the system.
2. **Change-Aware Memory**: Re-running a dataset compares the new live web landscape against previous snapshots, surfacing what was *added*, *removed*, or *changed* rather than rebuilding duplicates.
3. **Autonomous Execution with Human Governance**: High-intent missions formulate multi-channel pitches (Email, WhatsApp, LinkedIn) across visual flow graphs, but **halt at a mandatory Human Verification Gate** before any message is sent.

```
                           NATURAL LANGUAGE QUERY
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    Intent Classification    │
                      │  (LLM Reasoning + Keyword)  │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    Live Web Extraction      │
                      │      (Tavily Search)        │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
    ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
    │ Normalize │ ──▶ │ Dedupe &  │ ──▶ │ Validate  │ ──▶ │ Rank &    │
    │  Schema   │     │ Resolution│     │ Provenance│     │ Corroborate
    └───────────┘     └───────────┘     └───────────┘     └───────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │  Conflict Resolution Engine │
                      │  (Recency vs Authority)     │
                      └──────────────┬──────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
    ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
    │  Event CRM &  │        │  Autonomous   │        │ Lens Executive│
    │  Data Folders │        │  Missions     │        │  Analytics    │
    └───────────────┘        └───────┬───────┘        └───────────────┘
                                     │
                                     ▼
                             ┌───────────────┐
                             │ Visual Flow & │
                             │ Multi-Channel │
                             │ Gateways (BYO)│
                             └───────────────┘
```

---

## 2. Feature Matrix at a Glance

| Feature Area | Capability | Key Technical Underpinning |
| :--- | :--- | :--- |
| **Natural Language Search** | Conversational prompt into grounded query | Hybrid intent classification (Groq/OpenAI LLM + Trie keyword fallback) |
| **Data Veracity** | Literal snippet quoting & provenance link | Field-level evidence validator with exact source URL storage |
| **Deduplication** | Merges duplicate entities across web runs | Canonical entity matching on primary keys (`company_name`, `person_name`, `role`) |
| **Conflict Handling** | Disagreeing web sources auto-reconciled | Weighted confidence comparison (recency + domain authority) with human review |
| **Time-Series Tracking** | Shows exact additions, removals, and shifts | Snapshot versioning with SQLite transaction diff generation |
| **Event Workspace** | Structured folder filing per hackathon/fest | Event-scoped folders (Sponsors, Judges, Jobs, Leads, Competitors, "Got Something Else?") |
| **CRM Workflow** | Mark interest, log notes, export CSV/JSON/XLSX | In-memory query updates, persistent SQLite audit records, streaming exports |
| **Autonomous Missions** | High-level goal planning to execution pipeline | Objective deconstruction into governed steps (`planMission`, `simulateMission`) |
| **Visual Flow Canvas** | Interactive graph pipeline builder | `@xyflow/react` node canvas with auto-layout and drag-and-drop connectors |
| **Multi-Channel Dispatch** | Contextual outreach on Email, WhatsApp, LinkedIn | Multi-channel pitch drafting with personal gateway credentials (BYOK) |
| **Human Safety Gate** | Mandatory human sign-off before dispatch | Graph-level `approval` node pausing execution until explicit user authorization |
| **Executive Lens** | Visual dataset briefings & health score | Algorithmic scoring (0–100), funnel analytics, source graphs, PDF export |
| **ROI Calculator** | Live tailored workload pricing calculator | Multi-parameter formula calculating hours saved, freelance equivalent, and net ROI |
| **Assistant Mascot** | Embedded interactive guide ("Ask Diglett") | Custom pixel-art assistant with prompt recommendations and event analytics |

---

## 3. Module 1: Grounded Research Pipeline & Natural Intent Engine

### 3.1 Dual-Engine Intent Classification
Dig interprets plain-language user prompts through a hybrid architecture:
- **LLM Reasoning Lane**: Fast inference via Groq/OpenAI extracting the research intent, core `subject`, geographical `location`, and industry `category`.
- **Zero-Latency Keyword Matcher**: High-performance weighted token scanner ensuring searches are never blocked if an API key expires or network latency spikes.

### 3.2 11 Extensible Research Intents
The underlying schema engine (`packages/schemas` and `packages/core`) natively supports 11 structured intent types:
1. `SPONSOR_LOOKUP`: Organizations actively backing events with track records of platform credits, cash prizes, and swags.
2. `JUDGE_LOOKUP`: Keynote speakers, professors, researchers, jury members, and mentors with public profiles.
3. `JOB_LOOKUP`: Open internships and developer roles tied directly to active careers pages.
4. `LEAD_LOOKUP`: Targeted B2B companies, agencies, and D2C brands with public contact paths.
5. `COMPETITOR_LOOKUP`: Competing platforms, alternative products, and rival market participants.
6. `FUNDING_LOOKUP`: Venture grants, open-source fellowships, seed funds, and angel syndicates.
7. `VENDOR_LOOKUP`: Event venues, catering/food suppliers, merchandise printers, and logistics partners.
8. `PRODUCT_LOOKUP`: Software developer tools, cloud APIs, libraries, and SDKs.
9. `MARKET_LOOKUP`: Industry shifts, market signals, and technology adoption trends.
10. `EVENT_LOOKUP`: Upcoming summits, conferences, hackathons, and symposiums.
11. `COMPANY_LOOKUP`: General technology company profiles, headquarters, and tech stacks.

### 3.3 Strict Field-Level Evidence & Provenance
- Every generated row stores an exact `source_url` and verifiable quote snippet.
- A confidence score (0–100%) is calculated based on corroboration count across disparate web sources.
- Zero AI hallucinations: If an entity or email cannot be verified from a live URL, it is rejected by the validation pipeline.

### 3.4 Automated Deduplication & Identity Resolution
- Normalizes corporate and personal naming variants (e.g. *"Google LLC"*, *"Google India"*, *"Google"*).
- Resolves identities into unified canonical entity records, aggregating corroborating sources.

### 3.5 Conflict Detection & Auto-Resolution Engine
- When multiple websites state conflicting information (e.g. different emails or contradictory sponsor tiers), Dig compares:
  - **Recency**: Timestamp of the newest verified source.
  - **Domain Authority**: Canonical company sites versus third-party aggregators.
- **Auto-Resolution**: Automatically selects the most authoritative value when confidence is high.
- **Human Review Flag**: Ambiguous conflicts are surfaced in an interactive review drawer with side-by-side evidence diffs.

### 3.6 Time-Series Versioning & Snapshot Diffs
- Re-running a search does not wipe data or create duplicate clutter.
- Dig saves versioned snapshots (`version_1`, `version_2`) and produces diff ledgers highlighting:
  - 🟢 **Added**: Brand new entities entering the market.
  - 🟡 **Changed**: Existing sponsors who modified tiers or updated contacts.
  - 🔴 **Removed**: Organizations no longer sponsoring or defunct links.

---

## 4. Module 2: Event Workspaces & Dataset Management

### 4.1 Event-Scoped Architecture
Every research scout is housed within a dedicated **Event Workspace** (e.g. *HackIndia 2026*, *DevFest Delhi*). Workspaces feature:
- Custom README documentation with date tracking, descriptions, and target KPI goals.
- Categorized folder grid for the 5 primary pillars:
  - 🏢 **Sponsors**
  - 🎓 **Judges & Mentors**
  - 💼 **Jobs**
  - 🎯 **Leads**
  - ⚔️ **Competitors**
- **"Got Something Else?" Action Button**: Easily launch queries outside the 5 pillars (e.g., keynote speakers, hardware lab sponsors, developer tool perks) without getting constrained.

### 4.2 Lightweight Collaborative CRM
- **Status Tags**: Mark individual contacts as `Interested`, `Declined`, or `Pending`.
- **Shared Team Notes**: Log notes on outreach calls, objections, or negotiation points directly on the record.
- **Quick Unlink & Re-linking**: Switch or archive search runs attached to any folder.

### 4.3 Multi-Format Export Engine
Export clean, deduplicated datasets at any time in your preferred format:
- **CSV**: Standard spreadsheet format ready for Google Sheets or CRM import.
- **Formatted Excel (.xlsx)**: Color-coded headers, auto-width columns, and verified hyperlink formatting.
- **JSON**: Machine-readable payload for developer APIs and webhooks.
- **Executive Intelligence Briefing**: Written Markdown and plain-text briefing citing sources and explaining ranking rationale.

---

## 5. Module 3: Autonomous Mission Copilot

### 5.1 Outcome-Driven Directives
Located at `/agents/mission`, the **Mission Copilot** bridges the gap between raw data and real-world outcomes. Instead of building manual filters, users provide a strategic objective:
> *"Find 20 companies likely to sponsor the event, with a verified contact path."*

### 5.2 Curated Strategic Archetypes
1. **Find High-Value Sponsors**: Identifies organizations with verified sponsorship history and contactable decision-makers.
2. **Find Hiring Leads**: Surfaces companies with active tech hiring and published recruitment emails.
3. **Identify Competitors**: Compares market alternatives and surfaces competitor shifts.
4. **Scout Judges & Mentors**: Ranks academic researchers and senior tech leads by credibility and profile authenticity.
5. **Contact Enrichment**: Locates verified missing email and LinkedIn paths for an existing dataset.

### 5.3 Instant Pre-Flight Simulation
Before executing any workflow, the copilot simulates the pipeline:
- **Candidate Yield**: Exact count of qualifying entities in your dataset.
- **Direct Reachability**: Tally of verified emails, phone numbers, and LinkedIn handles.
- **Evidence Veracity %**: Average cross-referenced confidence score across the candidate pool.
- **Estimated Runtime**: Runtime calculation for data dispatch.

### 5.4 Executive Deliverables Suite
- **Executive Strategic Dossier**: High-level synopsis with market footprint, strategic opportunities, and a **"Copy Briefing"** button ready for team updates.
- **Curated Deliverables Table**: Prioritized target list with contactability indicators and 1-click **"Export CSV"**.
- **1-Click "Launch in Outreach Flow"**: Translates the mission's requirements directly into a connected visual workflow graph.

---

## 6. Module 4: Visual Workflow Canvas & Outreach Flow

### 6.1 Interactive Node-Based Builder (`@xyflow/react`)
Located at `/agents/flow`, Dig features an executive flow canvas where users construct visual research and outreach pipelines.

#### Supported Node Types:
- **Dataset Input**: Binds the active dataset and feeds records downstream.
- **Filter**: Filters records by confidence, contactability score, or location rules.
- **Ranker**: Sorts records by custom metrics (e.g. highest veracity, highest contactability).
- **Pitch Drafter (Email, WhatsApp, LinkedIn)**: Generates personalized multi-channel outreach copy based on entity context.
- **Human Verification Gate**: Pauses execution until an authorized user approves the generated drafts.

### 6.2 Bring-Your-Own-Keys (BYOK) API Gateways
Users can connect their personal credentials so outreach is dispatched authentically on their own behalf rather than through generic system endpoints:
- **Email Gateway**:
  - **Google OAuth 2.0 / Gmail App Passwords** (authentic personal sending).
  - **Custom SMTP** (host, port, TLS, username, password).
  - **Resend API** (developer-grade email delivery).
- **WhatsApp Gateway**:
  - **Twilio WhatsApp API** (Account SID, Auth Token, Sender number).
  - **Meta WhatsApp Cloud API** (Phone ID, WABA ID, Access Token).
- **LinkedIn Gateway**:
  - Personal Profile credentials (Name, Title, Profile URL, Session authorization).

### 6.3 Mandatory Human Safety Gate
- AI drafts outreach copy, but **never dispatches without explicit permission**.
- When an execution hits an `approval` node, the canvas pauses with a high-priority approval banner.
- Users click **"Review Messages"** to inspect all personalized drafts in an interactive modal.

### 6.4 Interactive Dispatch & Delivery Confirmation
- **Spacious Dispatch Modal**: Preview subject lines, full body copy, and recipient contact info across separate channel tabs.
- **Dry-Run vs. Live Dispatch**: Test-run pipelines in sandbox dry-run mode or initiate real outbound delivery.
- **Live Execution Animation**: Animated visual stages show nodes progressing from `QUEUED` &rarr; `RUNNING` &rarr; `COMPLETED`.
- **Delivery Receipts Modal**: Displays real-time delivery status, sender provenance, recipient handle, and audit timestamps.

### 6.5 Workflow Lifecycle Management
- **Auto-Selection on Page Load**: Automatically selects the most recent workflow so users never encounter a blank canvas.
- **Template Deduplication & Reuse**: Reuses existing unused templates rather than cluttering the database with ghost duplicates.
- **Auto-Disambiguation**: Automatically appends indices (e.g. `(2)`, `(3)`) to prevent name collisions.
- **Toolbar Delete Button**: 1-click `<Trash2 />` deletion with confirmation prompts.
- **Auto-Tidy Flow**: 1-click DAG layout engine that automatically cleans up and snaps nodes into an aligned grid.
- **Hotkeys**: Full undo (`Ctrl+Z`), redo (`Ctrl+Y`), copy/paste nodes (`Ctrl+C` / `Ctrl+V`), fit view (`F`), zoom in/out (`+` / `-`).

---

## 7. Module 5: Lens — Executive Intelligence & Analytics

### 7.1 Dataset Intelligence Briefing
Located at `/agents/lens`, Lens transforms raw extraction records into high-level executive summaries:
- Automatic synthesis of verified organizations.
- Full snapshot run-to-run comparison showing net row shifts.
- Auto-selection on page load ensuring immediate access to your latest dataset.

### 7.2 Algorithmic Health Score (0–100)
A holistic quality metric calculated from:
$$\text{Health Score} = (\text{Avg Confidence} \times 0.5) + (\text{Contactability } \% \times 0.35) + (15 - \text{Conflict Deductions})$$
Categorized into:
- 🟢 **Grade A · Prime** ($\ge 80$)
- 🔵 **Grade B · High Quality** ($\ge 65$)
- 🟡 **Grade C · Action Needed** ($< 65$)

### 7.3 Tri-Pillar Strategic Insights Grid
1. **Grounding & Veracity**: Reports multi-source verification percentage and detects conflicting entity keys.
2. **Market Footprint & Signal**: Highlights active technology sectors, regional concentrations, and digital footprint signals.
3. **Strategic Opportunity**: Pinpoints missing contact paths, recommending specific enrichment or outreach steps.

### 7.4 Visual Analytics Suite
- **Conversion & Contactability Funnel**: Tracks the drop-off from raw extracted entities to verified organizations with direct contact paths.
- **Confidence Distribution Bar Chart**: Visualizes the density of high, medium, and low confidence records.
- **Geographic & Role Distribution**: Identifies city hubs and decision-maker job titles.
- **Interactive Entity & Source Graph**: Interactive node-link graph mapping entities to the exact websites, platforms, and databases they were corroborated from.

### 7.5 Executive PDF Intelligence Export
1-click PDF download (`downloadLensReport`) generating a publication-grade executive document featuring the briefing synopsis, health score, category distributions, source breakdown, and strategic recommendations.

---

## 8. Module 6: Interactive Workload & ROI Calculator

### 8.1 Live Multi-Parameter Synthesis
Located on the `/pricing` page, Dig features a real-time ROI calculator reacting dynamically to three simultaneous parameters:
1. **Monthly Live Collection Runs** ($5 \text{ to } 250$)
2. **Curated Dataset Lists** ($2 \text{ to } 100$)
3. **Simultaneous Hackathon Events** ($1 \text{ to } 20$)

### 8.2 Real-Time Dynamic Metrics
- **Human Research Time Saved**:
  $$\text{Hours} = (\text{Runs} \times 1.2) + (\text{Lists} \times 3.0) + (\text{Events} \times 8.0)$$
- **Freelance Agency Equivalent Cost**:
  $$\text{Manual Cost} = (\text{Runs} \times ₹400) + (\text{Lists} \times ₹1,250) + (\text{Events} \times ₹4,000)$$
- **Effective Rate per Curated List**: Dynamically calculates per-list cost (e.g. `₹17 / list` vs. `₹1,250` market rate).
- **Net Estimated Savings**: Live savings figure with savings ratio percentage (e.g. `+₹66,168/mo (98%)`).
- **Dynamic Research Scope**: Subtitle reflects current workload composition in real time.

### 8.3 Transparent Subscription Tiers
- **Starter (Community, ₹0 / mo)**: Up to 5 runs, 2 lists, 1 event.
- **Pro Researcher (₹399 / mo or ₹332 / mo annual)**: Up to 40 runs, 20 lists, 6 events.
- **Scale & Agency (₹1,190 / mo or ₹990 / mo annual)**: High-concurrency pipelines with automatic tailored volume buffering.
- **One-Click Presets**: 🎓 *Student* (5 runs, 2 lists, 1 event), ⚡ *Solo Scout* (40 runs, 20 lists, 6 events), 🚀 *Agency* (180 runs, 75 lists, 15 events).

### 8.4 Frictionless Payment Gateway
- Built-in UPI QR code integration supporting Google Pay, PhonePe, and Paytm.
- UTR transaction verification with automated plan upgrade toast.

---

## 9. Module 7: "Ask Diglett" AI Assistant & UX Aesthetics

### 9.1 Persistent Research Assistant ("Ask Diglett")
- Animated, custom-crafted pixel-art mascot assistant anchored in the bottom-right corner.
- Context-aware research advice tailored to your active event or dataset.
- Suggests refined search prompts, analyzes dataset health, and recommends optimal next actions.

### 9.2 Executive macOS-Inspired Window Shell
- **Titlebar & Lights**: Elegant window frame with colored control lights, interactive breadcrumb navigation, and universal search bar.
- **Theme Switcher**: Instant switching between Light and Dark mode with custom CSS tokens.
- **Non-Obtrusive Sidebars**: Collapsible navigation tailored for Events, Agents, and Settings.

---

## 10. Architecture, Security & Technical Specifications

### 10.1 Monorepo Architecture
```
Dig/
├── apps/
│   ├── api/            # Express, better-sqlite3, Groq/OpenAI, Tavily runner
│   └── web/            # Vite, React 19, Tailwind CSS, @xyflow/react, TanStack Query
├── packages/
│   ├── core/           # Intent models, blueprint planners, verification engine
│   └── schemas/        # Shared Zod schemas, TypeScript types, validation rules
└── data/
    └── dig.db          # Embedded SQLite database (zero external database dependency)
```

### 10.2 Database Architecture (SQLite)
- **Local-First & Embeddable**: Powered by `better-sqlite3` and `node:sqlite`. Zero cloud database setup required.
- **ACID Transactions**: Atomic commits for deduplication, workflow deletions, and diff creation.
- **Tables**: `workspaces`, `users`, `events`, `jobs`, `records`, `conflicts`, `audit_log`, `workflows`, `workflow_runs`, `workflow_approvals`, `missions`.

### 10.3 Quality & Reliability
- **Strict TypeScript**: 100% typechecked across all 4 packages with 0 compile errors (`npm run typecheck`).
- **Comprehensive Test Suite**: 62 unit tests across 5 test suites running under Vitest (`npm test`).
- **Security**: Strict workspace-level data isolation, credential encryption in local storage, and zero outbound message dispatch without human authorization.

---

## Summary

Dig transforms messy, unverified web scraping into an **auditable, executive-grade intelligence and execution engine**. From natural-language query parsing to grounded verification, autonomous mission planning, visual flow customization, and executive analytics, Dig is built to empower organizers and researchers to focus on making decisions while the AI does the digging.
