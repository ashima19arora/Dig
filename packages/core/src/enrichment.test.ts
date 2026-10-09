import { describe, expect, it, vi } from "vitest";
import { diffDatasets } from "./diff.js";
import { enrichRecords, type ProviderCandidate } from "./enrichment/orchestrator.js";
import { isPatternGuess, literalOnPage, matchIdentity } from "./enrichment/identity.js";
import { deterministicTrust, evaluateTrust, type TrustProvider } from "./enrichment/trust.js";
import type { TrustDecision } from "./types.js";
import { emptyContactability } from "./enrichment/contactability.js";
import type { CollectedRecord } from "./types.js";

const NOW = "2026-10-04T00:00:00.000Z";

function record(fields: Record<string, string>, id = "acme"): CollectedRecord {
  return {
    canonicalEntityId: id,
    fields,
    sources: [
      {
        url: "https://events.example/sponsors",
        title: "Sponsors",
        domain: "events.example",
        publishedAt: "2026-09-01",
        sourceType: "event_page",
        authority: "secondary",
        excerpt: "Acme",
        fieldNames: ["company_name"],
        extractionMethod: "tavily+llm",
        demo: false,
      },
    ],
  };
}

function candidate(partial: Partial<ProviderCandidate> & Pick<ProviderCandidate, "provider" | "channel" | "value">): ProviderCandidate {
  return {
    sourceUrl: null,
    pageText: null,
    confidence: 0.9,
    verificationStatus: null,
    sources: [],
    profile: { name: "", company: "", location: "", website: "" },
    ...partial,
  };
}

describe("literal grounding stays the hard gate", () => {
  it("accepts an email that is on the page", () => {
    expect(literalOnPage("jane@acme.com", "Write jane@acme.com for partnerships")).toBe(true);
  });

  it("rejects an email the page does not contain", () => {
    expect(literalOnPage("jane@acme.com", "Acme sponsors the event")).toBe(false);
  });

  it("rejects a hallucinated email even when the name is on the page", async () => {
    const calls = vi.fn(async (): Promise<ProviderCandidate[]> => [
      candidate({
        provider: "tavily",
        channel: "email",
        value: "jane@acme.com",
        pageText: "Acme sponsors the event. No inbox is listed.",
        profile: { name: "Acme", company: "Acme", location: "", website: "" },
      }),
    ]);
    const [enriched] = await enrichRecords([record({ company_name: "Acme" })], {
      now: NOW,
      timeoutMs: 1000,
      providers: { tavily: calls },
    });
    expect(enriched?.fields.email).toBeUndefined();
    expect(enriched?.contactability?.channels.email.status).toBe("NOT_FOUND");
  });

  it("accepts a Hunter email that came back with a source URL", async () => {
    const [enriched] = await enrichRecords([record({ company_name: "Acme", website: "https://acme.com" })], {
      now: NOW,
      timeoutMs: 1000,
      providers: {
        hunter: async () => [
          candidate({
            provider: "hunter",
            channel: "email",
            value: "partnerships@acme.com",
            verificationStatus: "valid",
            sources: ["https://acme.com/contact"],
            sourceUrl: "https://acme.com/contact",
            profile: { name: "Acme", company: "Acme", location: "", website: "https://acme.com" },
          }),
        ],
      },
    });
    expect(enriched?.fields.email).toBe("partnerships@acme.com");
    expect(enriched?.contactability?.channels.email.status).toBe("VERIFIED");
    expect(enriched?.contactability?.channels.email.provider).toBe("hunter");
  });

  it("keeps a grounded email when a provider offers a different one", async () => {
    const [enriched] = await enrichRecords([record({ company_name: "Acme", email: "hello@acme.com" })], {
      now: NOW,
      timeoutMs: 1000,
      providers: {
        hunter: async () => [
          candidate({
            provider: "hunter",
            channel: "email",
            value: "other@acme.com",
            verificationStatus: "valid",
            sources: ["https://acme.com/team"],
            profile: { name: "Acme", company: "Acme", location: "", website: "https://acme.com" },
          }),
        ],
      },
    });
    expect(enriched?.fields.email).toBe("hello@acme.com");
    expect(enriched?.contactability?.channels.email.provider).toBe("research");
    expect(enriched?.contactability?.channels.email.verificationStatus).toBe("grounded");
  });

  it("rejects a guessed first.last address with no source", async () => {
    expect(isPatternGuess("jane.doe@acme.com", "Jane Doe")).toBe(true);
    const [enriched] = await enrichRecords([record({ company_name: "Acme", person_name: "Jane Doe" })], {
      now: NOW,
      timeoutMs: 1000,
      providers: {
        hunter: async () => [
          candidate({
            provider: "hunter",
            channel: "email",
            value: "jane.doe@acme.com",
            profile: { name: "Jane Doe", company: "Acme", location: "", website: "" },
          }),
        ],
      },
    });
    expect(enriched?.fields.email).toBeUndefined();
    expect(enriched?.contactability?.channels.email.status).toBe("NOT_FOUND");
  });
});

