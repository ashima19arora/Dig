import { describe, expect, it } from "vitest";
import { bestSourcedEmail, hunterLinkedin, planHunterLookup } from "./hunter-plan.js";

describe("planHunterLookup", () => {
  it("does not spend a credit when research already has an email", () => {
    expect(planHunterLookup({
      name: "Jane Doe",
      company: "Acme",
      website: "https://acme.com",
      email: "jane@acme.com",
    })).toEqual({ action: "skip", reason: "has-email" });
  });

  it("asks the found-on-web finder for a named person at a company domain", () => {
    expect(planHunterLookup({
      name: "Alexis Ohanian",
      company: "Reddit",
      website: "https://www.reddit.com",
    })).toEqual({
      action: "person",
      domain: "reddit.com",
      first: "Alexis",
      last: "Ohanian",
      company: "Reddit",
    });
  });

  it("searches the company domain once when the row is the company itself", () => {
    expect(planHunterLookup({
      name: "Stripe",
      company: "Stripe",
      website: "https://stripe.com",
    })).toEqual({ action: "company", domain: "stripe.com", company: "Stripe" });
  });

  it("resolves a company name for free when research has no website", () => {
    expect(planHunterLookup({
      name: "Razorpay",
      company: "Razorpay",
      website: "",
    })).toEqual({ action: "company", domain: "", company: "Razorpay" });
  });

  it("keeps a person attached to their company when the only site is a directory", () => {
    expect(planHunterLookup({
      name: "Jane Doe",
      company: "Acme",
      website: "https://www.linkedin.com/in/janedoe",
    })).toEqual({
      action: "person",
      domain: "",
      first: "Jane",
      last: "Doe",
      company: "Acme",
    });
  });

  it("skips a webmail host with no company behind it", () => {
    expect(planHunterLookup({
      name: "Jane Doe",
      company: "",
      website: "gmail.com",
    })).toEqual({ action: "skip", reason: "webmail" });
  });

  it("does not treat a legal suffix as a person's last name", () => {
    expect(planHunterLookup({
      name: "Acme Inc",
      company: "",
      website: "https://acme.com",
    })).toEqual({ action: "company", domain: "acme.com", company: "Acme Inc" });
  });
});

describe("bestSourcedEmail", () => {
  it("drops an address with no source and prefers a verified one", () => {
    const picked = bestSourcedEmail([
      { value: "guess@acme.com", confidence: 99, verification: { status: "valid" }, sources: [] },
      {
        value: "ada@acme.com",
        confidence: 70,
        verification: { status: "accept_all" },
        sources: [{ uri: "https://acme.com/team" }],
      },
      {
        value: "grace@acme.com",
        confidence: 80,
        verification: { status: "valid" },
        sources: [{ uri: "https://acme.com/about" }],
      },
    ]);
    expect(picked?.value).toBe("grace@acme.com");
    expect(picked?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(picked?.sources).toEqual(["https://acme.com/about"]);
  });
});

describe("hunterLinkedin", () => {
  it("keeps a real profile URL and rejects a handle we would have to invent", () => {
    expect(hunterLinkedin("https://www.linkedin.com/in/janedoe")).toBe("https://www.linkedin.com/in/janedoe");
    expect(hunterLinkedin("janedoe")).toBeNull();
    expect(hunterLinkedin("http://linkedin.com/in/janedoe")).toBeNull();
  });
});
