import Link from "next/link";
import { PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { relTime, resolveFilters, type SearchParams } from "@/lib/filters";
import { EmptyState } from "@/components/neo/surface";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { MarketBadge, StatusBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { GlobalFilters } from "@/components/shell/filters";
import { ButtonLink } from "@/components/neo/button";

export const metadata = { title: "Outreach Studio" };

export default async function OutreachPage({ searchParams }: { searchParams: SearchParams }) {
  const f = await resolveFilters(searchParams);
  const s = await getSession();
  const supabase = await createClient();
  let q = supabase.from("outreach_drafts")
    .select("id, channel, kind, status, updated_at, organisations!inner(trading_name, primary_market), contacts(full_name), draft_versions!od_current_version_fk(subject, version_no, quality)")
    .eq("workspace_id", s.workspaceId).not("status", "in", "(archived,superseded)").order("updated_at", { ascending: false }).limit(200);
  if (f.market) q = q.eq("organisations.primary_market", f.market);
  const { data } = await q;

  return (
    <>
      <AnimatedPageHeader title="Outreach Studio" description="Every message must justify its existence. Drafts are prepared from evidence, in your voice, and never sent without approval." actions={<GlobalFilters showRange={false} />} />
      {!data?.length ? (
        <EmptyState icon={<PenLine className="h-5 w-5" />} title="No drafts yet" body="Open an organisation and choose “Prepare outreach”. Governance AI decides first whether an approach is justified." action={<ButtonLink href="/organisations" variant="primary" size="sm">Go to organisations</ButtonLink>} />
      ) : (
        <Table>
          <thead><tr><Th>Organisation</Th><Th>Recipient</Th><Th>Channel</Th><Th>Subject / type</Th><Th className="text-right">Tone</Th><Th>Factuality</Th><Th>Status</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {data.map((d) => {
              const o = d.organisations as unknown as { trading_name: string; primary_market: string };
              const v = d.draft_versions as unknown as { subject: string | null; version_no: number; quality: { tone_match?: number; factuality?: { status: string } } } | null;
              return (
                <Tr key={d.id}>
                  <Td><Link href={`/outreach/${d.id}`} className="font-medium text-ink hover:text-oxblood">{o.trading_name}</Link> <MarketBadge market={o.primary_market} /></Td>
                  <Td>{(d.contacts as unknown as { full_name: string } | null)?.full_name ?? "—"}</Td>
                  <Td className="capitalize">{d.channel}</Td>
                  <Td className="max-w-xs truncate">{v?.subject || d.kind.replace(/_/g, " ")} <span className="text-xs text-ink-3">v{v?.version_no}</span></Td>
                  <Td className="tabular text-right">{v?.quality?.tone_match ?? "—"}</Td>
                  <Td>{v?.quality?.factuality ? <StatusBadge status={v.quality.factuality.status === "pass" ? "verified" : "candidate"} label={v.quality.factuality.status} /> : "—"}</Td>
                  <Td><StatusBadge status={d.status === "awaiting_approval" ? "pending" : d.status} label={d.status.replace(/_/g, " ")} /></Td>
                  <Td className="text-xs text-ink-3">{relTime(d.updated_at)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
