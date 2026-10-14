export interface CampaignConfig {
  industries?: string[];
  sub_industries?: string[];
  keywords?: string[];
  excluded_keywords?: string[];
  excluded_industries?: string[];
  negative_fit?: string;
  services?: string[];
  company_size?: string;
  revenue_band?: string;
  maturity?: string;
  sic_codes?: string[];
  incorporated_from?: string;
  location?: string;
}

/** Deterministic exclusion filter applied after every source, regardless of what the source returned. */
export function passesExclusions(c: { name: string; claim_text: string; domain?: string | null; raw?: Record<string, unknown> }, cfg: CampaignConfig): boolean {
  const hay = `${c.name} ${c.claim_text} ${c.domain ?? ""} ${JSON.stringify(c.raw ?? {})}`.toLowerCase();
  for (const k of cfg.excluded_keywords ?? []) if (k.trim() && hay.includes(k.trim().toLowerCase())) return false;
  for (const k of cfg.excluded_industries ?? []) if (k.trim() && hay.includes(k.trim().toLowerCase())) return false;
  return true;
}

export const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function normaliseUrlForCompare(u: string) {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}
