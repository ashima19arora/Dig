import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Hourglass,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Mail,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Phone,
  Play,
  Quote,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { OUTREACH_STATUSES, type OutreachStatus } from "@dig/schemas";
import {
  ACTIVE_STATES,
  api,
  download,
  SUPPORTED_INTENTS,
  type Conflict,
  type Dataset,
  type DatasetRecord,
  type Diff,
  type Evidence,
  type JobDetail,
  type JobProgress,
} from "../api";
import { AppWindow, type Crumb } from "../components/Shell";
import { notify, notifyError } from "../toast";
import { downloadDatasetPdf } from "./dataset-pdf-report";

type Pair = [string, string];

/** What each kind of search shows: table columns (the first is the record's name) and detail cards. */
const VIEWS: Record<string, { noun: string; columns: Pair[]; cards: Pair[] }> = {
  SPONSOR_LOOKUP: {
    noun: "sponsors",
    columns: [["company_name", "Company"], ["event_name", "Event"], ["sponsorship_type", "Type"], ["contact", "Contact"], ["email", "Email"], ["linkedin", "LinkedIn"]],
    cards: [["company_name", "Company name"], ["event_name", "Event"], ["sponsorship_type", "Sponsorship type"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
  JUDGE_LOOKUP: {
    noun: "people",
    columns: [["person_name", "Name"], ["affiliation", "Affiliation"], ["expertise", "Expertise"], ["event_name", "Event"], ["email", "Email"], ["linkedin", "LinkedIn"], ["github", "GitHub"]],
    cards: [["person_name", "Name"], ["affiliation", "Affiliation"], ["expertise", "Expertise"], ["event_name", "Event (judged, mentored or spoke at)"], ["email", "Email"], ["profile_url", "Profile"], ["last_verified", "Last verified"]],
  },
  JOB_LOOKUP: {
    noun: "roles",
    columns: [["role_title", "Role"], ["company_name", "Company"], ["location", "Location"], ["workplace", "Workplace"]],
    cards: [["role_title", "Role"], ["company_name", "Company"], ["location", "Location"], ["workplace", "Workplace"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
  LEAD_LOOKUP: {
    noun: "leads",
    columns: [["company_name", "Company"], ["category", "What they do"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"], ["linkedin", "LinkedIn"]],
    cards: [["company_name", "Company"], ["category", "What they do"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
  COMPETITOR_LOOKUP: {
    noun: "competitors",
    columns: [["company_name", "Competitor"], ["category", "Category"], ["pricing_signal", "Pricing"], ["website", "Website"]],
    cards: [["company_name", "Competitor"], ["category", "Category"], ["pricing_signal", "Pricing signal"], ["website", "Website"], ["last_verified", "Last verified"]],
  },
};
const LINK_FIELDS = new Set(["website", "profile_url"]);
/** Search types where a first-contact email makes sense. Matches the server's pitchSupported. */
const PITCH_INTENTS = new Set(["SPONSOR_LOOKUP", "JUDGE_LOOKUP", "LEAD_LOOKUP"]);

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  COLLECTING: "Searching the web and extracting sponsors",
  ENRICHING: "Finding contact paths",
  IDENTITY_RESOLUTION: "Matching identities",
  TRUST_EVALUATION: "Scoring trust",
  NORMALIZING: "Normalizing",
  DEDUPLICATING: "Removing duplicates",
  VALIDATING: "Validating",
  RANKING: "Ranking",
  ANNOTATING: "Writing notes",
};

type Tab = "all" | "review" | "contacted" | "interested" | "waiting" | "declined" | "uncontacted";
/** Keyed by canonicalEntityId: record ids change every version, the entity key does not. */
type Panel = { kind: "record"; key: string } | { kind: "diff" } | null;

/**
 * Every published value is copied from its source page, so a row is "Verified" unless it is a
 * possible duplicate or missing a required field. How strongly it is sourced is the confidence %.
 */
function recordStatusWord(record: DatasetRecord): string {
  if (record.status === "possible_duplicate") return "Possible duplicate";
  // Older runs saved a bare domain ("iitmandi.ac.in") as the email, which failed validation. That is not a missing detail.
  const domainAsEmail = Boolean(record.fields.email) && !getEmail(record);
  if (record.status === "incomplete" && !domainAsEmail) return "Incomplete";
  return "Verified";
}

function getEmail(record: DatasetRecord): string | null {
  const val = record.fields.email || record.contactability?.channels?.email?.value;
  if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) return val.trim();
  return null;
}

/** LinkedIn people search for a row: the person and their organization, or the company. */
function linkedinSearchUrl(record: DatasetRecord): string {
  const person = record.fields.person_name || record.fields.contact || "";
  const org = (record.fields.company_name || record.fields.affiliation || "").split(/[|,]/)[0]?.trim() ?? "";
  const keywords = person ? `${person} ${org}` : org || record.label || "";
  return `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(keywords.trim())}`;
}

/** "https://www.linkedin.com/in/alex-k" → "in/alex-k", "https://github.com/alexk" → "@alexk". */
function shortProfile(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/+$/, "");
  return /github\.com/i.test(url) ? `@${path}` : path;
}

function ProfileCell({ record, channel }: { record: DatasetRecord; channel: "linkedin" | "github" }) {
  const accepted = record.fields[channel];
  const item = record.contactability?.channels?.[channel];
  const possible = !accepted && item?.status === "NEEDS_REVIEW" && item.value ? item.value : null;
  const url = accepted || possible;
  if (url && /^https?:\/\//i.test(url)) {
    return (
      <td>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="email-link"
          onClick={(e) => e.stopPropagation()}
          title={possible ? `Possible match, check before using: ${url}` : url}
          style={possible ? { opacity: 0.7 } : undefined}
        >
          <span>{shortProfile(url)}</span>
          <ExternalLink size={10} style={{ flexShrink: 0 }} />
        </a>
        {possible && <span style={{ color: "var(--text-3)", fontSize: 11, marginLeft: 4 }}>check</span>}
      </td>
    );
  }
  if (channel === "github") {
    return (
      <td>
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>
      </td>
    );
  }
  return (
    <td>
      <a
        href={linkedinSearchUrl(record)}
        target="_blank"
        rel="noreferrer"
        className="linkedin-finder-link"
        onClick={(e) => e.stopPropagation()}
        title="No profile found. Search LinkedIn for this name"
      >
        <span>Search LinkedIn</span>
        <ExternalLink size={10} />
      </a>
    </td>
  );
}

function getWebsite(record: DatasetRecord): string | null {
  const val = record.fields.website || record.contactability?.channels?.website?.value;
  if (val && /^https?:\/\//i.test(val.trim())) return val.trim();
  if (val && /\.[a-z]{2,}/i.test(val.trim())) return `https://${val.trim()}`;
  return null;
}

function getDomain(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "zoho.com",
]);

function getCompanyDomain(record: DatasetRecord): string | null {
  // 1. Explicit website field
  const website = record.fields.website || record.contactability?.channels?.website?.value;
  if (website) {
    const clean = website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].trim().toLowerCase();
    if (clean && clean.includes(".")) return clean;
  }

  // 2. Work email domain
  const email = record.fields.email || record.contactability?.channels?.email?.value;
  if (email && email.includes("@")) {
    const domain = email.split("@")[1]?.trim().toLowerCase();
    if (domain && domain.includes(".") && !GENERIC_EMAIL_DOMAINS.has(domain)) {
      return domain;
    }
  }

  // 3. Evidence sources
  if (record.evidence && record.evidence.length > 0) {
    const rawName = (record.fields.company_name || record.fields.person_name || record.label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const ev of record.evidence) {
      if (ev.sourceUrl) {
        const evDomain = ev.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].trim().toLowerCase();
        if (
          rawName.length >= 3 &&
          evDomain.replace(/[^a-z0-9]/g, "").includes(rawName) &&
          !evDomain.includes("wikipedia") &&
          !evDomain.includes("linkedin") &&
          !evDomain.includes("twitter") &&
          !evDomain.includes("x.com") &&
          !evDomain.includes("medium.com") &&
          !evDomain.includes("github.com")
        ) {
          return evDomain;
        }
      }
    }
  }

  // 4. Derive from company / entity name
  const name = record.fields.company_name || record.fields.affiliation || record.label || "";
  const cleaned = name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|technologies|tech|ai|group|labs|software|co)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  if (cleaned.length >= 2 && cleaned.length <= 25) {
    return `${cleaned}.com`;
  }

  return null;
}

export function CompanyLogo({
  record,
  name,
  className = "company-avatar",
}: {
  record: DatasetRecord;
  name: string;
  className?: string;
}) {
  const domain = useMemo(() => getCompanyDomain(record), [record]);
  const [providerIndex, setProviderIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setProviderIndex(0);
    setFailed(false);
  }, [domain, record.id]);

  const initial = (name[0] || "?").toUpperCase();

  if (!domain || failed) {
    return <div className={`${className} fallback`}>{initial}</div>;
  }

  // Multi-tier high-res favicon providers (Google 64px, DuckDuckGo)
  const providers = [
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];

  const currentSrc = providers[providerIndex];

  return (
    <div className={className} title={name}>
      <img
        src={currentSrc}
        alt={name}
        loading="lazy"
        onError={() => {
          if (providerIndex < providers.length - 1) {
            setProviderIndex((i) => i + 1);
          } else {
            setFailed(true);
          }
        }}
      />
    </div>
  );
}

function isActive(status: string | undefined) {
  return Boolean(status && ACTIVE_STATES.includes(status));
}

export function JobBoard({ jobId, crumbs }: { jobId: string; crumbs: Crumb[] }) {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [live, setLive] = useState<JobProgress | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [report, setReport] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [runStartedAt, setRunStartedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pitchModalRecord, setPitchModalRecord] = useState<DatasetRecord | null>(null);

  const entity = params.get("entity");
  useEffect(() => {
    if (entity) setPanel({ kind: "record", key: entity });
  }, [entity]);

  const jobQ = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api<JobDetail>(`/api/jobs/${jobId}`),
  });
  const running = isActive(live?.status) || isActive(jobQ.data?.job.status);
  const datasetQ = useQuery({ queryKey: ["dataset", jobId], queryFn: () => api<Dataset>(`/api/jobs/${jobId}/dataset`) });
  const conflictsQ = useQuery({
    queryKey: ["conflicts", jobId],
    queryFn: () => api<{ conflicts: Conflict[] }>(`/api/jobs/${jobId}/conflicts`),
  });
  const outreachQ = useQuery({
    queryKey: ["outreach", jobId],
    queryFn: () => api<{ outreach: Record<string, Outreach> }>(`/api/jobs/${jobId}/outreach`),
  });
  const outreach = outreachQ.data?.outreach ?? {};
  const setOutreach = async (entity: string, patch: Partial<Pick<Outreach, "status" | "note">>) => {
    const current = outreach[entity] ?? { status: "pending", note: "" };
    const next = { status: patch.status ?? current.status, note: patch.note ?? current.note };
    // Show the change immediately; roll back (and say why) if the save fails.
    client.setQueryData<{ outreach: Record<string, Outreach> }>(["outreach", jobId], (data) => ({
      outreach: { ...(data?.outreach ?? {}), [entity]: { ...current, ...next } },
    }));
    try {
      const saved = await api<{ outreach: Outreach }>(`/api/jobs/${jobId}/outreach/${encodeURIComponent(entity)}`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      client.setQueryData<{ outreach: Record<string, Outreach> }>(["outreach", jobId], (data) => ({
        outreach: { ...(data?.outreach ?? {}), [entity]: saved.outreach },
      }));
    } catch (error) {
      notifyError(error);
      void client.invalidateQueries({ queryKey: ["outreach", jobId] });
    }
  };
  const diffQ = useQuery({ queryKey: ["diff", jobId], queryFn: () => api<{ diff: Diff | null }>(`/api/jobs/${jobId}/diff`) });

  const refreshAll = () => {
    for (const key of ["job", "dataset", "conflicts", "diff"]) void client.invalidateQueries({ queryKey: [key, jobId] });
  };

  // Live progress over SSE while a run is in flight; poll as a fallback in case the stream drops.
  useEffect(() => {
    if (!running) return;
    const stream = new EventSource(`/api/jobs/${jobId}/stream`);
    stream.onmessage = (message) => {
      const payload = JSON.parse(message.data) as JobProgress;
      setLive(payload);
      if (!isActive(payload.status)) {
        stream.close();
        refreshAll();
      }
    };
    const poll = window.setInterval(() => void client.invalidateQueries({ queryKey: ["job", jobId] }), 4000);
    return () => {
      stream.close();
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, jobId]);

  // Re-render once a second while running so the collection estimate keeps moving.
  useEffect(() => {
    if (!running) return;
    setRunStartedAt((started) => (Date.now() - started > 5 * 60_000 ? Date.now() : started));
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // When the polled job settles without the stream noticing, pull the fresh dataset.
  useEffect(() => {
    if (jobQ.data && !isActive(jobQ.data.job.status) && isActive(live?.status)) {
      setLive(null);
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQ.data?.job.status]);

  const runAgain = useMutation({
    mutationFn: () => api(`/api/jobs/${jobId}/run`, { method: "POST" }),
    onMutate: () => {
      setRunStartedAt(Date.now());
      setLive({ status: "QUEUED", runId: null, runNumber: null, progress: emptyProgress("QUEUED"), error: null });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ["job", jobId] }),
    onError: (error) => {
      if (!/already running/i.test(String(error))) setLive(null);
    },
  });

  const generatePdfReport = async () => {
    if (!version || records.length === 0) {
      notify("No records to export in this dataset version.", "info");
      return;
    }
    setReport({ busy: true, error: null });
    try {
      await downloadDatasetPdf({
        jobName: job?.name ?? "Dataset Intelligence Report",
        query: job?.query ?? "",
        intent: job?.blueprint.intent ?? "SPONSOR_LOOKUP",
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        qualityScore: version.qualityScore,
        avgConfidence: version.avgConfidence,
        records,
        conflicts,
        outreach,
      });
      notify("PDF report downloaded", "info");
      setReport({ busy: false, error: null });
    } catch (error) {
      setReport({ busy: false, error: error instanceof Error ? error.message : "The PDF report couldn’t be generated." });
    }
  };

  const resolve = useMutation({
    mutationFn: (input: { id: string; decision: "NEW" | "OLD" }) =>
      api(`/api/conflicts/${input.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: input.decision }) }),
    onSuccess: refreshAll,
  });

  const records = datasetQ.data?.records ?? [];
  const version = datasetQ.data?.version ?? null;
  // Only conflicts raised by the run that produced the version on screen are live. Older ones point at
  // records of a superseded version, and resolving them would edit data nobody is looking at.
  const conflicts = (conflictsQ.data?.conflicts ?? []).filter((conflict) => !version || conflict.runId === version.runId);
  const pending = conflicts.filter((conflict) => conflict.status === "PENDING");
  const autoResolved = conflicts.filter((conflict) => conflict.status === "AUTO_RESOLVED");

  const conflictsFor = useMemo(() => {
    const map = new Map<string, Conflict[]>();
    for (const conflict of conflicts) {
      const record = records.find((item) => item.id === conflict.recordId || item.canonicalEntityId === conflict.canonicalEntityId);
      if (!record) continue;
      map.set(record.id, [...(map.get(record.id) ?? []), conflict]);
    }
    return map;
  }, [conflicts, records]);

  const job = jobQ.data?.job;
  const view = VIEWS[job?.blueprint.intent ?? "SPONSOR_LOOKUP"] ?? VIEWS.SPONSOR_LOOKUP!;
  const pitchable = PITCH_INTENTS.has(job?.blueprint.intent ?? "");

  /** Only a choice you must make: a re-run found a different value and Dig could not decide which is right. */
  const needsReview = (record: DatasetRecord) =>
    (conflictsFor.get(record.id) ?? []).some((conflict) => conflict.status === "PENDING");

  function statusText(record: DatasetRecord) {
    if (needsReview(record)) return "Needs review";
    return recordStatusWord(record);
  }

  const outreachOf = (record: DatasetRecord): OutreachStatus => outreach[record.canonicalEntityId]?.status ?? "pending";

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = records.filter((record) => {
      const mark = outreachOf(record);
      if (tab === "review" && !needsReview(record)) return false;
      if (tab === "contacted" && mark === "pending") return false;
      if (tab === "uncontacted" && mark !== "pending") return false;
      if ((tab === "interested" || tab === "waiting" || tab === "declined") && mark !== tab) return false;
      if (!needle) return true;
      return view.columns.some(([key]) =>
        (record.fields[key] ?? "").toLowerCase().includes(needle),
      );
    });
    if (sort) {
      const value = (record: DatasetRecord) => {
        if (sort.key === "status") return statusText(record);
        if (sort.key === "confidence") return String(record.confidence ?? 0);
        return record.fields[sort.key] ?? "";
      };
      list = [...list].sort((a, b) => {
        const left = value(a).toLowerCase();
        const right = value(b).toLowerCase();
        if (!left !== !right) return left ? -1 : 1; // blanks last either way
        return left.localeCompare(right) * sort.dir;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, tab, search, sort, conflictsFor, outreach, view]);

  const reviewCount = useMemo(() => records.filter(needsReview).length, [records, conflictsFor]);
  const outreachCounts = useMemo(() => {
    const counts: Record<OutreachStatus, number> = { pending: 0, waiting: 0, interested: 0, declined: 0 };
    for (const record of records) counts[outreach[record.canonicalEntityId]?.status ?? "pending"] += 1;
    return counts;
  }, [records, outreach]);
  const contactedCount = records.length - outreachCounts.pending;

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const batchSetOutreach = async (nextStatus: OutreachStatus) => {
    const selectedRecords = records.filter((r) => selectedIds.has(r.id));
    for (const rec of selectedRecords) {
      void setOutreach(rec.canonicalEntityId, { status: nextStatus });
    }
    notify(`Updated ${selectedRecords.length} records to "${OUTREACH[nextStatus].label}"`, "info");
  };

  const exportSelectedCsv = () => {
    const selectedRecords = records.filter((r) => selectedIds.has(r.id));
    if (selectedRecords.length === 0) return;
    const cols = view.columns;
    const header = ["Rank", ...cols.map(([, label]) => label), "Outreach", "Status", "Confidence", "Note"].join(",");
    const csvRows = selectedRecords.map((r) => {
      const mark = outreach[r.canonicalEntityId];
      const values = [
        String(r.rank ?? ""),
        ...cols.map(([key]) => JSON.stringify(r.fields[key] ?? "")),
        JSON.stringify(OUTREACH[mark?.status ?? "pending"]?.label ?? "Not contacted"),
        JSON.stringify(statusText(r)),
        `${Math.round((r.confidence ?? 0.8) * 100)}%`,
        JSON.stringify(mark?.note ?? ""),
      ];
      return values.join(",");
    });
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dig-selected-${selectedRecords.length}-records.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${selectedRecords.length} selected records`, "info");
  };

  const copyText = (text: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
  };

  const [lastSelectedEntity, setLastSelectedEntity] = useState<string | null>(null);
  const initialSelectionDoneRef = useRef(false);

  useEffect(() => {
    if (panel?.kind === "record") {
      setLastSelectedEntity(panel.key);
    }
  }, [panel]);

  // Open the first record (preferring one that needs a decision) once data arrives initially.
  useEffect(() => {
    if (initialSelectionDoneRef.current) return;
    if (records.length === 0 || !conflictsQ.isSuccess) return;
    if (entity) {
      setPanel({ kind: "record", key: entity });
      setLastSelectedEntity(entity);
      initialSelectionDoneRef.current = true;
      return;
    }
    const first = records.find((record) => (conflictsFor.get(record.id) ?? []).some((c) => c.status === "PENDING")) ?? records[0];
    if (first) {
      setPanel({ kind: "record", key: first.canonicalEntityId });
      setLastSelectedEntity(first.canonicalEntityId);
      initialSelectionDoneRef.current = true;
    }
  }, [records, conflictsFor, conflictsQ.isSuccess, entity]);

  useEffect(() => {
    if (!downloadOpen) return;
    const close = () => setDownloadOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [downloadOpen]);

  useEffect(() => {
    if (!panel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panel]);

  const selected = panel?.kind === "record" ? records.find((record) => record.canonicalEntityId === panel.key) : undefined;
  const progress = live ?? (running ? jobQ.data?.progress : null) ?? null;
  const failed = !running && (job?.status === "FAILED" || live?.status === "FAILED");
  const diff = diffQ.data?.diff ?? null;
  const exportHref = (format: string) => `/api/jobs/${jobId}/export?format=${format}`;

  if (jobQ.isError) {
    return (
      <AppWindow crumbs={crumbs} sidebar={false}>
        <div className="empty">
          <div>
            <h3>This search couldn’t be loaded</h3>
            <div className="err">{String(jobQ.error)}</div>
          </div>
        </div>
      </AppWindow>
    );
  }

  if (job && !SUPPORTED_INTENTS.includes(job.blueprint.intent)) {
    return (
      <AppWindow crumbs={crumbs} sidebar={false}>
        <div className="empty">
          <div className="unsupported">
            <h3>{job.name} isn’t supported yet</h3>
            <p>
              This search asks for {intentLabel(job.blueprint.intent)}. Dig researches <b>sponsors, judges &amp; mentors, jobs, leads and
              competitors</b> right now — so this one won’t run.
            </p>
            <p className="q">Query — “{job.query}”</p>
            <Link to="/dashboard" className="btn blue">
              Back to your events
            </Link>
          </div>
        </div>
      </AppWindow>
    );
  }

  return (
    <AppWindow
      crumbs={crumbs}
      sidebar={false}
      actions={
        version ? (
          <a className="btn" href={exportHref("csv")} download>
            <Upload size={14} /> Export
          </a>
        ) : undefined
      }
    >
      <div className="board">
        <div className="board-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {job ? <EditableTitle jobId={jobId} name={job.name} /> : <h1>Loading…</h1>}
            {job && <div className="q">Query — “{job.query}”</div>}
          </div>
          <div style={{ display: "flex", gap: 8, position: "relative", alignItems: "center" }}>
            <button
              className="btn"
              disabled={!version}
              onClick={(click) => {
                click.stopPropagation();
                setDownloadOpen((open) => !open);
              }}
            >
              <Download size={14} /> Download <ChevronDown size={13} />
            </button>
            {downloadOpen && (
              <div className="menu" style={{ top: 32, right: "auto", left: 0 }}>
                <a href={exportHref("csv")} download>
                  <button>CSV (.csv)</button>
                </a>
                <a href={exportHref("xlsx")} download>
                  <button>Excel (.xlsx)</button>
                </a>
                <a href={exportHref("json")} download>
                  <button>JSON (.json)</button>
                </a>
                <div className="menu-sep" />
                <button onClick={() => void generatePdfReport()} disabled={report.busy} title="Generate publication-grade executive PDF dossier">
                  <FileText size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 6 }} />
                  {report.busy ? "Generating PDF…" : "Executive Report (.pdf)"}
                </button>
              </div>
            )}
            {(report.busy || report.error) && (
              <div className={`report-note${report.error ? " err" : ""}`} role="status">
                {report.busy ? "Generating report…" : report.error}
              </div>
            )}
            <button className="btn" disabled={running || runAgain.isPending} onClick={() => runAgain.mutate()}>
              <RotateCw size={14} className={running ? "spin" : undefined} /> {running ? "Running…" : "Run again"}
            </button>
            <button
              className="btn"
              disabled={pending.length === 0}
              onClick={() => {
                setTab("review");
                const first = records.find((record) => (conflictsFor.get(record.id) ?? []).some((c) => c.status === "PENDING"));
                if (first) setPanel({ kind: "record", key: first.canonicalEntityId });
              }}
            >
              <Play size={12} fill="currentColor" /> Review conflicts
            </button>
          </div>
        </div>

        {version && (
          <div className="statsbar">
            <button className={`pill${pending.length ? "" : " ok"}`} onClick={() => setTab("review")} style={{ cursor: "pointer" }}>
              <span className="d" />
              {pending.length
                ? `${pending.length} record${pending.length === 1 ? " needs" : "s need"} your review`
                : "No conflicts need your review"}
              {autoResolved.length > 0 && ` · ${autoResolved.length} ${pending.length ? "more were" : ""} auto-resolved`}
            </button>
            <span className="sep" />
            <span>
              <b>{version.rowCount}</b> records from <b>{version.sourceCount}</b> sources
            </span>
            {version.qualityScore !== null && (
              <span>
                <b>{Math.round(version.qualityScore)}</b> quality score
              </span>
            )}
            {version.avgConfidence !== null && (
              <span>
                <b>{version.avgConfidence.toFixed(2)}</b> avg confidence
              </span>
            )}
            <span>
              <b>v{version.versionNumber}</b> · run {when(version.createdAt)}
            </span>
            <span className="diff">
              {diff && !diff.firstVersion ? (
                <>
                  <span style={{ color: "#248a3d" }}>+{diff.added.length} added</span>
                  <span>{diff.changed.length} changed</span>
                  <span>{diff.removed.length} dropped</span>
                </>
              ) : (
                <span>First version</span>
              )}
              <a onClick={() => setPanel({ kind: "diff" })}>Full diff ›</a>
            </span>
          </div>
        )}

        {runAgain.isError && !/already running/i.test(String(runAgain.error)) && (
          <div className="progress">
            <span className="err">Couldn’t start a new run: {runAgain.error.message}</span>
          </div>
        )}

        {(running || failed) && (
          <div className="progress">
            {failed ? (
              <span className="err">The last run failed: {live?.error ?? jobQ.data?.progress.error ?? "unknown error"}</span>
            ) : (
              <>
                <b>{stageOf(progress) === "COLLECTING" ? `Searching the web and extracting ${view.noun}` : STAGE_LABELS[stageOf(progress)] ?? "Working"}…</b>{" "}
                <span style={{ color: "var(--text-2)" }}>
                  {progress?.progress.records ? `${progress.progress.records} records so far · ` : ""}
                  live web research usually takes about a minute
                </span>
                <div className="bar">
                  <i style={{ width: `${percentOf(progress, runStartedAt)}%` }} />
                </div>
              </>
            )}
          </div>
        )}

        {!version ? (
          <div className="empty">
            <div>
              <h3>{running ? "Digging…" : datasetQ.isLoading ? "Loading…" : "No results yet"}</h3>
              {!running && !datasetQ.isLoading && (
                <>
                  <p>This search hasn’t produced a dataset yet.</p>
                  <button className="btn blue" onClick={() => runAgain.mutate()}>
                    <RotateCw size={14} /> Run now
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="board-body">
            <div className="table-pane">
              <div className="toolbar">
                <div className="seg">
                  {(
                    [
                      ["all", "All", records.length],
                      ["contacted", "Contacted", contactedCount],
                      ["interested", "Interested", outreachCounts.interested],
                      ["waiting", "Waiting", outreachCounts.waiting],
                      ["declined", "Declined", outreachCounts.declined],
                      ["uncontacted", "Not contacted", outreachCounts.pending],
                      ...(reviewCount > 0 ? [["review", "Needs review", reviewCount] as const] : []),
                    ] as const
                  ).map(([key, label, count]) => (
                    <button key={key} className={tab === key ? "on" : undefined} onClick={() => setTab(key as Tab)}>
                      {label}
                      <span className="n">{count}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label className="search">
                    <Search size={14} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${view.noun}…`} />
                  </label>
                  {!selected && (
                    <button
                      className="btn"
                      onClick={() => {
                        const target = lastSelectedEntity
                          ? records.find((r) => r.canonicalEntityId === lastSelectedEntity) ?? records[0]
                          : records[0];
                        if (target) setPanel({ kind: "record", key: target.canonicalEntityId });
                      }}
                      title="Open Evidence Sidebar"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 550,
                        padding: "5px 11px",
                        height: 32,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <PanelRightOpen size={13} />
                      <span>Evidence Sidebar</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-grid">
                  <thead>
                    <tr>
                      <th style={{ width: 34, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          aria-label="Select all rows"
                          checked={rows.length > 0 && selectedIds.size === rows.length}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length;
                          }}
                          onChange={toggleSelectAll}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      <th className="n">#</th>
                      {view.columns.map(([key, label]) => ({ key, label })).map((column, index) => (
                        <Fragment key={column.key}>
                        <th
                          style={{ cursor: "pointer" }}
                          onClick={() =>
                            setSort((current) =>
                              current?.key === column.key
                                ? current.dir === 1
                                  ? { key: column.key, dir: -1 }
                                  : null
                                : { key: column.key, dir: 1 },
                            )
                          }
                        >
                          {column.label}
                          {sort?.key === column.key ? (
                            <span className="f">{sort.dir === 1 ? "▲" : "▼"}</span>
                          ) : (
                            <Filter size={11} className="f" />
                          )}
                        </th>
                        {index === 0 && <th title="Who has been contacted — click a row’s mark to change it">Outreach</th>}
                        </Fragment>
                      ))}
                      <th>Note</th>
                      <th style={{ width: 68, textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((record) => {
                      const mark = outreach[record.canonicalEntityId];
                      const isRowSelected = selectedIds.has(record.id);
                      return (
                        <tr
                          key={record.id}
                          className={`${panel?.kind === "record" && panel.key === record.canonicalEntityId ? "sel" : ""}${isRowSelected ? " row-selected" : ""}`}
                          onClick={() => {
                            setPanel({ kind: "record", key: record.canonicalEntityId });
                            setLastSelectedEntity(record.canonicalEntityId);
                          }}
                        >
                          <td style={{ textAlign: "center" }} onClick={(e) => toggleSelectRow(record.id, e)}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${record.label || "row"}`}
                              checked={isRowSelected}
                              onChange={() => {}}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td className="n">{record.rank}</td>
                          {view.columns.map(([key], index) => {
                            if (index === 0) {
                              const primaryName = record.fields[key] || record.label || "—";
                              const website = getWebsite(record);
                              const domain = getDomain(website);
                              return (
                                <Fragment key={key}>
                                  <td className="co" title={primaryName}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <CompanyLogo record={record} name={primaryName} />
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {primaryName}
                                        </div>
                                        {website && (
                                          <a
                                            href={website}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="company-sub-link"
                                            onClick={(e) => e.stopPropagation()}
                                            title={website}
                                          >
                                            {domain} <ExternalLink size={10} style={{ marginLeft: 3 }} />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="oc">
                                    <OutreachButton
                                      status={mark?.status ?? "pending"}
                                      onChange={(next) => void setOutreach(record.canonicalEntityId, { status: next })}
                                    />
                                  </td>
                                </Fragment>
                              );
                            }
                            if (key === "linkedin" || key === "github") {
                              return <ProfileCell key={key} record={record} channel={key} />;
                            }
                            if (key === "email") {
                              const email = getEmail(record);
                              const isCopied = copiedId === `email-${record.id}`;
                              if (email) {
                                return (
                                  <td key={key}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <a
                                        href={`mailto:${email}`}
                                        className="email-link"
                                        onClick={(e) => e.stopPropagation()}
                                        title={`Email ${email}`}
                                      >
                                        <Mail size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                                        <span>{email}</span>
                                      </a>
                                      <button
                                        className="mini-copy-btn"
                                        title="Copy email address"
                                        onClick={(e) => copyText(email, `email-${record.id}`, e)}
                                      >
                                        {isCopied ? <Check size={11} color="#248a3d" /> : <Copy size={11} />}
                                      </button>
                                    </div>
                                  </td>
                                );
                              }
                              return (
                                <td key={key}>
                                  <span style={{ color: "var(--text-3)", fontSize: 12 }} title="No verified email on source page">
                                    —
                                  </span>
                                </td>
                              );
                            }
                            return <Cell key={key} value={record.fields[key]} />;
                          })}
                          <NoteCell note={mark?.note ?? ""} who={mark?.updatedBy ?? null} onSave={(note) => void setOutreach(record.canonicalEntityId, { note })} />
                          <td style={{ textAlign: "center" }}>
                            {pitchable && (
                              <button
                                className="btn"
                                style={{ padding: "3px 8px", fontSize: 11, height: 24, gap: 4 }}
                                title="Write a first-contact email"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPitchModalRecord(record);
                                }}
                              >
                                <Mail size={11} /> Pitch
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={view.columns.length + 5} style={{ textAlign: "center", color: "var(--text-3)", padding: 30 }}>
                          Nothing matches this view.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {panel?.kind === "diff" && <DiffPanel diff={diff} onClose={() => setPanel(null)} />}
            {selected && (
              <RecordPanel
                record={selected}
                view={view}
                conflicts={conflictsFor.get(selected.id) ?? []}
                versionNumber={version.versionNumber}
                outreachStatus={outreach[selected.canonicalEntityId]?.status ?? "pending"}
                onDraftPitch={pitchable ? () => setPitchModalRecord(selected) : undefined}
                resolving={resolve.isPending ? resolve.variables?.id : undefined}
                onResolve={(id, decision) => resolve.mutate({ id, decision })}
                resolveError={resolve.isError ? resolve.error.message : null}
                onClose={() => setPanel(null)}
                copiedId={copiedId}
                copyText={copyText}
              />
            )}
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="batch-actions-bar">
            <span className="batch-count">
              <b>{selectedIds.size}</b> selected
            </span>
            <button className="btn" onClick={() => void batchSetOutreach("interested")}>
              <Check size={13} style={{ color: "#248a3d" }} /> Mark Interested
            </button>
            <button className="btn" onClick={() => void batchSetOutreach("waiting")}>
              <Hourglass size={13} /> Mark Waiting
            </button>
            <button className="btn" onClick={() => void batchSetOutreach("pending")}>
              <Clock size={13} /> Mark Uncontacted
            </button>
            <button className="btn" onClick={exportSelectedCsv}>
              <Download size={13} /> Export Selected (.csv)
            </button>
            <button
              className="btn"
              style={{ padding: "4px 8px" }}
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {pitchModalRecord && (
          <PitchModal record={pitchModalRecord} jobId={jobId} onClose={() => setPitchModalRecord(null)} />
        )}

        <div className="board-foot">
          Dig · collected, ranked, and traced back to source{version ? ` · v${version.versionNumber} of this dataset` : ""}
        </div>
      </div>
    </AppWindow>
  );
}

/** The search's name; click to rename it inline. Enter or clicking away saves, Escape cancels. */
function EditableTitle({ jobId, name }: { jobId: string; name: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async (value: string | null) => {
    const next = value?.trim();
    if (!next || next === name) return setEditing(false);
    setSaving(true);
    try {
      const { job } = await api<{ job: JobDetail["job"] }>(`/api/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ name: next }) });
      client.setQueryData<JobDetail>(["job", jobId], (current) => (current ? { ...current, job: { ...current.job, name: job.name } } : current));
      void client.invalidateQueries({ queryKey: ["jobs"] });
      setEditing(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return (
      <input
        className="title-edit"
        aria-label="Rename this search"
        defaultValue={name}
        autoFocus
        disabled={saving}
        maxLength={180}
        onFocus={(focus) => focus.target.select()}
        onBlur={(blur) => void save(blur.target.value)}
        onKeyDown={(key) => {
          if (key.key === "Enter") void save(key.currentTarget.value);
          if (key.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <h1 className="title-view">
      <button onClick={() => setEditing(true)} title="Rename this search">
        {name}
        <Pencil size={14} className="title-pencil" />
      </button>
    </h1>
  );
}

function intentLabel(intent: string) {
  const words = intent.replace(/_LOOKUP$/, "").toLowerCase().replace(/_/g, " ");
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words} lookup`;
}


interface Outreach {
  status: OutreachStatus;
  note: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

const OUTREACH: Record<OutreachStatus, { label: string; hint: string }> = {
  pending: { label: "Not contacted", hint: "No outreach yet" },
  waiting: { label: "Waiting", hint: "They will get back to us" },
  interested: { label: "Interested", hint: "Said yes or wants to talk" },
  declined: { label: "Declined", hint: "Said no" },
};

function OutreachIcon({ status }: { status: OutreachStatus }) {
  if (status === "interested") return <Check size={13} strokeWidth={3} />;
  if (status === "declined") return <X size={13} strokeWidth={3} />;
  if (status === "waiting") return <Hourglass size={12} />;
  return <Clock size={12} />;
}

/** Click to open a small menu of the four outreach states. */
function OutreachButton({ status, onChange }: { status: OutreachStatus; onChange: (next: OutreachStatus) => void }) {
  const [open, setOpen] = useState(false);
  const meta = OUTREACH[status] ?? OUTREACH.pending;
  return (
    <div
      className="ob-wrap"
      onClick={(click) => click.stopPropagation()}
      onBlur={(blur) => {
        if (!blur.currentTarget.contains(blur.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        className={`ob ${status}`}
        title={`${meta.label}: click to change`}
        aria-label={`Outreach: ${meta.label}. Click to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <OutreachIcon status={status} />
      </button>
      {open && (
        <div className="ob-menu" role="menu">
          {OUTREACH_STATUSES.map((option) => (
            <button
              key={option}
              role="menuitemradio"
              aria-checked={option === status}
              className={option === status ? "on" : undefined}
              onClick={() => {
                setOpen(false);
                if (option !== status) onChange(option);
              }}
            >
              <span className={`ob ${option}`}><OutreachIcon status={option} /></span>
              <span>
                <b>{OUTREACH[option].label}</b>
                <small>{OUTREACH[option].hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A short shared note; click to edit. Enter or clicking away saves, Escape cancels. */
function NoteCell({ note, who, onSave }: { note: string; who: string | null; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    const finish = (value: string | null) => {
      setEditing(false);
      if (value !== null && value.trim() !== note) onSave(value.trim());
    };
    return (
      <td className="note editing" onClick={(click) => click.stopPropagation()}>
        <input
          autoFocus
          defaultValue={note}
          maxLength={280}
          placeholder="e.g. will get back to us next week"
          onBlur={(blur) => finish(blur.target.value)}
          onKeyDown={(key) => {
            if (key.key === "Enter") finish(key.currentTarget.value);
            if (key.key === "Escape") finish(null);
          }}
        />
      </td>
    );
  }
  return (
    <td
      className={`note${note ? "" : " empty"}`}
      title={note ? `${note}${who ? ` — ${who}` : ""}` : "Add a note"}
      onClick={(click) => {
        click.stopPropagation();
        setEditing(true);
      }}
    >
      {note || "Add note"}
    </td>
  );
}

function OutreachSummary({ records, outreach }: { records: DatasetRecord[]; outreach: Record<string, Outreach> }) {
  const count = (status: OutreachStatus) => records.filter((record) => (outreach[record.canonicalEntityId]?.status ?? "pending") === status).length;
  return (
    <span className="outreach-sum">
      Outreach: <b style={{ color: "#248a3d" }}>{count("interested")}</b> interested · <b style={{ color: "#c62828" }}>{count("declined")}</b> declined ·{" "}
      <b>{count("pending")}</b> not contacted
    </span>
  );
}

function Cell({ value, className }: { value?: string; className?: string }) {
  return value ? (
    <td className={className} title={value}>
      {value}
    </td>
  ) : (
    <td className="muted">—</td>
  );
}

function DossierControlBar({
  record,
  primary,
  outreachStatus,
  onDraftPitch,
  copiedId,
  copyText,
}: {
  record: DatasetRecord;
  primary?: string;
  outreachStatus: OutreachStatus;
  onDraftPitch?: () => void;
  copiedId: string | null;
  copyText: (text: string, id: string, e?: React.MouseEvent) => void;
}) {
  const [copied, setCopied] = useState(false);
  const name = record.fields[primary ?? ""] ?? record.label;
  const email = getEmail(record);
  const phone = record.fields.phone || record.contactability?.channels?.phone?.value;
  const website = getWebsite(record);
  const primaryChannel = email ? "Email" : phone ? "Phone" : website ? "Web" : "None";
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${record.fields.role || record.fields.type || "sponsor leadership"} contact email site:linkedin.com`)}`;

  const copyDossier = () => {
    const summary = [
      `${name} · Intelligence Dossier`,
      `Veracity: ${Math.round((record.confidence ?? 0.8) * 100)}%`,
      `Outreach Status: ${OUTREACH[outreachStatus]?.label ?? "Not contacted"}`,
      `Primary Channel: ${primaryChannel}`,
      email ? `Email: ${email}` : null,
      phone ? `Phone: ${phone}` : null,
      website ? `Website: ${website}` : null,
      record.fields.role ? `Role/Type: ${record.fields.role}` : null,
      `Evidence Sources: ${record.sourceCount ?? 1} verified citations`,
    ]
      .filter(Boolean)
      .join("\n");

    void navigator.clipboard.writeText(summary);
    setCopied(true);
    notify(`Copied intelligence dossier for ${name}`, "info");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dossier-control-bar">
      {/* Sleek Metadata & Channels Strip */}
      <div className="dossier-meta-strip">
        <span className={`dossier-status-pill ${outreachStatus}`} title="Outreach tracking status">
          {outreachStatus === "interested" ? (
            <Check size={11} strokeWidth={2.6} />
          ) : outreachStatus === "declined" ? (
            <X size={11} strokeWidth={2.6} />
          ) : (
            <Clock size={11} />
          )}
          <span>{OUTREACH[outreachStatus]?.label ?? "Not contacted"}</span>
        </span>

        <span className="dossier-meta-pill" title="Verified source citations">
          <FileText size={11} />
          <span>{record.sourceCount ?? 1} source{(record.sourceCount ?? 1) === 1 ? "" : "s"}</span>
        </span>

        <span className="dossier-meta-pill" title={`Primary reachability channel: ${primaryChannel}`}>
          <span className="dot-channel" />
          <span>{primaryChannel}</span>
        </span>
      </div>

      {/* Balanced 3-action toolbar */}
      <div className="dossier-actions-strip">
        {onDraftPitch && (
          <button className="dossier-btn-hero" onClick={onDraftPitch} title="Write a first-contact email">
            <Mail size={13} />
            <span>Draft Pitch</span>
          </button>
        )}

        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer"
          className="dossier-btn-sub"
          title="Search decision-makers and leads for this entity"
        >
          <Search size={11} />
          <span>Search Leads</span>
          <ExternalLink size={10} style={{ opacity: 0.6 }} />
        </a>

        <button
          className={`dossier-btn-sub ${copied ? "copied" : ""}`}
          onClick={copyDossier}
          title="Copy complete intelligence dossier"
        >
          {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
          <span>{copied ? "Copied" : "Copy Dossier"}</span>
        </button>
      </div>
    </div>
  );
}

function RecordPanel(props: {
  record: DatasetRecord;
  view: { columns: Pair[]; cards: Pair[] };
  conflicts: Conflict[];
  versionNumber: number;
  outreachStatus: OutreachStatus;
  onDraftPitch?: () => void;
  resolving?: string;
  onResolve: (id: string, decision: "NEW" | "OLD") => void;
  resolveError: string | null;
  onClose: () => void;
  copiedId: string | null;
  copyText: (text: string, id: string, e?: React.MouseEvent) => void;
}) {
  const { record } = props;
  const pending = props.conflicts.filter((conflict) => conflict.status === "PENDING");
  const settled = props.conflicts.filter((conflict) => conflict.status !== "PENDING");
  const [primary, ...rest] = props.view.columns.map(([key]) => key);
  const name = record.fields[primary ?? ""] ?? record.label;
  const subtitle = rest.map((key) => record.fields[key]).filter(Boolean).slice(0, 2).join(" · ");
  const statusWord = pending.length > 0 ? "Needs review" : recordStatusWord(record);
  const veracity = record.confidence ?? 0.8;

  return (
    <aside className="detail">
      <div className="detail-head">
        <div className="detail-head-top">
          <div className="sidebar-eyebrow">
            <ShieldCheck size={12} color="#10b981" />
            <span>Proof &amp; Evidence Dossier</span>
            <span className="eyebrow-sep">·</span>
            <span
              style={{ color: "var(--text)", textTransform: "none", letterSpacing: 0 }}
              title="Confidence: how strongly this row is sourced (source authority, number of sources, freshness)"
            >
              <b>{statusWord}</b> {Math.round(veracity * 100)}%
            </span>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={props.onClose}
            title="Collapse Evidence Sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelRightClose size={15} />
          </button>
        </div>

        <div className="detail-identity-row">
          <CompanyLogo record={record} name={name} className="dossier-avatar" />
          <div className="detail-identity-text">
            <h2>{name}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
        </div>
      </div>

      <div className="detail-body">
        <DossierControlBar
          record={record}
          primary={primary}
          outreachStatus={props.outreachStatus}
          onDraftPitch={props.onDraftPitch}
          copiedId={props.copiedId}
          copyText={props.copyText}
        />
        {pending.map((conflict) => (
          <div key={conflict.id} className="card conflict">
            <h4>
              <AlertTriangle size={16} color="#f0a030" /> Conflict on “{conflict.field}”
            </h4>
            <div className="when">detected on run · {day(conflict.detectedAt, true)}</div>
            <div className="vbox">
              <div className="k">
                <span>PREVIOUS</span>
                <span>{day(conflict.oldEvidence?.collectedAt)}</span>
              </div>
              <div className="v">{conflict.oldValue || "—"}</div>
            </div>
            <div className="vbox new">
              <div className="k">
                <span>NEW</span>
                <span>{day(conflict.newEvidence?.collectedAt ?? conflict.detectedAt)}</span>
              </div>
              <div className="v">{conflict.newValue || "—"}</div>
            </div>
            {conflict.reason && (
              <p className="why">
                <b>Decision:</b> {conflict.reason}
              </p>
            )}
            <div className="actions">
              <button className="btn blue" disabled={Boolean(props.resolving)} onClick={() => props.onResolve(conflict.id, "NEW")}>
                Keep new
              </button>
              <button className="btn" disabled={Boolean(props.resolving)} onClick={() => props.onResolve(conflict.id, "OLD")}>
                Keep previous
              </button>
            </div>
            {props.resolveError && <p className="err" style={{ margin: "10px 0 0" }}>Couldn’t save that decision: {props.resolveError}</p>}
          </div>
        ))}

        {settled.map((conflict) => (
          <div key={conflict.id} className="card" style={{ fontSize: 13, color: "#3a3a3c" }}>
            <div className="cap">
              {conflict.status === "AUTO_RESOLVED" ? "Auto-resolved by Jev" : "Resolved by you"} · {conflict.field}
            </div>
            Kept <b>{conflict.decision === "OLD" ? conflict.oldValue : conflict.newValue}</b>
            {conflict.decision !== "OLD" && conflict.oldValue ? <> over {conflict.oldValue}</> : null}.
            {conflict.reason && <div style={{ color: "var(--text-2)", marginTop: 6 }}>{conflict.reason}</div>}
          </div>
        ))}

        <ContactPaths record={record} copiedId={props.copiedId} copyText={props.copyText} />

        {/* Extracted Facts & Ground-Truth DOM Citations */}
        {(() => {
          const evidenceFields = props.view.cards.filter(([key]) => {
            const val = record.fields[key];
            if (!val || key === "last_verified") return false;
            const evidence = pickEvidence(record.evidence, key, val);
            const isChannel = key === "email" || key === "phone" || key === "website" || key === "contactPage" || key === "profile_url";
            // If it's already shown in header or ContactPaths and has no excerpt quote, omit to keep sidebar clean & non-redundant
            if ((key === primary || isChannel) && !evidence?.excerpt) {
              return false;
            }
            return true;
          });

          if (evidenceFields.length === 0) return null;

          return (
            <div className="evidence-section">
              <div className="section-eyebrow">
                <FileText size={11} />
                <span>Extracted Facts &amp; Citations</span>
              </div>
              <div className="evidence-cards-list">
                {evidenceFields.map(([key, label]) => {
                  const val = record.fields[key];
                  return (
                    <FieldCard
                      key={key}
                      field={key}
                      label={label}
                      value={val}
                      evidence={pickEvidence(record.evidence, key, val)}
                      versionNumber={props.versionNumber}
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Provenance Footnote */}
        <div className="evidence-lineage-foot">
          <Clock size={11} />
          <span>
            Captured on run · {day(record.fields.last_verified || new Date().toISOString(), true)}
            {props.versionNumber > 1 ? ` · Supersedes v${props.versionNumber - 1}` : ""}
          </span>
        </div>
      </div>
    </aside>
  );
}

interface PitchSender {
  name: string;
  role: string;
  organization: string;
  ask: string;
}

const SENDER_KEY = "dig-pitch-sender";

function loadSender(): PitchSender {
  const empty = { name: "", role: "", organization: "", ask: "" };
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(SENDER_KEY) ?? "{}") as Partial<PitchSender>) };
  } catch {
    return empty;
  }
}

/** A first-contact email written from the row's sourced facts, your event, and who you are. Always editable. */
function PitchModal({ record, jobId, onClose }: { record: DatasetRecord; jobId: string; onClose: () => void }) {
  const recipient = record.fields.person_name || record.fields.contact || record.fields.company_name || record.label || "this contact";
  const email = getEmail(record);
  const linkedin = record.fields.linkedin;
  const [sender, setSender] = useState<PitchSender>(loadSender);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const write = useMutation({
    mutationFn: () =>
      api<{ pitch: { subject: string; body: string }; event: { name: string } | null }>(`/api/jobs/${jobId}/pitch`, {
        method: "POST",
        body: JSON.stringify({ entity: record.canonicalEntityId, sender }),
      }),
    onSuccess: (result) => {
      setDraft(result.pitch);
      setEventName(result.event?.name ?? null);
      try {
        localStorage.setItem(SENDER_KEY, JSON.stringify(sender));
      } catch {
        // Saving the sender is a convenience only.
      }
    },
  });

  const edit = (key: keyof PitchSender) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setSender((current) => ({ ...current, [key]: event.target.value }));

  const copyPitch = () => {
    if (!draft) return;
    void navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    notify(`Copied the email for ${recipient}`, "info");
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoHref = draft && email
    ? `mailto:${email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : null;

  return (
    <div className="pitch-modal-overlay" onClick={onClose}>
      <div className="pitch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pitch-modal-head">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Email to {recipient}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              {email ?? (linkedin ? "No email found · send on LinkedIn" : "No email found")}
              {eventName ? ` · for ${eventName}` : ""}
            </div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="pitch-modal-body">
          <div className="pitch-sender">
            <input value={sender.name} onChange={edit("name")} placeholder="Your name" maxLength={200} />
            <input value={sender.role} onChange={edit("role")} placeholder="Your role" maxLength={200} />
            <input value={sender.organization} onChange={edit("organization")} placeholder="Your organization or team" maxLength={200} />
            <input value={sender.ask} onChange={edit("ask")} placeholder="What you are asking for or offering (one line)" maxLength={300} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            Written only from what Dig found about {recipient}, your event details, and the lines above. Review before sending.
          </div>

          {write.isError && <div className="pitch-error">{write.error.message}</div>}

          {draft && (
            <>
              <input
                className="pitch-field"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                aria-label="Subject"
              />
              <textarea
                className="pitch-field"
                rows={12}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                aria-label="Email body"
              />
            </>
          )}
        </div>

        <div className="pitch-modal-footer">
          <button className="btn" onClick={() => write.mutate()} disabled={write.isPending}>
            {write.isPending ? "Writing…" : draft ? "Rewrite" : "Write email"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {draft && (
              <button className="btn" onClick={copyPitch}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
            {draft && linkedin && !mailtoHref && (
              <a href={linkedin} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: "none" }}>
                <ExternalLink size={13} /> Open LinkedIn
              </a>
            )}
            {mailtoHref && (
              <a href={mailtoHref} className="btn blue" style={{ textDecoration: "none" }}>
                <Mail size={13} /> Open in email
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PATHS = [
  ["Email", "email"],
  ["Phone", "phone"],
  ["LinkedIn", "linkedin"],
  ["GitHub", "github"],
  ["Website", "website"],
  ["Contact page", "contactPage"],
] as const;

const PATH_STATUS: Record<string, string> = {
  VERIFIED: "Verified",
  IDENTITY_MATCHED: "Identity matched",
  PROVIDER_MATCHED: "Provider matched",
  LIKELY: "Likely",
  NEEDS_REVIEW: "Needs review",
  NOT_FOUND: "Not found",
};

const TRUST_STATUS: Record<string, string> = {
  HIGH_TRUST: "High trust",
  MEDIUM_TRUST: "Medium trust",
  NEEDS_REVIEW: "Needs review",
  UNTRUSTED: "Untrusted",
};

function ContactPaths({
  record,
  copiedId,
  copyText,
}: {
  record: DatasetRecord;
  copiedId?: string | null;
  copyText?: (text: string, id: string, e?: React.MouseEvent) => void;
}) {
  const book = record.contactability;
  if (!book) return null;
  return (
    <div className="card contact-paths-card">
      <div className="section-eyebrow">
        <Phone size={11} />
        <span>Contact Paths &amp; Reachability</span>
      </div>
      <div className="paths">
        {PATHS.map(([label, key]) => {
          const item = book.channels[key];
          const directLinkedin =
            key === "linkedin"
              ? record.fields.linkedin || (record.fields.profile_url?.includes("linkedin.com") ? record.fields.profile_url : null)
              : null;
          // A saved "email" without an @ (a bare domain from an older run) is not a contact path.
          const malformedEmail = key === "email" && Boolean(item.value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.value ?? "");
          const effectiveValue = malformedEmail ? null : item.value || directLinkedin;
          const found = Boolean(effectiveValue) && (item.status !== "NOT_FOUND" || Boolean(directLinkedin));
          const href = found && effectiveValue && /^https?:\/\//i.test(effectiveValue) ? effectiveValue : null;
          const isCopyable = (key === "email" || key === "phone") && found && Boolean(effectiveValue);
          const copyKey = `cp-${key}-${record.id}`;

          return (
            <div key={key} className="path">
              <span className={found ? "ok" : "miss"}>
                {found ? <Check size={11} style={{ color: "#10b981", flexShrink: 0 }} /> : "—"}
              </span>
              <span className="path-label">{label}</span>
              <div className="path-content">
                <div className="path-value-row">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="path-link">
                      {href.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  ) : key === "email" && found ? (
                    <a href={`mailto:${effectiveValue}`} className="path-link">
                      {effectiveValue}
                    </a>
                  ) : key === "phone" && found ? (
                    <a href={`tel:${(effectiveValue || "").replace(/[^0-9+]/g, "")}`} className="path-link">
                      {effectiveValue}
                    </a>
                  ) : found ? (
                    <span className="path-val-text">{effectiveValue}</span>
                  ) : key === "linkedin" ? (
                    <div className="path-fallback-wrap">
                      <span style={{ color: "var(--text-3)" }}>Not found</span>
                      <span className="path-sep">·</span>
                      <a
                        href={linkedinSearchUrl(record)}
                        target="_blank"
                        rel="noreferrer"
                        className="linkedin-finder-link"
                        title="No profile found. Search LinkedIn for this name"
                      >
                        <span>Search LinkedIn</span>
                        <ExternalLink size={9} />
                      </a>
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-3)" }}>Not found</span>
                  )}

                  {isCopyable && copyText && (
                    <button
                      type="button"
                      className="path-copy-btn"
                      onClick={(e) => copyText(effectiveValue!, copyKey, e)}
                      title={`Copy verified ${label.toLowerCase()}`}
                    >
                      {copiedId === copyKey ? <Check size={10} color="#10b981" /> : <Copy size={10} />}
                    </button>
                  )}
                </div>

                <div className="meta">
                  {key === "linkedin" && !found
                    ? "No direct profile · 1-click fallback"
                    : `${PATH_STATUS[item.status] ?? item.status}${found ? ` · ${Math.round(item.confidence * 100)}%` : ""}${item.provider && item.provider !== "research" ? ` · ${item.provider}` : ""}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {record.trust && (
        <div className="trust-meter-row">
          <div className="trust-meter-info">
            <span>Overall Reachability Trust</span>
            <b>{Math.round(record.trust.overallTrust * 100)}% · {TRUST_STATUS[record.trust.status] ?? record.trust.status}</b>
          </div>
          <div className="trust-meter-track">
            <div
              className="trust-meter-fill"
              style={{
                width: `${Math.round(record.trust.overallTrust * 100)}%`,
                background: record.trust.overallTrust >= 0.8 ? "#10b981" : "#f59e0b",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function pickEvidence(evidence: Evidence[], field: string, value: string) {
  const forField = evidence.filter((item) => item.fieldName === field);
  return forField.find((item) => item.excerpt.toLowerCase().includes(value.toLowerCase())) ?? forField[0];
}

function FieldCard(props: { field: string; label: string; value: string; evidence?: Evidence; versionNumber: number }) {
  const { field, value, evidence } = props;
  const quote = evidence && !LINK_FIELDS.has(field) ? around(evidence.excerpt, value) : null;
  return (
    <div className="card evidence-card">
      <div className="evidence-card-head">
        <span className="field-card-cap">{props.label}</span>
        {evidence && (
          <span className={`authority-chip ${evidence.authority}`}>
            {evidence.authority === "official" ? "OFFICIAL DOM" : evidence.authority.toUpperCase()}
          </span>
        )}
      </div>

      <div className="field-card-val">
        {LINK_FIELDS.has(field) ? (
          <a href={value} target="_blank" rel="noreferrer" className="field-link">
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          value
        )}
      </div>

      {quote && (
        <div className="evidence-quote-bubble">
          <div className="quote-tag">
            <Quote size={9} />
            <span>Quoted verbatim from DOM</span>
          </div>
          <div className="quote-text">
            “{quote.before}
            <mark className="quote-highlight">{quote.hit}</mark>
            {quote.after}”
          </div>
        </div>
      )}

      {evidence?.sourceUrl && (
        <div className="evidence-source-row">
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={evidence.sourceTitle || evidence.sourceUrl}
            className="source-link"
          >
            <ExternalLink size={10} style={{ flexShrink: 0 }} />
            <span>{evidence.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
          </a>
          {evidence.collectedAt && (
            <span className="evidence-timestamp">{day(evidence.collectedAt)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function DiffPanel({ diff, onClose }: { diff: Diff | null; onClose: () => void }) {
  const groups: Array<[string, Diff["added"], string]> = diff
    ? [
        ["Added", diff.added, "#248a3d"],
        ["Changed", diff.changed, "#b26a00"],
        ["Dropped", diff.removed, "#c62828"],
      ]
    : [];
  return (
    <aside className="detail">
      <div className="detail-head">
        <div style={{ flex: 1 }}>
          <h2>Full diff</h2>
          <div className="sub">{diff?.firstVersion || !diff ? "This is the first version — nothing to compare yet." : "Compared with the previous run"}</div>
        </div>
        <button className="btn" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="detail-body">
        {diff && !diff.firstVersion &&
          groups.map(([title, entries, color]) => (
            <div key={title} className="card">
              <div className="cap" style={{ color }}>
                {title} · {entries.length}
              </div>
              {entries.length === 0 && <div style={{ fontSize: 13, color: "var(--text-3)" }}>None</div>}
              {entries.map((entry) => (
                <div key={entry.canonicalEntityId} style={{ fontSize: 13, padding: "5px 0", borderTop: "1px solid #f0f0f2" }}>
                  <b>{entry.label}</b>
                  {entry.fields.map((change) => (
                    <div key={change.field} style={{ color: "var(--text-2)" }}>
                      {change.field}: {change.from || "—"} → {change.to || "—"}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
      </div>
    </aside>
  );
}

function around(excerpt: string, value: string) {
  const at = excerpt.toLowerCase().indexOf(value.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - 110);
  const end = Math.min(excerpt.length, at + value.length + 110);
  return {
    before: (start > 0 ? "…" : "") + excerpt.slice(start, at),
    hit: excerpt.slice(at, at + value.length),
    after: excerpt.slice(at + value.length, end) + (end < excerpt.length ? "…" : ""),
  };
}

function day(iso: string | undefined | null, withYear = false) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

function when(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return new Date().toDateString() === date.toDateString() ? `today at ${time}` : `${day(iso)} at ${time}`;
}

function stageOf(progress: JobProgress | null) {
  const stage = progress?.progress.stage;
  return stage && stage !== "QUEUED" ? stage : progress?.status ?? "QUEUED";
}

/** Real pipeline percent once stages report; during the ~1 min live collection, an elapsed-time estimate. */
function percentOf(progress: JobProgress | null, startedAt: number) {
  const reported = progress?.progress.percent ?? 0;
  if (stageOf(progress) !== "COLLECTING" && stageOf(progress) !== "QUEUED") return Math.max(60, reported);
  const seconds = (Date.now() - startedAt) / 1000;
  return Math.max(reported, Math.round(4 + 56 * (1 - Math.exp(-seconds / 35))));
}

function emptyProgress(stage: string): JobProgress["progress"] {
  return { stage, percent: 2, sourcesPlanned: 0, sourcesScanned: 0, documents: 0, records: 0, valid: 0, duplicates: 0, conflicts: 0 };
}
