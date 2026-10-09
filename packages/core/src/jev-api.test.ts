import { describe, expect, it } from "vitest";
import { conflictFromJev, jevConflictCall, trustFromJev } from "./jev-api.js";
import { emptyContactability } from "./enrichment/contactability.js";
import type { JevInput } from "./jev.js";
import type { TrustInput } from "./enrichment/trust.js";

const contactability = emptyContactability("2026-10-04T00:00:00.000Z");
contactability.channels.email.status = "VERIFIED";
contactability.score = 0.4;
contactability.status = "PARTIAL";

const trustInput: TrustInput = {
  identityConfidence: 0.8,
  evidenceConfidence: 0.7,
  contactability,
  timestamp: "2026-10-04T00:00:00.000Z",
};

const conflictInput: JevInput = {
  field: "email",
  oldValue: "old@acme.com",
  newValue: "new@acme.com",
  oldEvidence: null,
  newEvidence: null,
  ambiguous: false,
  question: "Which email is current?",
};

describe("Jev decisions", () => {
  it("turns a Jev score into a trust decision and ignores a weak answer", () => {
    const trusted = trustFromJev({ answers: { trust: { score: 3, confidence: 0.9 } } }, trustInput, "typesafe/jev-1.13");
    expect(trusted?.provider).toBe("jev");
    expect(trusted?.overallTrust).toBe(1);
    expect(trusted?.status).toBe("HIGH_TRUST");
    expect(trustFromJev({ answers: { trust: { score: 3, confidence: 0.2 } } }, trustInput, "typesafe/jev-1.13")).toBeNull();
    expect(trustFromJev({ answers: {} }, trustInput, "typesafe/jev-1.13")).toBeNull();
  });

  it("accepts only the two grounded conflict choices", () => {
    const kept = conflictFromJev({ answers: { keep: { choice: "old", confidence: 0.91 } } }, conflictInput);
    expect(kept).toMatchObject({ decision: "OLD", provider: "jev" });
    expect(conflictFromJev({ answers: { keep: { choice: "invented@acme.com", confidence: 0.99 } } }, conflictInput)).toBeNull();
  });

  it("does not let Jev auto-settle an ambiguous conflict", () => {
    const decision = conflictFromJev(
      { answers: { keep: { choice: "NEW", confidence: 0.99 } } },
      { ...conflictInput, ambiguous: true },
    );
    expect(decision?.confidence).toBeLessThanOrEqual(0.62);
    expect(jevConflictCall(conflictInput).questions.keep.criteria).toHaveProperty("BOTH");
  });
});
