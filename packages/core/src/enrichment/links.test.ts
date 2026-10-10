import { describe, expect, it } from "vitest";
import type { CollectedRecord } from "../types.js";
import { cleanPersonName, organizationHint } from "./identity.js";
import { profileLinkCandidates, slugFitsName, type SearchHit } from "./links.js";
import { enrichRecords, entityOf } from "./orchestrator.js";

const NOW = "2026-10-10T00:00:00.000Z";

function person(name: string, affiliation: string): CollectedRecord {
  return {
    canonicalEntityId: name.toLowerCase().replace(/\W+/g, "-"),
    fields: { person_name: name, affiliation },
    sources: [
      {
        url: "https://events.example/judges",
        title: "Judges",
        domain: "events.example",
        publishedAt: "2026-09-01",
        sourceType: "event_page",
        authority: "secondary",
        excerpt: name,
        fieldNames: ["person_name"],
        extractionMethod: "tavily+llm",
        demo: false,
      },
    ],
  };
}

describe("cleanPersonName", () => {
  it("drops honorifics before the name", () => {
    expect(cleanPersonName("Shri Abhishek Singh")).toBe("Abhishek Singh");
    expect(cleanPersonName("Dr. A. Rao")).toBe("A. Rao");
    expect(cleanPersonName("Prof Dr Meera Nair")).toBe("Meera Nair");
  });

  it("leaves ordinary names alone", () => {
    expect(cleanPersonName("Drew Houston")).toBe("Drew Houston");
    expect(cleanPersonName("Alex Kuefler")).toBe("Alex Kuefler");
  });
});

describe("organizationHint", () => {
  it("pulls the organization out of real affiliation lines", () => {
    expect(organizationHint("Founder & CEO - Cre8TechIn | AS Music Bros.")).toBe("Cre8TechIn");
    expect(organizationHint("CEO QuickReel")).toBe("QuickReel");
    expect(organizationHint("Waymo")).toBe("Waymo");
    expect(organizationHint("Penn State Aerospace")).toBe("Penn State Aerospace");
    expect(organizationHint("Additional Secretary, Ministry of Electronics & IT and CEO, IndiaAI Mission")).toBe(
      "Ministry of Electronics & IT",
    );
    expect(organizationHint("Engineering & AI Leader at Microsoft")).toBe("Microsoft");
    expect(organizationHint("Head of Product, Razorpay")).toBe("Razorpay");
  });

  it("returns nothing for an empty or title-only line", () => {
    expect(organizationHint("")).toBe("");
    expect(organizationHint("Founder & CEO")).toBe("");
  });
});

describe("entityOf", () => {
  it("looks a person up by the clean name and marks the kind", () => {
    const entity = entityOf(person("Shri Abhishek Singh", "Additional Secretary, MeitY"));
    expect(entity.name).toBe("Abhishek Singh");
    expect(entity.kind).toBe("person");
  });

  it("treats a row with only a company as a company", () => {
    const entity = entityOf({ ...person("x", ""), fields: { company_name: "Foxtale" } });
    expect(entity).toMatchObject({ name: "Foxtale", company: "Foxtale", kind: "company" });
  });
});

describe("profileLinkCandidates", () => {
  const alex = { name: "Alex Kuefler", company: "Waymo", location: "", website: "", kind: "person" as const };

  it("takes the profile when the search result is the LinkedIn page itself", () => {
    const hits: SearchHit[] = [
      { url: "https://www.linkedin.com/in/alexkuefler", title: "Alex Kuefler - Waymo | LinkedIn", content: "Research scientist at Waymo." },
    ];
    const found = profileLinkCandidates(alex, hits);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ channel: "linkedin", value: "https://www.linkedin.com/in/alexkuefler", confidence: 0.86 });
    expect(found[0]?.profile.company).toBe("Waymo");
  });

  it("finds a GitHub profile result and skips GitHub's own pages", () => {
    const hits: SearchHit[] = [
      { url: "https://github.com/akuefler", title: "akuefler (Alex Kuefler) · GitHub", content: "Waymo" },
      { url: "https://github.com/features", title: "Features", content: "Alex Kuefler" },
    ];
    const found = profileLinkCandidates(alex, hits);
    expect(found.map((item) => item.value)).toEqual(["https://github.com/akuefler"]);
  });

  it("never hands someone else's link from a list page to this person", () => {
    const hits: SearchHit[] = [
      {
        url: "https://events.example/judges",
        title: "Our judges",
        content: "Alex Kuefler, Waymo. Priya Shah https://linkedin.com/in/priya-shah-01 and https://www.linkedin.com/in/alex-kuefler-9b",
      },
    ];
    const found = profileLinkCandidates(alex, hits);
    expect(found.map((item) => item.value)).toEqual(["https://www.linkedin.com/in/alex-kuefler-9b"]);
  });

  it("ignores results that mention neither the name nor the organization", () => {
    const hits: SearchHit[] = [{ url: "https://www.linkedin.com/in/someone", title: "Someone | LinkedIn", content: "Nothing here" }];
    expect(profileLinkCandidates(alex, hits)).toEqual([]);
  });

  it("uses company pages, not personal profiles, for a company row", () => {
    const foxtale = { name: "Foxtale", company: "Foxtale", location: "", website: "https://foxtale.in", kind: "company" as const };
    const hits: SearchHit[] = [
      {
        url: "https://in.linkedin.com/company/foxtale",
        title: "Foxtale | LinkedIn",
        content: "Foxtale skincare. Founder https://www.linkedin.com/in/foxtale-founder",
      },
    ];
    const found = profileLinkCandidates(foxtale, hits);
    expect(found.map((item) => item.value)).toEqual(["https://in.linkedin.com/company/foxtale"]);
  });

  it("matches slugs on any part of the name", () => {
    expect(slugFitsName("https://www.linkedin.com/in/abhishek-s-12", "Abhishek Singh")).toBe(true);
    expect(slugFitsName("https://www.linkedin.com/in/priya-shah", "Abhishek Singh")).toBe(false);
  });
});

describe("enrichRecords with search links", () => {
  it("fills the LinkedIn column when the name and organization are on the profile page", async () => {
    const [enriched] = await enrichRecords([person("Shri Alex Kuefler", "Research Scientist at Waymo")], {
      now: NOW,
      timeoutMs: 5_000,
      providers: {
        tavily: async (entity) =>
          profileLinkCandidates(entity, [
            { url: "https://www.linkedin.com/in/alexkuefler", title: "Alex Kuefler - Waymo | LinkedIn", content: "Waymo" },
          ]),
      },
    });
    expect(enriched?.fields.linkedin).toBe("https://www.linkedin.com/in/alexkuefler");
    expect(enriched?.contactability?.channels.linkedin.status).toBe("IDENTITY_MATCHED");
  });

  it("keeps a name-only match for review and does not fill the column", async () => {
    const [enriched] = await enrichRecords([person("Abhishek Singh", "IndiaAI Mission")], {
      now: NOW,
      timeoutMs: 5_000,
      providers: {
        tavily: async (entity) =>
          profileLinkCandidates(entity, [
            { url: "https://www.linkedin.com/in/abhishek-singh-77", title: "Abhishek Singh | LinkedIn", content: "Sales, Pune" },
          ]),
      },
    });
    expect(enriched?.fields.linkedin).toBeUndefined();
    expect(enriched?.contactability?.channels.linkedin.status).toBe("NEEDS_REVIEW");
  });
});
