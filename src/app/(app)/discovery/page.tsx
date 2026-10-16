import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { sourceAvailability } from "@/lib/discovery/service";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { ButtonLink } from "@/components/neo/button";
import { NewOrganisationButton } from "../organisations/new-organisation";
import { DiscoveryCentre } from "./centre";

export const metadata = { title: "Discovery" };

export default async function DiscoveryPage() {
  const s = await getSession();
  const supabase = await createClient();
  const ws = s.workspaceId;
  const [{ data: campaigns }, { data: icps }, { data: signals }, { data: runs }] = await Promise.all([
    supabase.from("discovery_campaigns").select("*").eq("workspace_id", ws).neq("status", "archived").order("created_at"),
    supabase.from("icps").select("id, name, version_no, market, definition, min_score, is_active, created_at").eq("workspace_id", ws).eq("is_active", true).order("name"),
    supabase.from("discovery_signals").select("id, source, candidate_name, candidate_domain, market, signal_type, strength, claim_text, uncertainty, source_url, published_at, match_hint, organisation_id, campaign_id, created_at, discovery_campaigns(name), organisations(trading_name)").eq("workspace_id", ws).eq("status", "new").order("created_at", { ascending: false }).limit(200),
    supabase.from("discovery_runs").select("id, campaign_id, status, per_source, candidates_found, new_signals, cost_usd, started_at, finished_at, discovery_campaigns(name)").eq("workspace_id", ws).order("started_at", { ascending: false }).limit(15),
  ]);
  return (
    <>
      <AnimatedPageHeader title="Discovery" description="Named campaigns search authorised sources for organisations showing credible advisory need. Signals land here for your review — nothing reaches outreach without you."
        actions={<><ButtonLink href="/data">Import workbook</ButtonLink><NewOrganisationButton /></>} />
      <DiscoveryCentre campaigns={(campaigns ?? []) as never} icps={(icps ?? []) as never} signals={(signals ?? []) as never} runs={(runs ?? []) as never} availability={sourceAvailability()} />
    </>
  );
}
