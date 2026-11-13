import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel, EmptyState } from "@/components/neo/surface";
import { Layers } from "lucide-react";
import { PipelineTable } from "./pipeline-table";

export const metadata = { title: "Pipeline" };

export default async function CentralPipelinePage() {
  const s = await getSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("opportunities")
    .select("id, name, stage, market, currency, value_amount, track, lead_source, next_action, next_action_due, last_touch_at, discovery_notes, owner_user_id, organisations(trading_name), contacts(full_name)")
    .eq("workspace_id", s.workspaceId)
    .order("updated_at", { ascending: false });

  const opps = (data ?? [] as unknown) as Array<{
    id: string; name: string; stage: string; market: string; currency: string;
    value_amount: number | null; track: string | null; lead_source: string | null;
    next_action: string | null; next_action_due: string | null; last_touch_at: string | null;
    discovery_notes: string | null; owner_user_id: string | null;
    organisations: { trading_name: string } | null;
    contacts: { full_name: string } | null;
  }>;

  if (opps.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No pipeline data"
          body="Import opportunities from your Google Sheet or create them from qualified conversations."
          icon={<Layers className="h-5 w-5" />}
        />
      </Panel>
    );
  }

  return <PipelineTable opps={opps} />;
}
