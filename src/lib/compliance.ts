/**
 * Deterministic direct-marketing eligibility. Configurable rules, not legal advice.
 * UK: PECR — unsolicited marketing email to INDIVIDUAL subscribers (incl. sole traders and some
 * partnerships) needs consent; corporate subscribers may be emailed under legitimate interests
 * with an opt-out. UK GDPR right to object is honoured via suppression.
 * India: DPDP Act 2023 — process business contact data for a specified purpose with notice;
 * honour withdrawal. Platform policies apply to LinkedIn (manual only).
 */
export interface ComplianceInput {
  channel: "gmail" | "linkedin";
  market: "UK" | "IN" | null;
  subscriberType: "corporate" | "individual" | "unknown";
  lawfulBasis: "legitimate_interest" | "consent" | "existing_relationship" | "none";
  emailQuality?: "personal_named" | "personal_unknown" | "role_generic" | "free_mail" | null;
  optedOut: boolean;
  suppressed: boolean;
  verification?: string | null;
}

export interface ComplianceResult {
  eligible: boolean;
  reasons: string[];
  warnings: string[];
}

export function evaluateCompliance(c: ComplianceInput): ComplianceResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (c.suppressed) reasons.push("Recipient, domain or organisation is on the suppression list.");
  if (c.optedOut) reasons.push("Contact has opted out.");
  if (c.lawfulBasis === "none") reasons.push("No lawful basis recorded for contacting this person.");
  if (c.channel === "gmail") {
    if (c.market !== "IN" && c.subscriberType === "individual" && c.lawfulBasis !== "consent") {
      reasons.push("PECR: individual subscriber (e.g. sole trader) without consent cannot receive unsolicited marketing email.");
    }
    if (c.subscriberType === "unknown") warnings.push("Recipient type unknown — confirm it is a corporate subscriber before sending.");
    if (c.emailQuality === "free_mail") warnings.push("Free-mail address — likely an individual subscriber; treat as such unless confirmed otherwise.");
    if (c.emailQuality === "role_generic") warnings.push("Generic role inbox (info@/hello@) — low response rates; prefer a named person.");
    if (c.verification && c.verification !== "verified") warnings.push("Email address is not verified — review before sending.");
    if (c.market === "IN") warnings.push("India (DPDP Act): include who you are and how to opt out; honour withdrawal promptly.");
    if (c.market !== "IN") warnings.push("Include a clear way to object to further contact.");
  }
  if (c.channel === "linkedin") warnings.push("LinkedIn: send manually within LinkedIn's User Agreement; no automation.");
  return { eligible: reasons.length === 0, reasons, warnings };
}
