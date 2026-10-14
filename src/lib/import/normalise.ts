import { normaliseEmail } from "@/lib/contacts/email-quality";

const LEGAL_SUFFIXES = [
  "private limited", "pvt ltd", "pvt. ltd.", "pvt. ltd", "pvt ltd.", "private ltd", "limited", "ltd", "ltd.", "plc",
  "llp", "llc", "inc", "inc.", "incorporated", "corporation", "corp", "co.", "company", "gmbh", "sa", "bv",
  "(opc)", "opc", "group", "holdings",
];

/** Lower-cased, punctuation-free, legal-suffix-stripped name used for entity resolution. */
export function normaliseCompanyName(raw: string): string {
  let s = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ");
  s = s.replace(/[“”"'’`]/g, "").replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, -suf.length - 1).trim().replace(/[,.\-]+$/, "").trim();
        changed = true;
      }
    }
  }
  return s.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Bare registrable-ish domain from a URL, domain or email. */
export function normaliseDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  if (s.includes("@") && !s.includes("/")) s = s.split("@")[1];
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\d?\./, "").split(/[/?#:]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

export function normaliseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function normaliseLinkedIn(raw: string | null | undefined): string | null {
  const u = normaliseUrl(raw);
  if (!u || !/linkedin\.com\/(in|company)\//i.test(u)) return null;
  return u.split("?")[0].replace(/\/$/, "");
}

const MARKET_ALIASES: Record<string, "UK" | "IN"> = {
  uk: "UK", "u.k.": "UK", gb: "UK", gbr: "UK", "great britain": "UK", "united kingdom": "UK", england: "UK",
  scotland: "UK", wales: "UK", "northern ireland": "UK", london: "UK", manchester: "UK", birmingham: "UK",
  in: "IN", ind: "IN", india: "IN", bharat: "IN", mumbai: "IN", delhi: "IN", "new delhi": "IN", bengaluru: "IN",
  bangalore: "IN", chennai: "IN", hyderabad: "IN", pune: "IN", kolkata: "IN", gurugram: "IN", gurgaon: "IN", noida: "IN",
};

export function detectMarket(...hints: Array<string | null | undefined>): "UK" | "IN" | null {
  for (const h of hints) {
    if (!h) continue;
    const s = h.trim().toLowerCase();
    if (MARKET_ALIASES[s]) return MARKET_ALIASES[s];
    for (const [alias, m] of Object.entries(MARKET_ALIASES)) {
      if (alias.length > 3 && s.includes(alias)) return m;
    }
    if (/\+44|\.co\.uk$|\.uk$/.test(s)) return "UK";
    if (/\+91|\.co\.in$|\.in$/.test(s)) return "IN";
  }
  return null;
}

export function normalisePhone(raw: string | null | undefined, market: "UK" | "IN" | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    if (market === "UK" && d.startsWith("0")) d = "+44" + d.slice(1);
    else if (market === "IN" && d.length === 10) d = "+91" + d;
    else if (market === "IN" && d.startsWith("0")) d = "+91" + d.slice(1);
  }
  return d.replace(/\D/g, "").length >= 8 ? d : null;
}

export function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.replace(/\b(mr|mrs|ms|miss|dr|prof)\.?\s+/i, "").trim().split(/\s+/);
  if (!parts[0]) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : null };
}

export function normalisePersonName(raw: string): string {
  return raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

export type RoleCategory =
  | "founder" | "ceo_md" | "cco" | "cmo" | "head_strategy" | "brand_director" | "marketing_director"
  | "growth_director" | "bu_director" | "other_senior" | "other";

const ROLE_RULES: Array<[RegExp, RoleCategory, number]> = [
  [/\b(co-?founder|founder)\b/i, "founder", 95],
  [/\b(ceo|chief executive|managing director|\bmd\b)/i, "ceo_md", 90],
  [/\b(cco|chief commercial)/i, "cco", 92],
  [/\b(cmo|chief marketing|chief brand)/i, "cmo", 95],
  [/\b(head of strategy|strategy director|chief strategy|cso)\b/i, "head_strategy", 90],
  [/\bbrand (director|head|lead)|head of brand/i, "brand_director", 88],
  [/\bmarketing (director|head)|head of marketing|vp marketing/i, "marketing_director", 82],
  [/\bgrowth (director|head|lead)|head of growth|chief growth/i, "growth_director", 80],
  [/\b(business unit|bu head|general manager|country manager|country head)/i, "bu_director", 75],
  [/\b(director|vp|vice president|head|chief|partner|president)\b/i, "other_senior", 55],
];

/** Buyer relevance favours the strategic buyer (brand/commercial) over generic seniority. */
export function classifyTitle(title: string | null | undefined): { category: RoleCategory; relevance: number } {
  if (!title) return { category: "other", relevance: 20 };
  for (const [re, cat, rel] of ROLE_RULES) if (re.test(title)) return { category: cat, relevance: rel };
  return { category: "other", relevance: 25 };
}

export { normaliseEmail };
