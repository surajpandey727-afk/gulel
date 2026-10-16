import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { GlobalFilters } from "@/components/shell/filters";
import { PipelineBoard, type Opp, type OrgOption } from "./board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const f = await resolveFilters(searchParams);
  const s = await getSession();
  const supabase = await createClient();
  let q = supabase.from("opportunities").select("id, name, service, stage, market, currency, value_amount, value_basis, probability_pct, expected_close_on, actual_value_amount, reason_lost, next_action, next_action_due, is_demo, prep_brief, proposal_status, competitive_outcome, win_loss_notes, organisation_id, organisations(trading_name), contacts(full_name), meetings(id, status, scheduled_at, notes)").eq("workspace_id", s.workspaceId).order("updated_at", { ascending: false });
  if (f.market) q = q.eq("market", f.market);
  const [{ data }, { data: orgList }] = await Promise.all([q, supabase.from("organisations").select("id, trading_name, primary_market").eq("workspace_id", s.workspaceId).is("deleted_at", null).order("trading_name")]);
  return (
    <>
      <AnimatedPageHeader title="Pipeline" description="Real opportunities only — created from qualified conversations. Lead qualification is kept separate from deal forecasting." actions={<GlobalFilters showRange={false} />} />
      <PipelineBoard opps={(data ?? []) as unknown as Opp[]} orgs={(orgList ?? []) as OrgOption[]} />
    </>
  );
}
