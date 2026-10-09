import {
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Folder,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type DatasetRecord, type JobSummary } from "../api";
import { FOLDERS, folderLabel, useEvents, type DigEvent, type FolderKey } from "../events";
import { useSession } from "../session";
import { GUIDE_URL } from "./Marketing";

// ---------------------------------------------------------------------------
// 1. Comprehensive Platform Knowledge Base (RAG Documents)
// ---------------------------------------------------------------------------
export interface KnowledgeDoc {
  id: string;
  category: "philosophy" | "archetypes" | "veracity" | "outreach" | "workflows" | "payments" | "metering" | "exports" | "general";
  title: string;
  keys: string[];
  summary: string;
  bullets: string[];
  actionLink?: { label: string; to: string };
}

export const KNOWLEDGE_BASE: KnowledgeDoc[] = [
  {
    id: "veracity-vs-guessed-emails",
    category: "philosophy",
    title: "100% Veracity Principle vs. Hallucinated / Guessed Emails",
    keys: [
      "veracity", "hallucinat", "why veracity", "why no email", "missing email", "no contact",
      "guess email", "fake email", "pattern", "paytm", "phonepe", "reputation", "evidence",
      "why evidence", "proof", "accuracy", "grounded", "real data"
    ],
    summary:
      "Dig never generates or guesses probabilistic email patterns (e.g. first.last@domain.com). Guessing burns your domain sender reputation, triggers spam blacklists, and destroys dealmaker credibility. Instead, Dig requires 100% word-for-word citations directly from live indexed web pages.",
    bullets: [
      "Zero Email Hallucination: Every contact point or email shown is explicitly quoted from a live, verifiable URL.",
      "The Paytm Office Principle: Guessing an address and pitching competitors burns partner trust permanently. Authentic provenance builds instant rapport.",
      "Verified Discovery: Once you identify the verified decision maker and sponsorship history, reaching out via 1-click Search Leads or LinkedIn takes seconds without risking domain reputation.",
    ],
    actionLink: { label: "Learn About Veracity", to: "/why-dig" },
  },
  {
    id: "five-intelligence-archetypes",
    category: "archetypes",
    title: "The 5 Core Intelligence Archetypes & Research Folders",
    keys: [
      "archetypes", "folders", "supported", "what can dig find", "types", "kinds of search",
      "sponsors", "judges", "mentors", "jobs", "leads", "competitors", "intents"
    ],
    summary:
      "Dig organizes research into five dedicated intelligence archetypes. When you submit a plain-English query, the LLM blueprint parser classifies your intent and automatically files the results into the matching folder.",
    bullets: [
      "1. Sponsors: Identifies corporate, tech & community sponsors, historical sponsorship tiers (Title, Gold, Silver), contact points, and corporate portals.",
      "2. Judges & Mentors: Surfaces academic researchers, engineering leaders, and past jury members with specific domain expertise.",
      "3. Jobs: Live hiring listings, compensation benchmarks, engineering stacks, and verified direct application paths.",
      "4. Leads: High-intent B2B target companies, D2C brands, and verified decision-maker contact paths.",
      "5. Competitors: Comprehensive market landscape analysis, software alternatives, pricing teardowns, and feature differentials.",
    ],
    actionLink: { label: "View Workspace Folders", to: "/dashboard" },
  },
  {
    id: "jev-proof-and-conflict-resolution",
    category: "veracity",
    title: "Jev Proof Engine & Conflict Resolution ('Needs Review')",
    keys: [
      "needs review", "conflict", "jev", "proof", "hash", "source", "diff", "keep new",
      "keep previous", "re-run", "rerun", "refresh", "changes", "disagree", "audit"
    ],
    summary:
      "When a search is re-run, Dig compares every field with prior snapshots. When web sources disagree or a verified change is detected, Dig marks the row 'Needs Review' instead of guessing.",
    bullets: [
      "Audit Trail & Provenance: Click any row to inspect the exact quoted sentence, the source URL, and the timestamp it was verified.",
      "Conflict Review Modal: Click 'Review conflicts' to inspect Previous vs. New values side-by-side, then 1-click 'Keep new' or 'Keep previous'.",
      "Diff Highlighting: Visual badges show exactly what was added, changed, or dropped across runs.",
    ],
  },
  {
    id: "upi-utr-direct-settlement",
    category: "payments",
    title: "UPI Direct Settlement & 12-Digit UTR Verification",
    keys: [
      "utr", "upi", "payment", "pricing", "qr code", "qr scanner", "paytm", "gpay", "phonepe",
      "bank ledger", "reconcil", "11900", "399", "scale", "direct settlement", "npci", "fee"
    ],
    summary:
      "Dig incorporates a production-grade direct UPI payment workflow designed specifically for Indian startups and SMBs, bypassing 2–3% gateway aggregation fees and 72-hour payout lockups via direct NPCI bank transfer.",
    bullets: [
      "Direct VPA Rail: Scan the high-resolution QR scanner with Paytm, PhonePe, or GPay to transfer directly to 9953314375@ptyes (MAYANK GARG).",
      "12-Digit Bank UTR: Submit your bank reference / UTR number for instant automated ledger reconciliation.",
      "In-Modal Billing Toggle: Switch seamlessly between Monthly Flexible and Annual Prepaid (17% OFF) right in the macOS checkout sheet.",
      "Scale Capacity Selector: For high-volume teams, scale from 1x Standard (250 runs) up to 5x Enterprise (1,250 runs).",
      "Digital Receipt: Generates an authentic macOS digital transaction voucher with 1-click PDF printing.",
    ],
    actionLink: { label: "Open Pricing & Plans", to: "/pricing" },
  },
  {
    id: "outreach-and-multichannel-pitch",
    category: "outreach",
    title: "Multi-Channel Outbound & CRM Human Gate",
    keys: [
      "outreach", "crm", "email", "whatsapp", "linkedin", "inmail", "pitch", "resend",
      "interested", "declined", "not contacted", "notes", "human gate"
    ],
    summary:
      "Dig pairs verified contact paths with multi-channel outreach drafting across Email, WhatsApp Business, and LinkedIn InMail with human-in-the-loop review.",
    bullets: [
      "Evidence-Driven Pitch Copy: Generates tailored pitch angles citing the exact reason a company sponsors or matches your brief.",
      "CRM Tracking: 1-click toggle between Not Contacted → Interested → Declined with persistent team notes.",
      "Zero Runs Spent on CRM: Editing outreach marks, adding tags, or browsing your stored list costs 0 runs.",
    ],
  },
  {
    id: "visual-workflow-canvas",
    category: "workflows",
    title: "Visual Workflow Canvas & Node Automation",
    keys: [
      "flow", "canvas", "reactflow", "visual workflow", "pipeline", "nodes", "wiring",
      "triggers", "enrichers", "dispatchers", "automation"
    ],
    summary:
      "Dig includes an interactive ReactFlow visual node graph at /flow to design and trace end-to-end automated research and outreach pipelines.",
    bullets: [
      "Trigger Nodes: Schedule automated calendar refreshes or listen for newly announced hackathon briefs.",
      "Enricher Nodes: Chain Tavily web searches and LLM extraction filters.",
      "Dispatcher Nodes: Route verified contacts through Resend or WhatsApp gateways.",
      "Live Execution Tracing: Watch wires pulse as data flows through condition nodes in real time.",
    ],
    actionLink: { label: "Open Workflow Canvas", to: "/flow" },
  },
  {
    id: "research-metering-and-plans",
    category: "metering",
    title: "Predictable Research Metering & Quotas",
    keys: [
      "meter", "allowance", "quota", "runs", "lists", "events", "rows", "starter", "pro",
      "scale", "cost", "how many runs", "limits", "pricing plan"
    ],
    summary:
      "Dig bills the research output rather than individual seat licenses. Opening datasets, browsing records, filtering, and exporting never spend collection runs.",
    bullets: [
      "Events: Dedicated workspace slots for events or research briefs. Archiving frees the slot immediately.",
      "Curated Lists: Saved datasets in your folders. Re-opening a list you already hold is 100% free.",
      "Collection Runs: Live web execution bundles combining Tavily search and Gemini parsing.",
      "Starter (Free Forever): 5 live runs/mo, 2 curated lists, 1 active event.",
      "Pro Researcher (₹399/mo): 40 runs/mo, 20 curated lists, 6 active events, multi-channel pitch drafting.",
      "Scale & Agency (₹1,190/mo): 250 runs/mo, 100 curated lists, unlimited active events.",
    ],
    actionLink: { label: "Review All Tiers", to: "/pricing" },
  },
  {
    id: "data-exports-and-reports",
    category: "exports",
    title: "1-Click Data Exports (CSV, Excel, JSON) & Written Intelligence Reports",
    keys: [
      "export", "download", "csv", "excel", "xlsx", "json", "report", "spreadsheet", "share"
    ],
    summary:
      "Every curated list can be instantly downloaded in multiple formats or compiled into a professional written research intelligence brief.",
    bullets: [
      "1-Click CSV: Download standard flat files compatible with HubSpot, Salesforce, or Google Sheets.",
      "Excel (.xlsx) & JSON: Structured downloads preserving contact channel confidence and evidence IDs.",
      "Written Intelligence Reports: Automatically synthesizes executive summaries citing every live source.",
    ],
  },
  {
    id: "search-pipeline-speed",
    category: "general",
    title: "Search Pipeline Speed, Streaming & Execution",
    keys: [
      "how long", "slow", "speed", "stuck", "streaming", "cancel", "progress bar", "execution", "tavily"
    ],
    summary:
      "Live searches take between 10 to 90 seconds depending on query breadth. Sponsor and lead lookups take the longest because Dig actively validates company portals and contact points.",
    bullets: [
      "Real-Time Progress: The progress bar streams live updates via Server-Sent Events (SSE).",
      "Safe Cancelation: You can cancel a running search at any point without corrupting existing records.",
      "Resilient Fallbacks: If web connectivity drops, 1-click 'Run again' resumes where it left off.",
    ],
  },
  {
    id: "workspace-and-account-management",
    category: "general",
    title: "Workspaces, Multi-Event Management & Organization",
    keys: [
      "account", "workspace", "profile", "logout", "password", "sign out", "rename", "archive", "favourite"
    ],
    summary:
      "Everything you research is organized under your active workspace. You can favorite priority events, archive completed projects, and rename folders.",
    bullets: [
      "Event Organization: Each event has 5 distinct folders matching the intelligence archetypes.",
      "Archiving: Archiving an event keeps all historical records safely preserved while freeing up your active event slot.",
      "Profile & Security: Manage your credentials and review subscription status from the Profile tab.",
    ],
    actionLink: { label: "Go to Profile", to: "/profile" },
  },
];

