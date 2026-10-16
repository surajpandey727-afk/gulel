import Link from "next/link";
import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { relTime, resolveFilters, type SearchParams } from "@/lib/filters";
import { BAND_LABEL } from "@/lib/scoring/model";
import { EmptyState } from "@/components/neo/surface";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { GlobalFilters } from "@/components/shell/filters";
import { BandFilter } from "./band-filter";

export const metadata = { title: "Qualification" };

export default async function QualificationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const f = await resolveFilters(Promise.resolve(sp));
  const band = typeof sp.band === "string" ? sp.band : "all";
  const s = await getSession();
  const supabase = await createClient();
  let q = supabase.from("lead_qualifications").select("id, organisation_id, score, override_score, band, coverage, evidence_confidence, engagement_propensity, affordability, critical_unknowns, explanation, created_at, organisations!inner(trading_name, primary_market, sector, is_demo, relationship_status)").eq("workspace_id", s.workspaceId).eq("is_current", true).order("score", { ascending: false }).limit(300);
  if (band !== "all") q = q.eq("band", band);
  if (f.market) q = q.eq("organisations.primary_market", f.market);
  const [{ data }, { count: unqualified }, { data: risks }] = await Promise.all([
    q,
    supabase.from("organisations").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspaceId).is("deleted_at", null),
    supabase.from("organisation_risk_flags").select("organisation_id").eq("workspace_id", s.workspaceId).eq("status", "needs_review"),
  ]);
  const riskOrgs = new Set((risks ?? []).map((r) => r.organisation_id));
  return (
    <>
      <AnimatedPageHeader title="Qualification" description="Explainable scores with separate confidence, coverage, propensity and risk. Scores are operating thresholds, not validated classifications."
        actions={<><GlobalFilters showRange={false} /><BandFilter value={band} /></>} />
      {!data?.length ? <EmptyState icon={<ListChecks className="h-5 w-5" />} title="Nothing qualified yet" body={`${unqualified ?? 0} organisations on file. Open a dossier, add evidence, and run qualification.`} /> : (
        <Table>
          <thead><tr><Th>Organisation</Th><Th>Market</Th><Th className="text-right">Score</Th><Th>Band</Th><Th className="text-right">Coverage</Th><Th className="text-right">Confidence</Th><Th>Propensity*</Th><Th>Affordability</Th><Th>Unknowns</Th><Th>Risk</Th><Th>Scored</Th></tr></thead>
          <tbody>{data.map((r) => {
            const o = r.organisations as unknown as { trading_name: string; primary_market: string; is_demo: boolean };
            return (
              <Tr key={r.id}>
                <Td><Link href={`/organisations/${r.organisation_id}`} className="font-medium text-ink hover:text-oxblood">{o.trading_name}</Link>{o.is_demo && <Badge tone="muted" icon={false} className="ml-2">demo</Badge>}<span className="block max-w-xs truncate text-xs text-ink-3">{(r.explanation as { why_now?: string }).why_now}</span></Td>
                <Td><MarketBadge market={o.primary_market} /></Td>
                <Td className="tabular text-right text-base font-semibold text-ink">{Math.round(Number(r.override_score ?? r.score))}{r.override_score != null && <span className="block text-[0.65rem] font-normal text-ink-3">override</span>}</Td>
                <Td className="whitespace-nowrap">{BAND_LABEL[r.band]}</Td>
                <Td className="tabular text-right">{Math.round(Number(r.coverage) * 100)}%</Td>
                <Td className="tabular text-right">{Math.round(Number(r.evidence_confidence) * 100)}%</Td>
                <Td className="capitalize">{r.engagement_propensity}</Td>
                <Td className="capitalize">{r.affordability}</Td>
                <Td className="tabular">{(r.critical_unknowns as string[]).length}</Td>
                <Td>{riskOrgs.has(r.organisation_id) ? <Badge tone="warning">review</Badge> : "—"}</Td>
                <Td className="text-xs text-ink-3">{relTime(r.created_at)}</Td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-ink-3">* Engagement propensity is an initial heuristic, not a calibrated probability. It will be calibrated once enough outreach outcomes exist.</p>
    </>
  );
}
