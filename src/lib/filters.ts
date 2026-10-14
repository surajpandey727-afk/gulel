export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface ResolvedFilters {
  market: "UK" | "IN" | null;
  from: Date;
  to: Date;
  rangeLabel: string;
  includeDemo: boolean;
}

const RANGES: Record<string, { days: number; label: string }> = {
  "1d": { days: 1, label: "Today" },
  "7d": { days: 7, label: "Last 7 days" },
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
};

export async function resolveFilters(sp: SearchParams): Promise<ResolvedFilters> {
  const p = await sp;
  const m = typeof p.m === "string" ? p.m : "ALL";
  const r = typeof p.r === "string" && RANGES[p.r] ? p.r : "30d";
  const to = new Date();
  const from = new Date(to);
  if (r === "1d") from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - RANGES[r].days);
  return { market: m === "UK" || m === "IN" ? m : null, from, to, rangeLabel: RANGES[r].label, includeDemo: p.demo === "1" };
}

export function money(amount: number | null | undefined, currency: "GBP" | "INR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-IN", { style: "currency", currency, maximumFractionDigits: 0, notation: amount >= 10_000_000 ? "compact" : "standard" }).format(amount);
}

export function pct(v: number | null | undefined) {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

export function fmtDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