// ---------------------------------------------------------------------------
// 2. Types & In-Memory RAG Interfaces
// ---------------------------------------------------------------------------
export interface IndexedRecord {
  id: string;
  name: string;
  category: FolderKey;
  eventTitle: string;
  jobName: string;
  fields: Record<string, string | number | boolean>;
  contact?: string | null;
  outreachStatus: "not_contacted" | "interested" | "declined";
  outreachNote?: string;
  sourceUrl?: string;
}

export interface ChatMessage {
  id: string;
  from: "you" | "diglett";
  text: string;
  richCards?: Array<{
    title: string;
    subtitle: string;
    badge?: string;
    badgeColor?: "blue" | "green" | "amber" | "purple";
    details?: string;
    link?: string;
  }>;
  actionLink?: { label: string; to: string };
  fallback?: boolean;
}

const FOLDER_INTENTS: Record<string, FolderKey> = {
  SPONSOR_LOOKUP: "sponsors",
  JUDGE_LOOKUP: "judges",
  JOB_LOOKUP: "jobs",
  LEAD_LOOKUP: "leads",
  COMPETITOR_LOOKUP: "competitors",
};

// ---------------------------------------------------------------------------
// 3. Backward-Compatible Keyword Answer Lookup
// ---------------------------------------------------------------------------
export function answerFor(question: string): string | null {
  const q = question.toLowerCase();
  for (const doc of KNOWLEDGE_BASE) {
    if (doc.keys.some((k) => q.includes(k))) {
      return `${doc.summary}\n\nKey Highlights:\n${doc.bullets.map((b) => `• ${b}`).join("\n")}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. Main AskDiglett Component
// ---------------------------------------------------------------------------
export function AskDiglett() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "workspace">("chat");
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [workspaceSearch, setWorkspaceSearch] = useState<string>("");

  const listRef = useRef<HTMLDivElement>(null);
  const { session } = useSession();
  const { events } = useEvents();

  // Query all active jobs in the workspace
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["diglett-jobs"],
    queryFn: async () => {
      try {
        return await api<{ jobs: JobSummary[] }>("/api/jobs");
      } catch {
        return { jobs: [] };
      }
    },
    enabled: !!session,
    staleTime: 20_000,
  });

  const jobs = useMemo(() => jobsData?.jobs ?? [], [jobsData]);

  // Index user records from active datasets
  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ["diglett-indexed-records", jobs.map((j) => j.id).join(",")],
    queryFn: async () => {
      const indexed: IndexedRecord[] = [];
      const activeJobs = jobs.slice(0, 8); // index up to 8 recent searches

      await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const [datasetRes, outreachRes] = await Promise.all([
              api<{ records: DatasetRecord[] }>(`/api/jobs/${job.id}/dataset`).catch(() => ({ records: [] })),
              api<{ outreach: Record<string, { status?: string; note?: string }> }>(`/api/jobs/${job.id}/outreach`).catch(() => ({
                outreach: {} as Record<string, { status?: string; note?: string }>,
              })),
            ]);

            const INTENT_TO_CATEGORY: Record<string, "sponsors" | "judges" | "jobs" | "leads" | "competitors"> = {
              SPONSOR_LOOKUP: "sponsors",
              JUDGE_LOOKUP: "judges",
              JOB_LOOKUP: "jobs",
              LEAD_LOOKUP: "leads",
              COMPETITOR_LOOKUP: "competitors",
            };
            const rawIntent = job.intent || job.blueprint?.intent || "";
            const category: "sponsors" | "judges" | "jobs" | "leads" | "competitors" = INTENT_TO_CATEGORY[rawIntent] ?? "leads";
            const outreachMap: Record<string, { status?: string; note?: string }> = outreachRes.outreach || {};

            for (const rec of datasetRes.records || []) {
              const name =
                rec.label ||
                String(rec.fields.company_name || rec.fields.person_name || rec.fields.role_title || "Unnamed Entity");

              const contact =
                typeof rec.fields.email === "string"
                  ? rec.fields.email
                  : typeof rec.fields.contact === "string"
                  ? rec.fields.contact
                  : null;

              const mark = outreachMap[rec.canonicalEntityId];
              const outreachStatus: "interested" | "declined" | "not_contacted" =
                mark?.status === "interested" ? "interested" :
                mark?.status === "declined" ? "declined" : "not_contacted";

              indexed.push({
                id: rec.id,
                name,
                category,
                eventTitle: job.name,
                jobName: job.name,
                fields: rec.fields,
                contact,
                outreachStatus,
                outreachNote: mark?.note,
                sourceUrl: rec.evidence?.[0]?.sourceUrl,
              });
            }
          } catch {
            // non-fatal
          }
        })
      );
      return indexed;
    },
    enabled: jobs.length > 0,
    staleTime: 45_000,
  });

  const indexedRecords = useMemo(() => recordsData ?? [], [recordsData]);

  // Aggregate quick statistics
  const stats = useMemo(() => {
    const totalEvents = events.filter((e) => !e.archived).length;
    const totalJobs = jobs.length;
    const totalRecords = indexedRecords.length;
    const interestedCount = indexedRecords.filter((r) => r.outreachStatus === "interested").length;
    const sponsorsCount = indexedRecords.filter((r) => r.category === "sponsors").length;
    const leadsCount = indexedRecords.filter((r) => r.category === "leads").length;
    const judgesCount = indexedRecords.filter((r) => r.category === "judges").length;

    return {
      totalEvents,
      totalJobs,
      totalRecords,
      interestedCount,
      sponsorsCount,
      leadsCount,
      judgesCount,
    };
  }, [events, jobs, indexedRecords]);

  // Dynamic greeting reflecting logged-in user and workspace
  const initialGreeting = useMemo<ChatMessage>(() => {
    if (session?.user) {
      return {
        id: "greet-1",
        from: "diglett",
        text: `Hi ${session.user.name.split(" ")[0]}! I've loaded your workspace context for **${session.workspace.name}** (${stats.totalEvents} active events, ${stats.totalRecords} sourced records). Ask me anything about your sponsors, leads, or how Dig's veracity engine works!`,
      };
    }
    return {
      id: "greet-guest",
      from: "diglett",
      text: "Hi! I’m Diglett, your research intelligence guide. Ask me about finding sponsors, verified leads, UTR payments, or how Dig’s 100% evidence engine works.",
    };
  }, [session, stats.totalEvents, stats.totalRecords]);

  const [messages, setMessages] = useState<ChatMessage[]>([initialGreeting]);

  // Update greeting when session loads
  useEffect(() => {
    setMessages([initialGreeting]);
  }, [initialGreeting]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-scroll chat list
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // -------------------------------------------------------------------------
  // 5. Intelligent Hybrid RAG Query Resolver
  // -------------------------------------------------------------------------
  const resolveQuery = (query: string): ChatMessage => {
    const q = query.toLowerCase().trim();

    // -----------------------------------------------------------------------
    // Stage A: Live Workspace Context Retrieval
    // -----------------------------------------------------------------------

    // A1: Sponsors in user workspace
    if (q.includes("sponsor") || q.includes("who sponsors") || q.includes("my sponsor")) {
      const sponsors = indexedRecords.filter((r) => r.category === "sponsors");
      if (sponsors.length > 0) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `Found **${sponsors.length} verified sponsor(s)** in your workspace datasets:`,
          richCards: sponsors.slice(0, 5).map((s) => ({
            title: s.name,
            subtitle: `Event / List: ${s.eventTitle}`,
            badge: s.outreachStatus === "interested" ? "Interested" : "Sponsor Record",
            badgeColor: s.outreachStatus === "interested" ? "green" : "blue",
            details: s.contact ? `Contact: ${s.contact}` : "Direct web evidence verified",
            link: s.sourceUrl,
          })),
          actionLink: { label: "Browse Workspace Sponsors", to: "/dashboard" },
        };
      }
    }

    // A1.5: Judges, Mentors & Speakers in user workspace
    if (q.includes("judge") || q.includes("mentor") || q.includes("speaker") || q.includes("keynote") || q.includes("who is speaking")) {
      const people = indexedRecords.filter((r) => r.category === "judges");
      if (people.length > 0) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `Found **${people.length} verified judge(s), mentor(s) & speaker(s)** in your workspace:`,
          richCards: people.slice(0, 5).map((p) => ({
            title: p.name,
            subtitle: `Affiliation / Event: ${p.fields.affiliation || p.eventTitle}`,
            badge: p.outreachStatus === "interested" ? "Interested" : "Expert / Speaker",
            badgeColor: p.outreachStatus === "interested" ? "green" : "blue",
            details: p.contact ? `Contact: ${p.contact}` : (p.fields.expertise ? `Expertise: ${p.fields.expertise}` : "Profile verified"),
            link: p.sourceUrl,
          })),
          actionLink: { label: "Browse Judges & Speakers", to: "/dashboard" },
        };
      }
    }

    // A2: Leads in user workspace
    if (q.includes("lead") || q.includes("prospect") || q.includes("who to pitch")) {
      const leads = indexedRecords.filter((r) => r.category === "leads");
      if (leads.length > 0) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `Retrieved **${leads.length} high-intent lead(s)** from your active pipeline:`,
          richCards: leads.slice(0, 5).map((l) => ({
            title: l.name,
            subtitle: `List: ${l.jobName}`,
            badge: l.outreachStatus === "interested" ? "Interested" : "Verified Lead",
            badgeColor: l.outreachStatus === "interested" ? "green" : "purple",
            details: l.contact ? `Verified Channel: ${l.contact}` : "Company evidence verified",
            link: l.sourceUrl,
          })),
          actionLink: { label: "View Leads", to: "/dashboard" },
        };
      }
    }

    // A2.5: Jobs & Roles in user workspace
    if (q.includes("job") || q.includes("role") || q.includes("internship") || q.includes("hiring")) {
      const jobsList = indexedRecords.filter((r) => r.category === "jobs");
      if (jobsList.length > 0) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `Found **${jobsList.length} verified role(s) & opening(s)** in your workspace:`,
          richCards: jobsList.slice(0, 5).map((j) => ({
            title: j.name,
            subtitle: `Company: ${j.fields.company_name || j.jobName}`,
            badge: "Open Role",
            badgeColor: "blue",
            details: j.fields.location ? `Location: ${j.fields.location}` : "Listing verified",
            link: j.sourceUrl,
          })),
          actionLink: { label: "View Jobs", to: "/dashboard" },
        };
      }
    }

    // A2.6: Competitors in user workspace
    if (q.includes("competitor") || q.includes("alternative")) {
      const compList = indexedRecords.filter((r) => r.category === "competitors");
      if (compList.length > 0) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `Found **${compList.length} competitor(s) & alternative(s)** in your workspace:`,
          richCards: compList.slice(0, 5).map((c) => ({
            title: c.name,
            subtitle: `Category: ${c.fields.category || "Alternative"}`,
            badge: "Competitor",
            badgeColor: "purple",
            details: c.fields.pricing_signal ? `Pricing: ${c.fields.pricing_signal}` : "Verified",
            link: c.sourceUrl,
          })),
          actionLink: { label: "View Competitors", to: "/dashboard" },
        };
      }
    }

    // A3: Interested outreach status
    if (q.includes("interested") || q.includes("who called") || q.includes("marked") || q.includes("pipeline")) {
      const interested = indexedRecords.filter((r) => r.outreachStatus === "interested");
      if (interested.length > 0) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `You have **${interested.length} record(s)** marked as **Interested** in your CRM outreach:`,
          richCards: interested.slice(0, 5).map((item) => ({
            title: item.name,
            subtitle: `${item.category.toUpperCase()} · List: ${item.jobName}`,
            badge: "Interested",
            badgeColor: "green",
            details: item.outreachNote ? `Note: "${item.outreachNote}"` : (item.contact ?? "Ready for outreach"),
            link: item.sourceUrl,
          })),
        };
      }
    }

    // A4: Workspace summary / overview
    if (
      q.includes("summary") ||
      q.includes("overview") ||
      q.includes("my workspace") ||
      q.includes("how many") ||
      q.includes("stats") ||
      q.includes("data do i have")
    ) {
      if (session) {
        return {
          id: `rag-${Date.now()}`,
          from: "diglett",
          text: `Here is the live intelligence brief for **${session.workspace.name}**:\n\n` +
            `• **Active Events:** ${stats.totalEvents} hackathon / research briefs\n` +
            `• **Curated Datasets:** ${stats.totalJobs} collection jobs\n` +
            `• **Total Verified Records:** ${stats.totalRecords} indexed entities\n` +
            `• **Breakdown:** ${stats.sponsorsCount} Sponsors · ${stats.leadsCount} Leads · ${stats.judgesCount} Judges & Mentors\n` +
            `• **CRM Status:** ${stats.interestedCount} marked as Interested\n\n` +
            `You can browse all these records directly using the **Workspace Index** tab above!`,
          actionLink: { label: "Go to Dashboard", to: "/dashboard" },
        };
      }
    }

    // A5: Specific entity match across workspace records
    const matchedEntity = indexedRecords.find((r) => q.includes(r.name.toLowerCase()));
    if (matchedEntity) {
      return {
        id: `rag-${Date.now()}`,
        from: "diglett",
        text: `Found verified record for **${matchedEntity.name}** in folder **${matchedEntity.category}**:`,
        richCards: [
          {
            title: matchedEntity.name,
            subtitle: `Dataset: ${matchedEntity.jobName}`,
            badge: matchedEntity.outreachStatus.toUpperCase(),
            badgeColor: matchedEntity.outreachStatus === "interested" ? "green" : "blue",
            details: matchedEntity.contact ? `Contact: ${matchedEntity.contact}` : "Evidence cited on live web",
            link: matchedEntity.sourceUrl,
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // Stage B: Platform Knowledge Retrieval
    // -----------------------------------------------------------------------
    let bestDoc: KnowledgeDoc | null = null;
    let highestScore = 0;

    for (const doc of KNOWLEDGE_BASE) {
      let score = 0;
      for (const key of doc.keys) {
        if (key.length <= 3) {
          if (` ${q} `.includes(` ${key} `)) score += 4;
        } else if (q.includes(key)) {
          score += key.split(" ").length * 3 + 2;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestDoc = doc;
      }
    }

    if (bestDoc && highestScore >= 3) {
      return {
        id: `rag-${Date.now()}`,
        from: "diglett",
        text: `### ${bestDoc.title}\n\n${bestDoc.summary}\n\n**Key Takeaways:**\n${bestDoc.bullets.map((b) => `• ${b}`).join("\n")}`,
        actionLink: bestDoc.actionLink,
      };
    }

    // -----------------------------------------------------------------------
    // Stage C: Intelligent Fallback with Workspace Awareness
    // -----------------------------------------------------------------------
    return {
      id: `rag-${Date.now()}`,
      from: "diglett",
      text: `I searched your workspace and the platform docs, but didn't find a direct match. You can browse your live records in the **Workspace Index** tab, or ask about:\n\n• *"Who are my sponsors?"*\n• *"Show interested leads"*\n• *"Why veracity over guessed emails?"*\n• *"How does UPI UTR payment work?"*`,
      fallback: true,
      actionLink: { label: "Open Dig Architecture Guide", to: GUIDE_URL },
    };
  };

  const handleAsk = (questionText: string) => {
    const text = questionText.trim();
    if (!text) return;

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, from: "you", text };
    const botResponse = resolveQuery(text);

    setMessages((curr) => [...curr, userMsg, botResponse]);
    setDraft("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleAsk(draft);
  };

  // Filtered records for the Workspace Explorer tab
  const filteredWorkspaceRecords = useMemo(() => {
    return indexedRecords.filter((rec) => {
      if (workspaceFilter !== "all" && rec.category !== workspaceFilter) return false;
      if (workspaceSearch.trim()) {
        const query = workspaceSearch.toLowerCase();
        return (
          rec.name.toLowerCase().includes(query) ||
          rec.eventTitle.toLowerCase().includes(query) ||
          (rec.contact && rec.contact.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [indexedRecords, workspaceFilter, workspaceSearch]);

  const SUGGESTED_PROMPTS = useMemo(() => {
    if (stats.sponsorsCount > 0) {
      return ["Show my verified sponsors", "List interested leads", "How does UTR payment work?", "Why veracity over guessed emails?"];
    }
    return ["What is Dig?", "Why veracity over guessed emails?", "How does UTR payment work?", "How do I run a search?"];
  }, [stats.sponsorsCount]);

  return (
    <>
      {open && (
        <div
          className={`diglett-panel chat ${expanded ? "expanded" : ""}`}
          role="dialog"
          aria-label="Ask Diglett Intelligence Assistant"
          onClick={(e) => e.stopPropagation()}
        >
          {/* macOS Styled Window Titlebar */}
          <div className="diglett-macos-titlebar">
            <div className="diglett-traffic-lights">
              <button
                type="button"
                className="diglett-dot red"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close"
              />
              <button
                type="button"
                className="diglett-dot yellow"
                onClick={() => setOpen(false)}
                title="Minimize"
                aria-label="Minimize"
              />
              <button
                type="button"
                className="diglett-dot green"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Standard size" : "Expand window"}
                aria-label="Expand"
              />
            </div>

            <div className="diglett-title-center">
              <img src="/art/mole-avatar.png" alt="Diglett" className="diglett-header-avatar" />
              <span className="diglett-title-text">Diglett</span>
            </div>

            <div className="diglett-header-right">
              <span
                className={`diglett-sync-pill ${session ? "online" : "offline"}`}
                title={session ? `Synced with ${session.workspace.name}` : "Guest Mode"}
              >
                <span className="sync-pulse" />
                <span className="sync-text">{session ? "Synced" : "Guest"}</span>
              </span>
              <button
                type="button"
                className="diglett-size-btn"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Compact view (380px)" : "Expand view (560px)"}
                aria-label={expanded ? "Compact view" : "Expand view"}
              >
                {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="diglett-mode-tabs">
            <button
              type="button"
              className={`diglett-mode-tab ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              <Bot size={13} />
              <span>Assistant</span>
            </button>
            <button
              type="button"
              className={`diglett-mode-tab ${activeTab === "workspace" ? "active" : ""}`}
              onClick={() => setActiveTab("workspace")}
            >
              <Database size={13} />
              <span>Workspace</span>
              <span className="diglett-count-badge">{stats.totalRecords}</span>
            </button>
          </div>

          {/* Tab 1: Conversational RAG Chat */}
          {activeTab === "chat" && (
            <>
              <div className="chat-list" ref={listRef} aria-live="polite">
                {messages.map((message) => (
                  <div key={message.id} className={`bubble ${message.from === "you" ? "you" : "bot"}`}>
                    <div className="bubble-markdown-content">
                      {message.text.split("\n\n").map((para, idx) => (
                        <p key={idx} style={{ margin: "4px 0" }}>
                          {para}
                        </p>
                      ))}
                    </div>

                    {/* Rich Entity / Provenance Cards */}
                    {message.richCards && message.richCards.length > 0 && (
                      <div className="diglett-rich-cards-container">
                        {message.richCards.map((card, cIdx) => (
                          <div key={cIdx} className="diglett-rich-card">
                            <div className="rich-card-top">
                              <span className="rich-card-title">{card.title}</span>
                              {card.badge && (
                                <span className={`rich-card-badge ${card.badgeColor ?? "blue"}`}>
                                  {card.badge}
                                </span>
                              )}
                            </div>
                            <span className="rich-card-sub">{card.subtitle}</span>
                            {card.details && <span className="rich-card-detail">{card.details}</span>}
                            {card.link && (
                              <a
                                href={card.link}
                                target="_blank"
                                rel="noreferrer"
                                className="rich-card-link"
                              >
                                <span>Verified Source URL</span>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Links */}
                    {message.actionLink && (
                      <div className="diglett-action-link-row">
                        <Link to={message.actionLink.to} className="diglett-action-pill">
                          <span>{message.actionLink.label}</span>
                          <ChevronRight size={12} />
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Contextual Suggested Questions */}
              <div className="chat-suggest">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => handleAsk(prompt)}>
                    <Sparkles size={10} className="sparkle-icon" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <form className="chat-input" onSubmit={handleSubmit}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    session
                      ? `Ask about ${session.workspace.name} or Dig features…`
                      : "Ask Diglett about search, veracity, UTR payments…"
                  }
                  autoFocus
                  maxLength={300}
                />
                <button type="submit" disabled={!draft.trim()} aria-label="Send query">
                  <Send size={14} />
                </button>
              </form>
            </>
          )}

          {/* Tab 2: Live Workspace Explorer */}
          {activeTab === "workspace" && (
            <div className="diglett-workspace-explorer">
              {/* Stat Counters Banner */}
              <div className="explorer-stats-grid">
                <div className="explorer-stat-box">
                  <Layers size={13} color="#4c6fff" />
                  <span className="stat-val">{stats.totalEvents}</span>
                  <span className="stat-lbl">Events</span>
                </div>
                <div className="explorer-stat-box">
                  <Folder size={13} color="#10b981" />
                  <span className="stat-val">{stats.totalJobs}</span>
                  <span className="stat-lbl">Datasets</span>
                </div>
                <div className="explorer-stat-box">
                  <ShieldCheck size={13} color="#00baf2" />
                  <span className="stat-val">{stats.totalRecords}</span>
                  <span className="stat-lbl">Records</span>
                </div>
                <div className="explorer-stat-box">
                  <Target size={13} color="#f59e0b" />
                  <span className="stat-val">{stats.interestedCount}</span>
                  <span className="stat-lbl">Interested</span>
                </div>
              </div>

              {/* Live Record Search & Filter Bar */}
              <div className="explorer-controls">
                <div className="explorer-search-wrap">
                  <Search size={12} className="search-icon" />
                  <input
                    type="text"
                    value={workspaceSearch}
                    onChange={(e) => setWorkspaceSearch(e.target.value)}
                    placeholder="Search records in workspace…"
                    className="explorer-search-input"
                  />
                  {workspaceSearch && (
                    <button type="button" onClick={() => setWorkspaceSearch("")} className="clear-btn">
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="explorer-filter-pills">
                  {["all", "sponsors", "leads", "judges", "jobs", "competitors"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`filter-pill ${workspaceFilter === cat ? "active" : ""}`}
                      onClick={() => setWorkspaceFilter(cat)}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Records List */}
              <div className="explorer-records-list">
                {recordsLoading ? (
                  <div className="explorer-loading-view">
                    <RefreshCw size={18} className="spin" color="#4c6fff" />
                    <span>Indexing workspace datasets…</span>
                  </div>
                ) : filteredWorkspaceRecords.length === 0 ? (
                  <div className="explorer-empty-view">
                    <Folder size={24} color="var(--text-3)" />
                    <p>No records match your filter.</p>
                    {indexedRecords.length === 0 && (
                      <span className="empty-sub">Run a search in an event to populate your workspace.</span>
                    )}
                  </div>
                ) : (
                  filteredWorkspaceRecords.map((rec) => (
                    <div key={rec.id} className="explorer-record-row">
                      <div className="record-main-col">
                        <div className="record-row-head">
                          <span className="record-entity-name">{rec.name}</span>
                          <span className={`record-outreach-pill ${rec.outreachStatus}`}>
                            {rec.outreachStatus.replace("_", " ")}
                          </span>
                        </div>
                        <div className="record-meta-line">
                          <span className="record-cat-tag">{rec.category}</span>
                          <span className="record-event-title">· {rec.eventTitle}</span>
                        </div>
                        {rec.contact && <div className="record-contact-line">📧 {rec.contact}</div>}
                        {rec.outreachNote && (
                          <div className="record-note-line">💬 Note: {rec.outreachNote}</div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="record-inquire-btn"
                        onClick={() => {
                          setActiveTab("chat");
                          handleAsk(`Tell me about ${rec.name} from my ${rec.category} list`);
                        }}
                        title="Ask Diglett about this entity"
                      >
                        Ask Diglett ↗
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Diglett Launcher Button */}
      <button
        className="diglett"
        aria-label="Open Diglett Intelligence Assistant"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <img src="/art/mole-avatar.png" alt="Diglett Avatar" />
        <span className="dot" />
        {!open && <span className="diglett-tip">Ask Diglett</span>}
      </button>
    </>
  );
}
