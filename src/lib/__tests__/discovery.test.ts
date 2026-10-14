import { afterEach, describe, expect, it, vi } from "vitest";
import { advancedSearch, officerDisplayName, profileToFindings } from "@/lib/discovery/companies-house";
import { normaliseUrlForCompare, passesExclusions, splitList } from "@/lib/discovery/filters";
import { evaluateCompliance } from "@/lib/compliance";

describe("Companies House mapping", () => {
  it("formats officer names", () => {
    expect(officerDisplayName("GRANT, Amelia Rose")).toBe("Amelia Rose Grant");
  });
  it("records status and accounts as dated filings; no flags for a clean company", () => {
    const f = profileToFindings({ company_name: "TEST LTD", company_number: "01234567", company_status: "active", date_of_creation: "2015-03-01", accounts: { last_accounts: { made_up_to: "2025-12-31", type: "small" } } });
    expect(f.status).toBe("active");
    expect(f.evidence).toHaveLength(2);
    expect(f.flags).toHaveLength(0);
    expect(f.url).toContain("/company/01234567");
  });
  it("flags insolvency and overdue filings for human review", () => {
    const f = profileToFindings({ company_name: "X", company_number: "1", company_status: "liquidation", has_insolvency_history: true, accounts: { overdue: true } });
    expect(f.flags.map((x) => x.kind).sort()).toEqual(["dissolved", "filing_issue", "insolvency"]);
    expect(f.evidence.some((e) => e.is_adverse)).toBe(true);
  });
  describe("advanced search", () => {
    afterEach(() => { delete process.env.COMPANIES_HOUSE_API_KEY; });
    it("sends basic auth and filters, maps items", async () => {
      process.env.COMPANIES_HOUSE_API_KEY = "test-key";
      const f = vi.fn(async () => new Response(JSON.stringify({ items: [{ company_name: "A LTD", company_number: "9", company_status: "active" }] }), { status: 200 }));
      const items = await advancedSearch({ sicCodes: ["10890"], size: 5 }, f as unknown as typeof fetch);
      expect(items[0].company_number).toBe("9");
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("sic_codes=10890");
      expect(url).toContain("company_status=active");
      expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("test-key:").toString("base64")}`);
    });
    it("refuses to run without a key", async () => {
      await expect(advancedSearch({ size: 1 })).rejects.toThrow(/not configured/);
    });
  });
});

describe("discovery filters", () => {
  it("drops candidates matching exclusions", () => {
    const cfg = { excluded_keywords: ["agency"], excluded_industries: ["tobacco"] };
    expect(passesExclusions({ name: "Bright Creative Agency", claim_text: "" }, cfg)).toBe(false);
    expect(passesExclusions({ name: "Leaf Co", claim_text: "Tobacco distributor expands" }, cfg)).toBe(false);
    expect(passesExclusions({ name: "Kesar Valley", claim_text: "Enters RTD chai" }, cfg)).toBe(true);
  });
  it("normalises URLs for citation checks", () => {
    expect(normaliseUrlForCompare("https://www.Example.test/a/b/")).toBe(normaliseUrlForCompare("http://example.test/a/b"));
  });
  it("splits lists", () => expect(splitList("a, b\nc,,")).toEqual(["a", "b", "c"]));
});

describe("compliance", () => {
  const base = { channel: "gmail" as const, market: "UK" as const, subscriberType: "corporate" as const, lawfulBasis: "legitimate_interest" as const, optedOut: false, suppressed: false, verification: "verified" };
  it("allows a verified corporate subscriber", () => expect(evaluateCompliance(base).eligible).toBe(true));
  it("blocks PECR individual subscribers without consent", () => expect(evaluateCompliance({ ...base, subscriberType: "individual" }).eligible).toBe(false));
  it("allows individual subscribers who consented", () => expect(evaluateCompliance({ ...base, subscriberType: "individual", lawfulBasis: "consent" }).eligible).toBe(true));
  it("blocks opt-outs, suppression and no lawful basis", () => {
    expect(evaluateCompliance({ ...base, optedOut: true }).eligible).toBe(false);
    expect(evaluateCompliance({ ...base, suppressed: true }).eligible).toBe(false);
    expect(evaluateCompliance({ ...base, lawfulBasis: "none" }).eligible).toBe(false);
  });
  it("warns on generic inboxes and unverified addresses", () => {
    const r = evaluateCompliance({ ...base, emailQuality: "role_generic", verification: "candidate" });
    expect(r.eligible).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/Generic role inbox/);
    expect(r.warnings.join(" ")).toMatch(/not verified/);
  });
});
