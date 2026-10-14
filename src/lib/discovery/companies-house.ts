import "server-only";

/**
 * Companies House public data API (UK). Free key: developer.company-information.service.gov.uk
 * Auth: HTTP Basic with the key as username. Rate limit: 600 requests / 5 minutes.
 */
const BASE = "https://api.company-information.service.gov.uk";
export const CH_PUBLIC_URL = (n: string) => `https://find-and-update.company-information.service.gov.uk/company/${n}`;

export function companiesHouseConfigured() {
  return !!process.env.COMPANIES_HOUSE_API_KEY;
}

export class CompaniesHouseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function ch<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new CompaniesHouseError(0, "COMPANIES_HOUSE_API_KEY is not configured");
  const res = await fetchImpl(`${BASE}${path}`, { headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, accept: "application/json" } });
  if (res.status === 404) throw new CompaniesHouseError(404, "Not found at Companies House");
  if (!res.ok) throw new CompaniesHouseError(res.status, `Companies House returned ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ChSearchItem {
  company_name: string; company_number: string; company_status: string; date_of_creation?: string;
  sic_codes?: string[]; company_type?: string; registered_office_address?: { locality?: string; postal_code?: string };
}

export interface ChSearchParams { nameIncludes?: string; sicCodes?: string[]; incorporatedFrom?: string; incorporatedTo?: string; size: number; location?: string }

export async function advancedSearch(p: ChSearchParams, fetchImpl?: typeof fetch) {
  const q = new URLSearchParams({ company_status: "active", size: String(Math.min(p.size, 100)) });
  if (p.nameIncludes) q.set("company_name_includes", p.nameIncludes);
  if (p.sicCodes?.length) q.set("sic_codes", p.sicCodes.join(","));
  if (p.incorporatedFrom) q.set("incorporated_from", p.incorporatedFrom);
  if (p.incorporatedTo) q.set("incorporated_to", p.incorporatedTo);
  if (p.location) q.set("location", p.location);
  const r = await ch<{ items?: ChSearchItem[]; hits?: number }>(`/advanced-search/companies?${q}`, fetchImpl);
  return r.items ?? [];
}

export interface ChProfile {
  company_name: string; company_number: string; company_status: string; date_of_creation?: string; type?: string; sic_codes?: string[];
  has_insolvency_history?: boolean; has_charges?: boolean; registered_office_address?: { address_line_1?: string; locality?: string; postal_code?: string };
  accounts?: { overdue?: boolean; last_accounts?: { made_up_to?: string; type?: string }; next_due?: string };
  confirmation_statement?: { overdue?: boolean; last_made_up_to?: string };
}
export interface ChOfficer { name: string; officer_role: string; appointed_on?: string; resigned_on?: string; occupation?: string }

export const getProfile = (n: string, f?: typeof fetch) => ch<ChProfile>(`/company/${encodeURIComponent(n)}`, f);
export const getOfficers = (n: string, f?: typeof fetch) => ch<{ items?: ChOfficer[] }>(`/company/${encodeURIComponent(n)}/officers?items_per_page=50`, f).then((r) => r.items ?? []);

/** "SMITH, Jane Anne" → "Jane Anne Smith" */
export function officerDisplayName(raw: string) {
  const [last, rest] = raw.split(",").map((x) => x.trim());
  const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return rest ? `${title(rest)} ${title(last)}` : title(raw);
}

/** Pure mapping, unit-tested: registry facts → evidence + flags. */
export function profileToFindings(p: ChProfile) {
  const url = CH_PUBLIC_URL(p.company_number);
  const evidence: Array<{ claim_field: string; claim_text: string; value_as_of: string | null; is_adverse: boolean }> = [];
  const flags: Array<{ kind: "insolvency" | "filing_issue" | "dissolved"; severity: "warning" | "critical"; summary: string }> = [];
  evidence.push({ claim_field: "diligence.status", claim_text: `Companies House status: ${p.company_status}${p.date_of_creation ? `; incorporated ${p.date_of_creation}` : ""}${p.type ? `; type ${p.type}` : ""}${p.sic_codes?.length ? `; SIC ${p.sic_codes.join(", ")}` : ""}`, value_as_of: p.date_of_creation ?? null, is_adverse: false });
  if (p.accounts?.last_accounts?.made_up_to) {
    evidence.push({ claim_field: "diligence.status", claim_text: `Latest filed accounts: ${p.accounts.last_accounts.type?.replace(/-/g, " ") ?? "unknown type"} made up to ${p.accounts.last_accounts.made_up_to}`, value_as_of: p.accounts.last_accounts.made_up_to, is_adverse: false });
  }
  if (p.has_insolvency_history) {
    evidence.push({ claim_field: "diligence.adverse", claim_text: "Companies House records an insolvency history for this company", value_as_of: null, is_adverse: true });
    flags.push({ kind: "insolvency", severity: "critical", summary: "Insolvency history recorded at Companies House — review before any approach." });
  }
  if (p.accounts?.overdue || p.confirmation_statement?.overdue) {
    flags.push({ kind: "filing_issue", severity: "warning", summary: `Overdue at Companies House: ${[p.accounts?.overdue && "accounts", p.confirmation_statement?.overdue && "confirmation statement"].filter(Boolean).join(" and ")}.` });
  }
  if (["dissolved", "liquidation", "converted-closed"].includes(p.company_status)) {
    flags.push({ kind: "dissolved", severity: "critical", summary: `Company status is “${p.company_status}”.` });
  }
  const status = (["active", "dissolved", "liquidation", "dormant"].includes(p.company_status) ? p.company_status : "unknown") as "active" | "dissolved" | "liquidation" | "dormant" | "unknown";
  return { url, evidence, flags, status };
}
