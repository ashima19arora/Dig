import { describe, expect, it } from "vitest";
import { buildBlueprint } from "../blueprint.js";
import { runPipeline } from "../pipeline.js";
import type { CollectedRecord } from "../types.js";
import { acceptDescription, applyDescription, describeFieldFor, noteSnippet, relevantNotes, type PageNote } from "./describe.js";

const alex = { name: "Alex Kuefler", company: "Research Scientist at Waymo", location: "", website: "", kind: "person" as const };
const foxtale = { name: "Foxtale", company: "Foxtale", location: "", website: "", kind: "company" as const };

const alexPage: PageNote = {
  url: "https://www.linkedin.com/in/alexkuefler",
  title: "Alex Kuefler - Waymo | LinkedIn",
  text: "Alex Kuefler works on reinforcement learning for autonomous driving at Waymo.",
};

describe("describeFieldFor", () => {
  it("fills the column each search type shows", () => {
    expect(describeFieldFor("LEAD_LOOKUP")).toBe("category");
    expect(describeFieldFor("COMPETITOR_LOOKUP")).toBe("category");
    expect(describeFieldFor("JUDGE_LOOKUP")).toBe("expertise");
    expect(describeFieldFor("SPONSOR_LOOKUP")).toBeNull();
  });
});

describe("relevantNotes", () => {
  it("needs the person's name and organization on the page", () => {
    const namesake: PageNote = { url: "https://x.example/a", title: "Alex Kuefler | Sales", text: "Alex Kuefler sells cars in Ohio." };
    expect(relevantNotes(alex, [alexPage, namesake])).toEqual([alexPage]);
  });

  it("needs only the name for a company", () => {
    const page: PageNote = { url: "https://foxtale.in", title: "Foxtale", text: "Foxtale skincare products for women" };
    expect(relevantNotes(foxtale, [page])).toEqual([page]);
  });
});

describe("acceptDescription", () => {
  it("keeps a phrase copied from the page, in the page's own spelling", () => {
    expect(acceptDescription("Reinforcement Learning", alex, [alexPage])).toEqual({ value: "reinforcement learning", note: alexPage });
  });

  it("drops anything not on the page, too long, or just the name", () => {
    expect(acceptDescription("robotics", alex, [alexPage])).toBeNull();
    expect(acceptDescription("reinforcement learning for autonomous driving at Waymo every day", alex, [alexPage])).toBeNull();
    expect(acceptDescription("Alex Kuefler", alex, [alexPage])).toBeNull();
    expect(acceptDescription(null, alex, [alexPage])).toBeNull();
  });
});

describe("noteSnippet", () => {
  it("keeps the text around the name", () => {
    const long: PageNote = { ...alexPage, text: `${"x ".repeat(400)}Alex Kuefler works on robotics. ${"y ".repeat(400)}` };
    const snippet = noteSnippet(alex, long);
    expect(snippet.text).toContain("Alex Kuefler works on robotics");
    expect(snippet.text.length).toBeLessThanOrEqual(320);
  });
});

describe("applyDescription", () => {
  const lead: CollectedRecord = {
    canonicalEntityId: "foxtale",
    fields: { company_name: "Foxtale" },
    sources: [
      {
        url: "https://list.example/d2c",
        title: "Top D2C brands",
        domain: "list.example",
        publishedAt: "2026-09-01",
        sourceType: "list_page",
        authority: "secondary",
        excerpt: "Foxtale",
        fieldNames: ["company_name"],
        extractionMethod: "tavily+llm",
        demo: false,
      },
    ],
  };
  const page: PageNote = { url: "https://in.linkedin.com/company/foxtale", title: "Foxtale | LinkedIn", text: "Foxtale | Skincare products for women" };

  it("never overwrites a value research already found", () => {
    const filled = { ...lead, fields: { ...lead.fields, category: "beauty" } };
    expect(applyDescription(filled, "category", "Skincare products", page)).toBe(filled);
  });

  it("cites the page, so the evidence panel shows the real quote", async () => {
    const { blueprint } = buildBlueprint("D2C skincare brands in Mumbai we could pitch our analytics tool to", "LEAD_LOOKUP");
    const record = applyDescription(lead, "category", "Skincare products", page);
    const result = await runPipeline({ blueprint, collected: [record], now: new Date("2026-10-10T00:00:00Z"), demo: true });
    const evidence = result.records[0]?.evidence.find((item) => item.fieldName === "category");
    expect(result.records[0]?.fields.category).toBe("Skincare products");
    expect(evidence?.sourceUrl).toBe("https://in.linkedin.com/company/foxtale");
  });
});
