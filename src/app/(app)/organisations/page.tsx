import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { resolveFilters, type SearchParams, relTime } from "@/lib/filters";
import { BAND_LABEL } from "@/lib/scoring/model";
import { EmptyState } from "@/components/neo/surface";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { GlobalFilters } from "@/components/shell/filters";
import { SearchBox } from "@/components/shell/search-box";
import { ButtonLink } from "@/components/neo/button";
import { NewOrganisationButton } from "./new-organisation";
import { BulkDiscoverButton } from "./bulk-discover";
import { EnrichAllButton } from "./enrich-all";

export const metadata = { title: "Organisations" };

export default async function OrganisationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const f = await resolveFilters(Promise.resolve(sp));
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const view = sp.view === "archived" || sp.view === "deleted" ? sp.view : "active";
  const session = await getSession();
  const supabase = await createClient();
  let query = supabase
    .from("organisations")
    .select("id, trading_name, primary_market, sector, relationship_status, updated_at, is_demo, needs, cr_key, archived_at, lead_qualifications(score, override_score, band, coverage, is_current), contact_organisations(count), contact_channels(channel, value, contact_id)")
    .eq("workspace_id", session.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (view === "deleted") query = query.not("deleted_at", "is", null);
  else {
    query = query.is("deleted_at", null);
    query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  }
  if (f.market) query = query.eq("primary_market", f.market);
  if (q) query = query.ilike("trading_name", `%${q}%`);
  const { data: orgs } = await query;

  const rows = (orgs ?? []).map((o) => {
    const cur = (o.lead_qualifications as Array<{ score: number; override_score: number | null; band: string; coverage: number; is_current: boolean }>).find((x) => x.is_current);
    const linkedin = (o.contact_channels as Array<{ channel: string; value: string; contact_id: string | null }>).find((c) => c.channel === "linkedin" && !c.contact_id)?.value ?? null;
    return { ...o, cur, linkedin, contacts: (o.contact_organisations as unknown as Array<{ count: number }>)[0]?.count ?? 0 };
  });

  return (
    <>
      <AnimatedPageHeader title="Organisations" description="One canonical record per company, with a profile per market."
        actions={<><GlobalFilters showRange={false} /><EnrichAllButton /><BulkDiscoverButton /><NewOrganisationButton /></>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search organisations…" />
        <nav aria-label="Organisation status" className="flex items-center gap-1 rounded-full neo-inset-sm p-1">
          {(["active", "archived", "deleted"] as const).map((v) => (
            <Link key={v} href={v === "active" ? "/organisations" : `/organisations?view=${v}`} aria-current={view === v ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-shadow", view === v ? "neo-raised-sm text-ink" : "text-ink-3 hover:text-ink")}>{v === "active" ? "Working" : v}</Link>
          ))}
        </nav>
        <span className="text-xs text-ink-3">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Building2 className="h-5 w-5" />} title={q ? "No matches" : view === "archived" ? "Nothing archived" : view === "deleted" ? "Nothing deleted" : "No organisations yet"}
          body="Import your workbook of UK and India companies, or add one manually."
          action={<div className="flex gap-2"><ButtonLink href="/data" variant="primary" size="sm">Import workbook</ButtonLink><NewOrganisationButton small /></div>} />
      ) : (
        <>
          <Table className="hidden md:block">
            <thead><tr><Th>Organisation</Th><Th>LinkedIn</Th><Th>Market</Th><Th>Sector</Th><Th className="text-right">Score</Th><Th>Band</Th><Th className="text-right">Coverage</Th><Th className="text-right">People</Th><Th>Relationship</Th><Th>Updated</Th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <Tr key={o.id}>
                  <Td><Link href={`/organisations/${o.id}`} className="font-medium text-ink hover:text-oxblood">{o.trading_name}</Link>{o.is_demo && <Badge tone="muted" icon={false} className="ml-2">demo</Badge>}{o.cr_key && <span className="ml-2 font-mono text-[0.6875rem] text-ink-3">{o.cr_key}</span>}</Td>
                  <Td>{o.linkedin ? <a href={o.linkedin} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-oxblood">Open<ExternalLink className="h-3 w-3" aria-hidden /></a> : <span className="text-xs text-ink-3">—</span>}</Td>
                  <Td><MarketBadge market={o.primary_market} /></Td>
                  <Td className="max-w-40 truncate">{o.sector ?? "—"}</Td>
                  <Td className="tabular text-right font-semibold text-ink">{o.cur ? Math.round(Number(o.cur.override_score ?? o.cur.score)) : "—"}</Td>
                  <Td>{o.cur ? BAND_LABEL[o.cur.band] : <span className="text-ink-3">Not qualified</span>}</Td>
                  <Td className="tabular text-right">{o.cur ? `${Math.round(Number(o.cur.coverage) * 100)}%` : "—"}</Td>
                  <Td className="tabular text-right">{o.contacts}</Td>
                  <Td className="capitalize">{o.relationship_status.replace(/_/g, " ")}</Td>
                  <Td className="text-xs text-ink-3">{relTime(o.updated_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((o) => (
              <li key={o.id}>
                <Link href={`/organisations/${o.id}`} className="flex items-center gap-3 rounded-neo-lg neo-raised-sm p-4">
                  <span className="tabular grid h-12 w-12 shrink-0 place-items-center rounded-full neo-inset-sm font-semibold text-oxblood">{o.cur ? Math.round(Number(o.cur.override_score ?? o.cur.score)) : "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.trading_name}</span>
                    <span className="block truncate text-xs text-ink-3">{o.sector ?? "Sector unknown"} · {o.contacts} people</span>
                  </span>
                  <MarketBadge market={o.primary_market} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
