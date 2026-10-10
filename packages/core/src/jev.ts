import type { EvidenceItem } from "./types.js";

export interface JevInput {
  field: string;
  oldValue: string;
  newValue: string;
  oldEvidence: EvidenceItem | null;
  newEvidence: EvidenceItem | null;
  ambiguous: boolean;
  question: string;
}

export interface JevDecision {
  decision: "NEW" | "OLD" | "BOTH";
  confidence: number;
  reason: string;
  provider: string;
}

export interface JevProvider {
  id: string;
  decide(input: JevInput): JevDecision | Promise<JevDecision>;
}

function timeOf(evidence: EvidenceItem | null): number {
  if (!evidence?.publishedAt) return 0;
  const time = Date.parse(evidence.publishedAt);
  return Number.isNaN(time) ? 0 : time;
}

export const mockJevProvider: JevProvider = {
  id: "mock",
  decide(input) {
    if (input.ambiguous) {
      return {
        decision: "NEW",
        confidence: 0.62,
        reason: "Both values are supported. The newer source is not clearly more authoritative, so a person should decide.",
        provider: "mock",
      };
    }
    const newOfficial = input.newEvidence?.authority === "official";
    const newer = timeOf(input.newEvidence) > timeOf(input.oldEvidence);
    const older = timeOf(input.newEvidence) < timeOf(input.oldEvidence) && timeOf(input.oldEvidence) > 0;
    if (newOfficial && newer) {
      return {
        decision: "NEW",
        confidence: 0.94,
        reason: "New source is more recent and authoritative.",
        provider: "mock",
      };
    }
    if (older) {
      return {
        decision: "OLD",
        confidence: 0.88,
        reason: "The previous source is more recent than the newly collected one.",
        provider: "mock",
      };
    }
    if (newer) {
      return {
        decision: "NEW",
        confidence: 0.86,
        reason: "The new source was published more recently.",
        provider: "mock",
      };
    }
    return {
      decision: "BOTH",
      confidence: 0.7,
      reason: "The sources disagree without a clear recency or authority advantage.",
      provider: "mock",
    };
  },
};

function words(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim()} `;
}

/**
 * "IBM" and "Engineering & AI Leader, IBM" are the same fact, one more complete.
 * Keep the fuller value without asking anyone. Whole words only: "sponsor" is not inside "sponsored by".
 */
export function containmentDecision(oldValue: string, newValue: string): JevDecision | null {
  const before = words(oldValue);
  const after = words(newValue);
  if (!before.trim() || !after.trim() || before === after) return null;
  if (before.includes(after)) {
    return {
      decision: "OLD",
      confidence: 0.95,
      reason: `"${newValue}" is already part of "${oldValue}", so the more complete value was kept.`,
      provider: "rule",
    };
  }
  if (after.includes(before)) {
    return {
      decision: "NEW",
      confidence: 0.95,
      reason: `"${newValue}" adds detail to "${oldValue}", so the more complete value was kept.`,
      provider: "rule",
    };
  }
  return null;
}

export function applyThreshold(decision: JevDecision, threshold: number): {
  status: "PENDING" | "AUTO_RESOLVED";
  decision: JevDecision;
} {
  if (decision.confidence >= threshold && decision.decision !== "BOTH") {
    return { status: "AUTO_RESOLVED", decision };
  }
  return { status: "PENDING", decision };
}
