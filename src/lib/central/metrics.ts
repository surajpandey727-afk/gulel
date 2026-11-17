import { computeRow, type Index } from "./compute";
import type { RefItem, Row } from "./types";

/**
 * India vs Global summary of the Central Repository. One pure function shared by the board dashboard,
 * the Central Repository dashboard and Overview, so every page shows the same numbers.
 * Global never includes India: pipeline/partner rows come from the market's own sheet, and organisations,
 * contacts and projects are split by their country's market.
 */
export type MarketId = "IN" | "GL";

export interface MarketSummary {
  market: MarketId;
  label: string;
  opportunities: number;
  openOpportunities: number;
  wonOpportunities: number;
  openValue: { currency: string; amount: number }[];
  qualified: number;
  toQualify: number;
  partners: number;
  activePartners: number;
  organisations: number;
  contacts: number;
  activeProjects: number;
  dueSoon: number;
  overdue: number;
  withNotes: number;
  byStage: { item: RefItem; count: number }[];
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const today = () => new Date().toISOString().slice(0, 10);
const plus7 = () => new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

export function orgMarket(idx: Index, org: Row | null | undefined): MarketId | null {
  if (!org) return null;
  const m = idx.refs.get("Country")?.get(str(org.data.country_id))?.market_id;
  return m === "IN" ? "IN" : m ? "GL" : null;
}

export function isOpen(idx: Index, list: string, id: unknown) {
  return idx.refs.get(list)?.get(str(id))?.is_open !== false;
}

export function marketSummary(idx: Index, market: MarketId): MarketSummary {
  const suffix = market === "IN" ? "India" : "Global";
  const rows = (n: string) => idx.bySheet.get(n) ?? [];
  const pipe = rows(`Pipeline_${suffix}`);
  const partners = rows(`Partners_${suffix}`);
  const t = today(), in7 = plus7();

  const open = pipe.filter((r) => isOpen(idx, "Stage", r.data.stage_id));
  const value = new Map<string, number>();
  for (const r of open) {
    const v = Number(computeRow(idx, r).value) || 0;
    if (!v) continue;
    const cur = str(r.data.currency_id) || (market === "IN" ? "INR" : "GBP");
    value.set(cur, (value.get(cur) ?? 0) + v);
  }
  const orgs = rows("Organisations").filter((o) => str(o.data.archived).toUpperCase() !== "Y" && orgMarket(idx, o) === market);
  const orgKeys = new Set(orgs.map((o) => o.row_key));
  const contacts = rows("Contacts").filter((c) => {
    const m = idx.refs.get("Country")?.get(str(c.data.country_id))?.market_id;
    if (m) return (m === "IN" ? "IN" : "GL") === market;
    return orgKeys.has(str(c.data.org_id));
  });
  const projects = rows("Projects").filter((p) => p.data.status_id === "AC" && orgKeys.has(str(p.data.org_id)));
  const nextDates = [
    ...open.map((r) => str(r.data.next_date)),
    ...partners.filter((r) => isOpen(idx, "PStage", r.data.stage_id)).map((r) => str(r.data.next_date)),
  ].filter(Boolean);

  return {
    market,
    label: market === "IN" ? "India" : "Global",
    opportunities: pipe.length,
    openOpportunities: open.length,
    wonOpportunities: pipe.filter((r) => /^won$/i.test(idx.refs.get("Stage")?.get(str(r.data.stage_id))?.name ?? "")).length,
    openValue: [...value].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
    qualified: pipe.filter((r) => r.data.qualification === "Qualified").length,
    toQualify: pipe.filter((r) => !r.data.qualification || r.data.qualification === "To be qualified").length,
    partners: partners.length,
    activePartners: partners.filter((r) => isOpen(idx, "PStage", r.data.stage_id)).length,
    organisations: orgs.length,
    contacts: contacts.length,
    activeProjects: projects.length,
    dueSoon: nextDates.filter((d) => d >= t && d <= in7).length,
    overdue: nextDates.filter((d) => d < t).length,
    withNotes: [...pipe, ...partners].filter((r) => str(r.data.notes).trim()).length,
    byStage: (idx.refList.get("Stage") ?? []).map((item) => ({ item, count: pipe.filter((r) => r.data.stage_id === item.item_id).length })),
  };
}

export const CURRENCY_SIGN: Record<string, string> = { GBP: "£", INR: "₹", USD: "$", EUR: "€", AUD: "A$" };
export const money = (cur: string, n: number) => `${CURRENCY_SIGN[cur] ?? `${cur} `}${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
