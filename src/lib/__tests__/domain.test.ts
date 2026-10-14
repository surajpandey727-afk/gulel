import { describe, expect, it } from "vitest";
import { classifyEmail, rankEmails, normaliseEmail } from "@/lib/contacts/email-quality";
import { computeScore, validateWeights, DEFAULT_WEIGHTS, freshnessFactor } from "@/lib/scoring/model";
import { normaliseCompanyName, normaliseDomain, detectMarket, normalisePhone, classifyTitle } from "@/lib/import/normalise";
import { proposeMapping } from "@/lib/import/mapping";
import { resolveOrganisation, similarity } from "@/lib/import/resolve";

describe("email quality (founder rule: named people over role inboxes)", () => {
  it("classifies role inboxes", () => {
    for (const e of ["info@acme.co.uk", "hello@acme.in", "Contact@acme.com", "enquiries@acme.com", "sales@acme.com"])
      expect(classifyEmail(e.toLowerCase())).toBe("role_generic");
  });
  it("recognises the named contact", () => {
    expect(classifyEmail("priya.shah@acme.com", "Priya", "Shah")).toBe("personal_named");
    expect(classifyEmail("pshah@acme.com", "Priya", "Shah")).toBe("personal_named");
    expect(classifyEmail("priya@acme.com", "Priya", "Shah")).toBe("personal_named");
  });
  it("flags free mail", () => expect(classifyEmail("priya.shah@gmail.com", "Priya", "Shah")).toBe("free_mail"));
  it("ranks named > unknown > generic and drops invalid/bounced", () => {
    const ranked = rankEmails([
      { value: "info@acme.com", email_quality: "role_generic", verification_status: "verified" },
      { value: "j.doe@acme.com", email_quality: "personal_unknown", verification_status: "candidate" },
      { value: "priya@acme.com", email_quality: "personal_named", verification_status: "candidate" },
      { value: "old@acme.com", email_quality: "personal_named", verification_status: "verified", bounced_at: "2026-01-01" },
    ]);
    expect(ranked.map((r) => r.value)).toEqual(["priya@acme.com", "j.doe@acme.com", "info@acme.com"]);
  });
  it("normalises emails", () => {
    expect(normaliseEmail(" Mailto:Priya@Acme.COM ")).toBe("priya@acme.com");
    expect(normaliseEmail("not-an-email")).toBeNull();
  });
});

describe("qualification score", () => {
  it("default weights are valid", () => expect(validateWeights(DEFAULT_WEIGHTS)).toBeNull());
  it("rejects weights not summing to 100", () => expect(validateWeights({ ...DEFAULT_WEIGHTS, credibility: 10 })).toMatch(/sum to 100/));
  it("missing evidence is not scored as zero", () => {
    const r = computeScore([{ key: "strategic_need", raw: 9, confidence: 0.8 }, { key: "buying_intent", raw: 9, confidence: 0.8 }]);
    expect(r.score).toBe(90);
    expect(r.coverage).toBe(0.4);
    expect(r.unknown).toHaveLength(6);
  });
  it("stale evidence regresses toward neutral", () => {
    expect(freshnessFactor(180, 180)).toBeCloseTo(0.5);
    const fresh = computeScore([{ key: "trigger_strength", raw: 10, confidence: 1, evidenceAgeDays: 0 }]);
    const stale = computeScore([{ key: "trigger_strength", raw: 10, confidence: 1, evidenceAgeDays: 360 }]);
    expect(fresh.score).toBe(100);
    expect(stale.score).toBeCloseTo(62.5, 1);
  });
  it("assigns bands", () => {
    const all = (n: number) => computeScore(DEFAULT_WEIGHTS && (Object.keys(DEFAULT_WEIGHTS) as never[]).map((key) => ({ key, raw: n, confidence: 1 })));
    expect(all(9).band).toBe("priority_review");
    expect(all(7.5).band).toBe("qualified");
    expect(all(5.5).band).toBe("nurture");
    expect(all(2).band).toBe("low_priority");
  });
});

describe("normalisation", () => {
  it("strips legal suffixes", () => {
    expect(normaliseCompanyName("Acme Foods Private Limited")).toBe("acme foods");
    expect(normaliseCompanyName("ACME FOODS PVT. LTD.")).toBe("acme foods");
    expect(normaliseCompanyName("Smith & Sons Ltd")).toBe("smith and sons");
  });
  it("extracts domains", () => {
    expect(normaliseDomain("https://www.acme.co.uk/about")).toBe("acme.co.uk");
    expect(normaliseDomain("priya@acme.in")).toBe("acme.in");
    expect(normaliseDomain("n/a")).toBeNull();
  });
  it("detects markets", () => {
    expect(detectMarket("United Kingdom")).toBe("UK");
    expect(detectMarket(null, "Bengaluru, Karnataka")).toBe("IN");
    expect(detectMarket("acme.co.in")).toBe("IN");
  });
  it("normalises phones by market", () => {
    expect(normalisePhone("020 7946 0958", "UK")).toBe("+442079460958");
    expect(normalisePhone("98765 43210", "IN")).toBe("+919876543210");
  });
  it("prioritises the relevant buyer over generic seniority", () => {
    expect(classifyTitle("Chief Marketing Officer").relevance).toBeGreaterThan(classifyTitle("Vice President, Operations").relevance);
    expect(classifyTitle("Co-Founder & CEO").category).toBe("founder");
  });
});

describe("mapping proposal", () => {
  it("maps common headers and sniffs content", () => {
    const rows = [{ "Company": "Acme", "E-mail ID": "a@b.com", "Col3": "https://acme.com", "Designation": "CMO" }];
    const m = proposeMapping(Object.keys(rows[0]), rows);
    const f = Object.fromEntries(m.map((x) => [x.header, x.field]));
    expect(f).toMatchObject({ Company: "company_name", "E-mail ID": "email", Col3: "website", Designation: "title" });
  });
});

describe("entity resolution", () => {
  const existing = [
    { id: "1", normalisedName: "acme foods", domain: "acmefoods.co.uk", registrationNumber: "01234567", market: "UK" as const },
    { id: "2", normalisedName: "acme foods", domain: "acmefoods.in", registrationNumber: null, market: "IN" as const },
  ];
  it("auto-merges on registration number", () => {
    expect(resolveOrganisation({ normalisedName: "acme", domain: null, registrationNumber: "01234567", market: "UK" }, existing)).toMatchObject({ decision: "auto_merge", matchId: "1" });
  });
  it("auto-merges on domain", () => {
    expect(resolveOrganisation({ normalisedName: "acme food co", domain: "acmefoods.in", registrationNumber: null, market: "IN" }, existing)).toMatchObject({ decision: "auto_merge", matchId: "2" });
  });
  it("name-only similarity is proposed, never auto-merged", () => {
    const r = resolveOrganisation({ normalisedName: "acme foods", domain: null, registrationNumber: null, market: "UK" }, existing);
    expect(r.decision).toBe("propose");
  });
  it("conflicting domains are different entities", () => {
    const r = resolveOrganisation({ normalisedName: "acme foods", domain: "other.com", registrationNumber: null, market: "UK" }, existing);
    expect(r.decision).toBe("new");
  });
  it("similarity basics", () => expect(similarity("abc", "abc")).toBe(1));
});
