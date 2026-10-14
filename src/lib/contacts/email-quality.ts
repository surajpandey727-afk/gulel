/**
 * Founder rule: always prefer named individuals' business emails over role inboxes
 * (info@, hello@, …) — role inboxes have materially lower response rates.
 */
export type EmailQuality = "personal_named" | "personal_unknown" | "role_generic" | "free_mail";

const ROLE_LOCAL_PARTS = new Set([
  "info", "hello", "hi", "contact", "contactus", "enquiries", "enquiry", "inquiries", "inquiry", "sales",
  "admin", "office", "team", "support", "mail", "email", "marketing", "hr", "careers", "jobs", "press",
  "media", "pr", "accounts", "billing", "finance", "help", "general", "reception", "noreply", "no-reply",
  "donotreply", "webmaster", "business", "partnerships", "partners", "connect", "care", "customercare",
  "service", "services", "orders", "studio", "hq", "india", "uk", "london", "mumbai", "delhi", "bangalore",
]);

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "outlook.com", "hotmail.com",
  "hotmail.co.uk", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "rediffmail.com", "zoho.com", "gmx.com", "yandex.com",
]);

export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/[<>"']/g, "");
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : null;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

export function classifyEmail(email: string, firstName?: string | null, lastName?: string | null): EmailQuality {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain) return "role_generic";
  const base = local.split("+")[0];
  if (ROLE_LOCAL_PARTS.has(base) || ROLE_LOCAL_PARTS.has(base.replace(/[._-]/g, ""))) return "role_generic";
  if (FREE_MAIL_DOMAINS.has(domain)) return "free_mail";

  const tokens = base.split(/[._-]+/).filter(Boolean);
  const first = firstName ? fold(firstName) : "";
  const last = lastName ? fold(lastName) : "";
  const flat = fold(base);
  if (first && first.length >= 2) {
    if (tokens.some((t) => fold(t) === first) || flat.startsWith(first) || (last && flat.includes(last))) {
      return "personal_named";
    }
    // initial + surname, e.g. pshah@
    if (last && last.length >= 3 && flat === first[0] + last) return "personal_named";
  }
  // first.last shape without a known name still looks like a person
  if (tokens.length === 2 && tokens.every((t) => /^[a-z]{2,}$/.test(t))) return "personal_unknown";
  return "personal_unknown";
}

const QUALITY_RANK: Record<EmailQuality, number> = {
  personal_named: 0,
  personal_unknown: 1,
  free_mail: 2,
  role_generic: 3,
};
const VERIFICATION_RANK: Record<string, number> = { verified: 0, candidate: 1, missing: 2, invalid: 9 };

export interface RankableEmail {
  value: string;
  email_quality: EmailQuality | null;
  verification_status: string;
  bounced_at?: string | null;
}

/** Best recipient first: named person > unknown person > free mail > role inbox; then verification. */
export function rankEmails<T extends RankableEmail>(emails: T[]): T[] {
  return [...emails]
    .filter((e) => e.verification_status !== "invalid" && !e.bounced_at)
    .sort(
      (a, b) =>
        QUALITY_RANK[a.email_quality ?? "personal_unknown"] - QUALITY_RANK[b.email_quality ?? "personal_unknown"] ||
        (VERIFICATION_RANK[a.verification_status] ?? 5) - (VERIFICATION_RANK[b.verification_status] ?? 5),
    );
}

export const EMAIL_QUALITY_LABEL: Record<EmailQuality, string> = {
  personal_named: "Named person",
  personal_unknown: "Personal (unmatched)",
  free_mail: "Free mail (possible individual)",
  role_generic: "Generic inbox",
};
