import { describe, expect, it } from "vitest";
import { buildBlueprint } from "./blueprint.js";
import { collectDemo, DEMO_NOW } from "./demo-data.js";
import { containmentDecision } from "./jev.js";
import { filledCount, runPipeline } from "./pipeline.js";

describe("containmentDecision", () => {
  it("keeps the fuller value when the new one is part of the old", () => {
    const decision = containmentDecision("Engineering & AI Leader, IBM", "IBM");
    expect(decision).toMatchObject({ decision: "OLD", provider: "rule" });
    expect(decision?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("takes the new value when it adds detail to the old", () => {
    expect(containmentDecision("IBM", "Engineering & AI Leader, IBM")).toMatchObject({ decision: "NEW" });
  });

  it("leaves real disagreements to Jev, matching whole words only", () => {
    expect(containmentDecision("Google", "Microsoft")).toBeNull();
    expect(containmentDecision("sponsor", "sponsored by")).toBeNull();
    expect(containmentDecision("IBM", "ibm")).toBeNull();
  });
});

describe("filledCount", () => {
  it("counts the search fields and contact paths, not bookkeeping fields", () => {
    const fields = ["company_name", "category", "email", "source_url", "last_verified"];
    expect(filledCount({ company_name: "Foxtale", category: "skincare", linkedin: "https://linkedin.com/company/foxtale", source_url: "x", last_verified: "y" }, fields)).toBe(3);
    expect(filledCount({ company_name: "Foxtale", category: "  " }, fields)).toBe(1);
  });
});

describe("ranking", () => {
  it("puts the rows with the most details first", async () => {
    const { blueprint } = buildBlueprint("Find active technology event sponsors in Delhi NCR");
    const collected = collectDemo(blueprint, 1);
    // Give the last row every contact path, so it should move to the top.
    const last = collected[collected.length - 1]!;
    collected[collected.length - 1] = {
      ...last,
      fields: { ...last.fields, linkedin: "https://linkedin.com/company/x", github: "https://github.com/x", phone: "+91 90000 00000", email: "hello@x.com", website: "https://x.com", contact: "Jane Doe" },
    };
    const result = await runPipeline({ blueprint, collected, now: DEMO_NOW, demo: true });
    const counts = result.records.map((record) => filledCount(record.fields, blueprint.fields));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(result.records[0]?.canonicalEntityId).toBe(last.canonicalEntityId);
    expect(result.records[0]?.annotation.reasoning).toContain("details filled");
  });
});