describe("identity matching", () => {
  it("accepts a GitHub profile when the name and company agree", async () => {
    expect(matchIdentity(
      { name: "Jane Doe", company: "Acme", location: "Delhi", website: "" },
      { name: "Jane Doe", company: "Acme", location: "Delhi", website: "" },
    )).toBe("accept");
    const [enriched] = await enrichRecords([record({ person_name: "Jane Doe", company_name: "Acme", location: "Delhi" }, "jane")], {
      now: NOW,
      timeoutMs: 1000,
      providers: {
        github: async () => [
          candidate({
            provider: "github",
            channel: "github",
            value: "https://github.com/janedoe",
            sourceUrl: "https://github.com/janedoe",
            profile: { name: "Jane Doe", company: "Acme", location: "Delhi", website: "" },
          }),
        ],
      },
    });
    expect(enriched?.fields.github).toBe("https://github.com/janedoe");
    expect(enriched?.contactability?.channels.github.status).toBe("IDENTITY_MATCHED");
  });

  it("rejects a same-name GitHub profile at a different company", async () => {
    expect(matchIdentity(
      { name: "Alex Kim", company: "Acme", location: "Delhi", website: "" },
      { name: "Alex Kim", company: "Other Labs", location: "Berlin", website: "" },
    )).toBe("reject");
    const [enriched] = await enrichRecords([record({ person_name: "Alex Kim", company_name: "Acme", location: "Delhi" }, "alex")], {
      now: NOW,
      timeoutMs: 1000,
      providers: {
        github: async () => [
          candidate({
            provider: "github",
            channel: "github",
            value: "https://github.com/alex-other",
            profile: { name: "Alex Kim", company: "Other Labs", location: "Berlin", website: "" },
          }),
        ],
      },
    });
    expect(enriched?.fields.github).toBeUndefined();
    expect(enriched?.contactability?.channels.github.status).toBe("NOT_FOUND");
  });

  it("holds a weak LinkedIn match for review instead of attaching it", async () => {
    expect(matchIdentity(
      { name: "Jane Doe", company: "Acme", location: "", website: "" },
      { name: "Jane Doe", company: "", location: "", website: "" },
    )).toBe("review");
    const [enriched] = await enrichRecords([record({ person_name: "Jane Doe", company_name: "Acme" }, "jane")], {
      now: NOW,
      timeoutMs: 1000,
      providers: {
        tavily: async () => [
          candidate({
            provider: "tavily",
            channel: "linkedin",
            value: "https://www.linkedin.com/in/jane-doe",
            pageText: "Jane Doe",
            profile: { name: "Jane Doe", company: "", location: "", website: "" },
          }),
        ],
      },
    });
    expect(enriched?.fields.linkedin).toBeUndefined();
    expect(enriched?.contactability?.channels.linkedin.status).toBe("NEEDS_REVIEW");
  });
});

describe("trust decisions", () => {
  it("scores a well supported record as high trust", () => {
    const book = emptyContactability(NOW);
    book.channels.email = { ...book.channels.email, value: "a@acme.com", status: "VERIFIED", confidence: 0.95 };
    book.channels.github = { ...book.channels.github, value: "https://github.com/acme", status: "IDENTITY_MATCHED", confidence: 0.9 };
    book.score = 0.9;
    const decision = deterministicTrust({ identityConfidence: 0.95, evidenceConfidence: 0.95, contactability: book, timestamp: NOW });
    expect(decision.status).toBe("HIGH_TRUST");
    expect(decision.overallTrust).toBeGreaterThanOrEqual(0.85);
  });

  it("scores a thin record as low trust", () => {
    const decision = deterministicTrust({
      identityConfidence: 0.2,
      evidenceConfidence: 0.2,
      contactability: emptyContactability(NOW),
      timestamp: NOW,
    });
    expect(decision.status).toBe("UNTRUSTED");
    expect(decision.overallTrust).toBeLessThan(0.45);
  });

  it("keeps a high-trust decision from Jev", async () => {
    const jev: TrustProvider = {
      id: "jev",
      model: "typesafe/jev-1.13",
      decide(input): TrustDecision {
        return { ...deterministicTrust(input, "jev", "typesafe/jev-1.13"), status: "HIGH_TRUST", overallTrust: 0.96 };
      },
    };
    const [enriched] = await enrichRecords([record({ company_name: "Acme", email: "hello@acme.com" })], { now: NOW, timeoutMs: 1000, trust: jev });
    expect(enriched?.trust?.provider).toBe("jev");
    expect(enriched?.trust?.status).toBe("HIGH_TRUST");
    expect(enriched?.trust?.overallTrust).toBe(0.96);
  });

  it("keeps a low-trust decision from Jev", async () => {
    const jev: TrustProvider = {
      id: "jev",
      model: "typesafe/jev-1.13",
      decide(input): TrustDecision {
        return { ...deterministicTrust(input, "jev", "typesafe/jev-1.13"), status: "UNTRUSTED", overallTrust: 0.22 };
      },
    };
    const [enriched] = await enrichRecords([record({ company_name: "Acme" })], { now: NOW, timeoutMs: 1000, trust: jev });
    expect(enriched?.trust?.status).toBe("UNTRUSTED");
    expect(enriched?.fields.company_name).toBe("Acme");
  });

  it("falls back when the trust provider is unavailable", async () => {
    const down: TrustProvider = {
      id: "jev",
      model: "typesafe/jev-1.13",
      decide() {
        throw new Error("offline");
      },
    };
    const decision = await evaluateTrust(down, {
      identityConfidence: 0.95,
      evidenceConfidence: 0.95,
      contactability: emptyContactability(NOW),
      timestamp: NOW,
    });
    expect(decision.provider).toBe("mock");
    expect(decision.model).toBe("deterministic-fallback");
    expect(decision.status).toBe("MEDIUM_TRUST");
    expect(decision.overallTrust).toBeGreaterThanOrEqual(0.65);
  });
});

