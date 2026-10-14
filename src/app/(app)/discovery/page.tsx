import { Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { PageHeader, Panel } from "@/components/neo/surface";
import { StatusBadge } from "@/components/neo/badge";
import { ButtonLink } from "@/components/neo/button";
import { NewOrganisationButton } from "../organisations/new-organisation";

export const metadata = { title: "Discovery" };

const ADAPTERS = [
  { key: "companies_house", name: "Companies House (UK)", note: "Free API key. Profile, officers, filings, charges, insolvency.", phase: 2 },
  { key: "mca", name: "MCA (India)", note: "No open API — needs a licensed data vendor (e.g. Tofler, Probe42) or manual entry.", phase: 2 },
  { key: "news", name: "News & publications", note: "Licensed news API or Claude web search with citations.", phase: 2 },
  { key: "contracts_finder", name: "Contracts Finder (UK tenders)", note: "Public API for procurement notices.", phase: 2 },
  { key: "meta_ads", name: "Meta Ad Library", note: "Requires identity-verified API access.", phase: 2 },
  { key: "google_ads", name: "Google Ads Transparency", note: "No official API — manual URL capture only.", phase: 2 },
  { key: "linkedin", name: "LinkedIn company pages", note: "Only user-supplied URLs; no scraping.", phase: 2 },
];

export default async function DiscoveryPage() {
  const s = await getSession();
  const supabase = await createClient();
  const { count } = await supabase.from("organisations").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspaceId).is("deleted_at", null);
  return (
    <>
      <PageHeader title="Discovery" description="Automated, campaign-driven discovery is Phase 2. Today, prospects enter through import and manual entry, with evidence captured on each dossier."
        actions={<><ButtonLink href="/data" variant="neutral">Import workbook</ButtonLink><NewOrganisationButton /></>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Source adapters" eyebrow="Legally accessible or licensed sources only" className="xl:col-span-2">
          <ul className="flex flex-col gap-2">{ADAPTERS.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-3 rounded-neo neo-inset-sm px-4 py-3">
              <Compass className="h-4 w-4 text-ink-3" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.name}</span><span className="block text-xs text-ink-3">{a.note}</span></span>
              <StatusBadge status="not_configured" label={`Phase ${a.phase}`} />
            </li>
          ))}</ul>
        </Panel>
        <Panel title="Where prospects come from now">
          <p className="text-sm text-ink-2">{count ?? 0} canonical organisations on file.</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Workbook import with entity resolution</li>
            <li>Manual prospect entry</li>
            <li>Evidence you add (with sources) on each dossier</li>
          </ul>
          <p className="mt-4 text-xs text-ink-3">Discovery campaigns (named searches by market, sector, triggers, budgets and frequency) will persist to discovery_campaigns and run as scheduled jobs. No source is shown as connected until it really is.</p>
        </Panel>
      </div>
    </>
  );
}
