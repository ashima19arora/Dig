import type { Contactability, TrustDecision, TrustStatus } from "../types.js";

export interface TrustInput {
  identityConfidence: number;
  evidenceConfidence: number;
  contactability: Contactability;
  timestamp: string;
}

export interface TrustProvider {
  id: string;
  model: string;
  decide(input: TrustInput): Promise<TrustDecision> | TrustDecision;
  /** Optional batch call. A failure here falls back to one decision at a time, then to the deterministic score. */
  decideMany?(inputs: TrustInput[]): Promise<TrustDecision[]>;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function statusFor(overall: number): TrustStatus {
  if (overall >= 0.85) return "HIGH_TRUST";
  if (overall >= 0.65) return "MEDIUM_TRUST";
  if (overall >= 0.45) return "NEEDS_REVIEW";
  return "UNTRUSTED";
}

/** Deterministic trust from the evidence already in hand. Used directly, and whenever a remote model is down. */
export function deterministicTrust(input: TrustInput, provider = "mock", model = "deterministic"): TrustDecision {
  const identityConfidence = clamp01(input.identityConfidence);
  const evidenceConfidence = clamp01(input.evidenceConfidence);
  const contactConfidence = clamp01(input.contactability.score);
  const overallTrust = Math.round((identityConfidence * 0.45 + evidenceConfidence * 0.35 + contactConfidence * 0.2) * 1000) / 1000;
  const status = statusFor(overallTrust);
  return {
    identityConfidence,
    evidenceConfidence,
    contactConfidence,
    overallTrust,
    needsReviewProbability: Math.round((1 - overallTrust) * 1000) / 1000,
    status,
    provider,
    model,
    timestamp: input.timestamp,
  };
}

export const mockTrustProvider: TrustProvider = {
  id: "mock",
  model: "deterministic",
  decide(input) {
    return deterministicTrust(input, "mock", "deterministic");
  },
};

export async function evaluateTrustMany(provider: TrustProvider, inputs: TrustInput[]): Promise<TrustDecision[]> {
  if (inputs.length === 0) return [];
  if (provider.decideMany) {
    try {
      const decisions = await provider.decideMany(inputs);
      if (decisions.length === inputs.length && decisions.every((decision) => decision && typeof decision.overallTrust === "number" && decision.status)) {
        return decisions;
      }
    } catch {
      // The batch endpoint is optional. Per-record evaluation still has its own fallback.
    }
  }
  return Promise.all(inputs.map((input) => evaluateTrust(provider, input)));
}

export async function evaluateTrust(provider: TrustProvider, input: TrustInput): Promise<TrustDecision> {
  try {
    const decision = await provider.decide(input);
    if (!decision || typeof decision.overallTrust !== "number" || !decision.status) {
      return deterministicTrust(input, "mock", "deterministic-fallback");
    }
    return decision;
  } catch {
    return deterministicTrust(input, "mock", "deterministic-fallback");
  }
}
