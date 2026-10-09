import type { JevDecision, JevInput } from "./jev.js";
import { deterministicTrust, type TrustInput } from "./enrichment/trust.js";
import type { TrustDecision, TrustStatus } from "./types.js";

/**
 * Maps Dig's already-grounded evidence into a Jev decision request, and maps
 * the answer back. Jev may choose between values Dig already holds. It may
 * not invent a contact, and a weak or unexpected answer is discarded.
 */

export interface JevQuestion {
  type: "choice" | "score";
  instructions: string;
  criteria: Record<string, string> | string[];
}

export interface JevCall {
  state: { body: string };
  questions: Record<string, JevQuestion>;
}

const TRUST_LEVELS = ["unsupported", "thin", "supported", "strong"] as const;

function statusFor(overall: number): TrustStatus {
  if (overall >= 0.85) return "HIGH_TRUST";
  if (overall >= 0.65) return "MEDIUM_TRUST";
  if (overall >= 0.45) return "NEEDS_REVIEW";
  return "UNTRUSTED";
}

function clip(text: string, max = 280) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function jevTrustCall(input: TrustInput): JevCall {
  const contact = input.contactability;
  const lines = [
    `Identity confidence ${input.identityConfidence.toFixed(2)}.`,
    `Evidence confidence ${input.evidenceConfidence.toFixed(2)}.`,
    `Contactability ${contact.score.toFixed(2)} (${contact.status}).`,
    `Email ${contact.channels.email.status}. LinkedIn ${contact.channels.linkedin.status}. GitHub ${contact.channels.github.status}. Phone ${contact.channels.phone.status}. Website ${contact.channels.website.status}.`,
    "Score only these signals. Do not assume a contact that is missing.",
  ];
  return {
    state: { body: lines.join(" ") },
    questions: {
      trust: {
        type: "score",
        instructions: "How well do these grounded signals support trusting the record?",
        criteria: [...TRUST_LEVELS],
      },
    },
  };
}

export function jevConflictCall(input: JevInput): JevCall {
  const side = (label: string, value: string, evidence: JevInput["oldEvidence"]) => {
    if (!evidence) return `${label} value: ${clip(value) || "(empty)"}. No source attached.`;
    return [
      `${label} value: ${clip(value) || "(empty)"}.`,
      `Source authority ${evidence.authority}.`,
      evidence.publishedAt ? `Published ${evidence.publishedAt}.` : "",
      evidence.sourceTitle ? `Title: ${clip(evidence.sourceTitle, 120)}.` : "",
      evidence.excerpt ? `Excerpt: ${clip(evidence.excerpt)}.` : "",
    ].filter(Boolean).join(" ");
  };
  return {
    state: {
      body: [
        `Field: ${input.field}.`,
        side("Previous", input.oldValue, input.oldEvidence),
        side("New", input.newValue, input.newEvidence),
        input.ambiguous ? "The record is already marked ambiguous." : "",
        "Choose only between these two grounded values.",
      ].filter(Boolean).join(" "),
    },
    questions: {
      keep: {
        type: "choice",
        instructions: "Which grounded value should Dig keep? Never invent a third value.",
        criteria: {
          NEW: "Keep the newly collected value.",
          OLD: "Keep the previous value.",
          BOTH: "Both values are plausible. A person should see both.",
        },
      },
    },
  };
}

interface JevAnswer {
  choice?: string;
  score?: number;
  confidence?: number;
  answer_confidence?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function jevAnswers(body: unknown): Record<string, JevAnswer> | null {
  const root = asRecord(body);
  const answers = asRecord(root?.answers);
  if (!answers) return null;
  const parsed: Record<string, JevAnswer> = {};
  for (const [key, value] of Object.entries(answers)) {
    const answer = asRecord(value);
    if (!answer) continue;
    parsed[key] = {
      choice: typeof answer.choice === "string" ? answer.choice : undefined,
      score: typeof answer.score === "number" ? answer.score : undefined,
      confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
      answer_confidence: typeof answer.answer_confidence === "number" ? answer.answer_confidence : undefined,
    };
  }
  return parsed;
}

function abstained(answer: JevAnswer | undefined) {
  if (!answer) return true;
  const sure = answer.answer_confidence ?? answer.confidence;
  return sure !== undefined && sure < 0.4;
}

export function trustFromJev(body: unknown, input: TrustInput, model: string): TrustDecision | null {
  const answer = jevAnswers(body)?.trust;
  if (abstained(answer) || answer?.score === undefined || !Number.isFinite(answer.score)) return null;
  const span = Math.max(1, TRUST_LEVELS.length - 1);
  const overall = Math.round(Math.min(1, Math.max(0, answer.score / span)) * 1000) / 1000;
  const base = deterministicTrust(input, "jev", model);
  return {
    ...base,
    overallTrust: overall,
    needsReviewProbability: Math.round((1 - overall) * 1000) / 1000,
    status: statusFor(overall),
    provider: "jev",
    model,
  };
}

export function conflictFromJev(body: unknown, input: JevInput): JevDecision | null {
  const answer = jevAnswers(body)?.keep;
  if (abstained(answer) || !answer?.choice) return null;
  const decision = answer.choice.trim().toUpperCase();
  if (decision !== "NEW" && decision !== "OLD" && decision !== "BOTH") return null;
  const reported = answer.answer_confidence ?? answer.confidence ?? 0.5;
  const confidence = input.ambiguous ? Math.min(0.62, reported) : Math.min(1, Math.max(0, reported));
  return {
    decision,
    confidence,
    reason: input.ambiguous
      ? "Jev leaned one way, but the record is ambiguous, so a person decides."
      : `Jev kept the ${decision === "NEW" ? "new" : decision === "OLD" ? "previous" : "both"} grounded value.`,
    provider: "jev",
  };
}
