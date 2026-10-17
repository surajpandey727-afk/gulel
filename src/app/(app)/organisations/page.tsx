import Link from "next/link";
import { Building2 } from "lucide-react";
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

export const metadata = { title: "Organisations" };

export default async function OrganisationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const f = await resolveFilters(Promise.resolve(sp));
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const session = await getSession();
  const supabase = await createClient();
  let query = supabase
    .from("organisations")
    .select("id, trading_name, primary_market, sector, relationship_status, updated_at, is_demo, needs, lead_qualifications(score, override_score, band, coverage, is_current), contact_organisations(count)")
    .eq("workspace_id", session.workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (f.market) query = query.eq("primary_market", f.market);
  if (q) query = query.ilike("trading_name", `%${q}%`);
  const { data: orgs } = await query;

  const rows = (orgs ?? []).map((o) => {
    const cur = (o.lead_qualifications as Array<{ score: number; override_score: number | null; band: string; coverage: number; is_current: boolean }>).find((x) => x.is_current);
    return { ...o, cur, contacts: (o.contact_organisations as unknown as Array<{ count: number }>)[0]?.count ?? 0 };
  });

  return (
    <>
      <AnimatedPageHeader title="Organisations" description="One canonical record per company, with a profile per market."
        actions={<><GlobalFilters showRange={false} /><BulkDiscoverButton /><NewOrganisationButton /></>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search organisations…" />
        <span className="text-xs text-ink-3">{rows.length} shown</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Building2 className="h-5 w-5" />} title={q ? "No matches" : "No organisations yet"}
          body="Import your workbook of UK and India companies, or add one manually."
          action={<div className="flex gap-2"><ButtonLink href="/data" variant="primary" size="sm">Import workbook</ButtonLink><NewOrganisationButton small /></div>} />
      ) : (
        <>
          <Table className="hidden md:block">
            <thead><tr><Th>Organisation</Th><Th>Market</Th><Th>Sector</Th><Th className="text-right">Score</Th><Th>Band</Th><Th className="text-right">Coverage</Th><Th className="text-right">People</Th><Th>Relationship</Th><Th>Updated</Th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <Tr key={o.id}>
                  <Td><Link href={`/organisations/${o.id}`} className="font-medium text-ink hover:text-oxblood">{o.trading_name}</Link>{o.is_demo && <Badge tone="muted" icon={false} className="ml-2">demo</Badge>}</Td>
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
