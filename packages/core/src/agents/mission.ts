import type { AgentRecord } from "./types.js";
import { templateById, type WorkflowTemplate } from "./templates.js";

export interface MissionStep {
  id: string;
  label: string;
  state: "done" | "ready" | "waiting";
}

export interface MissionPlan {
  title: string;
  templateId: string;
  requirements: string[];
  steps: MissionStep[];
  summary: string;
}

export interface SimulationResult {
  candidates: number;
  workflowVolume: number;
  contactPaths: number;
  providerCalls: number;
  estimatedMinutes: number;
  conflicts: number;
  total: number;
  withEmail: number;
  sends: false;
  sampleCandidates?: AgentRecord[];
}

const STARTERS = [
  { id: "sponsors", title: "Find potential sponsors", objective: "Find 20 companies likely to sponsor the event, with a verified contact path." },
  { id: "leads", title: "Find hiring leads", objective: "Find hiring leads and prepare a follow-up for the ones with a published email." },
  { id: "competitors", title: "Identify competitors", objective: "Monitor competitor changes since the previous research run." },
  { id: "judges", title: "Find judges and mentors", objective: "Find judges and mentors and rank the ones with a credible profile." },
  { id: "changes", title: "Monitor competitor changes", objective: "Show what changed since the previous run." },
  { id: "people", title: "Find decision-makers", objective: "Find decision-makers and keep only rows with a real contact path." },
  { id: "value", title: "Identify high-value opportunities", objective: "Rank high-confidence verified organizations and prepare outreach." },
];

export function missionStarters() {
  return STARTERS;
}

export function planMission(objective: string): MissionPlan {
  const text = objective.toLowerCase();
  const templateId = /sponsor|hackathon/.test(text)
    ? "sponsor-outreach"
    : /lead|hiring|decision/.test(text)
      ? "lead-follow-up"
      : /enrich|contact path|email/.test(text) && /missing|no contact|enrich/.test(text)
        ? "contact-enrichment"
        : /refresh|re-run|rerun/.test(text)
          ? "dataset-refresh"
          : /competitor|change|monitor/.test(text)
            ? "change-monitor"
            : /new record|alert/.test(text)
              ? "new-record-alert"
              : "high-confidence";
  const title = STARTERS.find((item) => objective.toLowerCase().includes(item.title.toLowerCase().slice(0, 12)))?.title
    ?? objective.trim().slice(0, 80);
  return {
    title: title || "Mission",
    templateId,
    requirements: requirementsFor(templateId),
    steps: [
      { id: "understand", label: "Understand the objective", state: "done" },
      { id: "dataset", label: "Use the selected dataset", state: "ready" },
      { id: "filter", label: "Keep rows that match the evidence rules", state: "ready" },
      { id: "rank", label: "Rank the remaining rows", state: "waiting" },
      { id: "approve", label: "Wait for approval before any outreach", state: "waiting" },
      { id: "report", label: "Report what the workflow did", state: "waiting" },
    ],
    summary: "The plan reads the current grounded dataset, then opens an editable workflow. Outbound steps stay behind human approval.",
  };
}

function requirementsFor(templateId: string): string[] {
  if (templateId === "sponsor-outreach") return ["Verified status", "A real contact path", "Ranked by confidence and contactability"];
  if (templateId === "lead-follow-up") return ["A published email on the record", "A cap of 10", "Approval before send"];
  if (templateId === "contact-enrichment") return ["Report rows with no contact path", "Do not invent an address"];
  if (templateId === "change-monitor" || templateId === "new-record-alert") return ["Compare with the previous dataset version"];
  return ["High trust", "Verified status", "Approval before send"];
}

export function missionWorkflow(templateId: string, jobId: string): WorkflowTemplate {
  return templateById(templateId, jobId) ?? templateById("high-confidence", jobId)!;
}

export function simulateMission(records: AgentRecord[], options: { minContactability?: number; limit?: number; requireEmail?: boolean; conflicts?: number }): SimulationResult {
  const min = options.minContactability ?? 0;
  const withEmail = records.filter((record) => Boolean(record.fields.email)).length;
  let candidates = records.filter((record) => record.contactabilityScore >= min);
  if (options.requireEmail) candidates = candidates.filter((record) => Boolean(record.fields.email));
  const volume = Math.min(candidates.length, options.limit ?? candidates.length);
  const ranked = [...candidates].sort((a, b) => (b.contactabilityScore - a.contactabilityScore) || (b.confidence - a.confidence));
  const sample = ranked.slice(0, Math.min(volume, 50));
  return {
    candidates: candidates.length,
    workflowVolume: volume,
    contactPaths: candidates.filter((record) => record.contactabilityScore > 0).length,
    providerCalls: 0,
    estimatedMinutes: Math.max(1, Math.ceil(volume / 20)),
    conflicts: options.conflicts ?? 0,
    total: records.length,
    withEmail,
    sends: false,
    sampleCandidates: sample,
  };
}