describe("provider failures and demo mode", () => {
  it.each(["hunter", "github", "pdl", "apollo"] as const)("keeps the record when %s fails", async (name) => {
    const [enriched] = await enrichRecords([record({ company_name: "Acme" })], {
      now: NOW,
      timeoutMs: 1000,
      providers: { [name]: async () => { throw new Error("down"); } },
    });
    expect(enriched?.fields.company_name).toBe("Acme");
    expect(enriched?.contactability?.status).toBe("NONE");
  });

  it("keeps the record when Hunter, GitHub, PDL, and Apollo all fail", async () => {
    const boom = async () => {
      throw new Error("down");
    };
    const [enriched] = await enrichRecords([record({ company_name: "Acme" })], {
      now: NOW,
      timeoutMs: 1000,
      providers: { hunter: boom, github: boom, pdl: boom, apollo: boom },
    });
    expect(enriched?.fields.company_name).toBe("Acme");
    expect(enriched?.contactability?.status).toBe("NONE");
    expect(enriched?.trust?.status).toBeTruthy();
  });

  it("does not call providers in demo mode", async () => {
    const hunter = vi.fn(async () => []);
    const [enriched] = await enrichRecords([record({ company_name: "Acme", email: "hello@acme.com" })], {
      demo: true,
      now: NOW,
      timeoutMs: 1000,
      providers: { hunter },
    });
    expect(hunter).not.toHaveBeenCalled();
    expect(enriched?.contactability?.channels.email.status).toBe("VERIFIED");
    expect(enriched?.contactability?.channels.email.value).toBe("hello@acme.com");
  });

  it("enriches a repeated entity once", async () => {
    let calls = 0;
    const github = async () => {
      calls += 1;
      return [
        candidate({
          provider: "github",
          channel: "github",
          value: "https://github.com/acme",
          profile: { name: "Acme", company: "Acme", location: "", website: "" },
        }),
      ];
    };
    const enriched = await enrichRecords(
      [record({ company_name: "Acme" }, "acme"), record({ company_name: "Acme" }, "acme")],
      { now: NOW, timeoutMs: 1000, providers: { github } },
    );
    expect(calls).toBe(1);
    expect(enriched.every((item) => item.fields.github === "https://github.com/acme")).toBe(true);
  });

  it("uses the provider cache on a second lookup", async () => {
    let calls = 0;
    const cache = new Map<string, ProviderCandidate[]>();
    const github = async () => {
      calls += 1;
      return [
        candidate({
          provider: "github",
          channel: "github",
          value: "https://github.com/acme",
          profile: { name: "Acme", company: "Acme", location: "", website: "" },
        }),
      ];
    };
    const options = {
      now: NOW,
      timeoutMs: 1000,
      providers: { github },
      cache: {
        get: (key: string) => cache.get(key) ?? null,
        set: (key: string, value: ProviderCandidate[]) => cache.set(key, value),
      },
    };
    await enrichRecords([record({ company_name: "Acme" })], options);
    await enrichRecords([record({ company_name: "Acme" }, "acme-2")], options);
    expect(calls).toBe(1);
    expect(cache.size).toBe(1);
  });
});

describe("reruns", () => {
  it("keeps the canonical entity id, so outreach and notes still attach after a rerun", async () => {
    const [enriched] = await enrichRecords([record({ company_name: "Acme" })], { now: NOW, timeoutMs: 1000, demo: true });
    expect(enriched?.canonicalEntityId).toBe("acme");
  });

  it("treats a newly found GitHub path as a field change and leaves outreach data alone", () => {
    const diff = diffDatasets({
      previous: [{ canonicalEntityId: "acme", fields: { company_name: "Acme", email: "hello@acme.com" } }],
      current: [{ canonicalEntityId: "acme", fields: { company_name: "Acme", email: "hello@acme.com", github: "https://github.com/acme" } }],
      compareFields: ["company_name", "email", "github"],
    });
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.fields).toEqual([{ field: "github", from: "", to: "https://github.com/acme" }]);
    expect(diff.changed[0]?.fields.some((field) => field.field === "email")).toBe(false);
  });
});
