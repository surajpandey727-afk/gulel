import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { AGENTS } from "@/lib/ai/models";
import { ProvidersView } from "./providers-view";

export const metadata = { title: "AI providers" };

export default async function ProvidersPage() {
  const s = await getSession();
  const supabase = await createClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: conns }, { data: agents }, { data: execs }, { data: recent }] = await Promise.all([
    supabase.from("provider_connections").select("id, provider, label, base_url, key_hint, anthropic_workspace_id, is_enabled, status, last_tested_at, last_test_result, rotated_at, created_at").eq("workspace_id", s.workspaceId).order("created_at"),
    supabase.from("agent_configurations").select("agent, model, effort, monthly_budget_usd, on_budget_exhausted, connection_id, allow_cross_provider_fallback").eq("workspace_id", s.workspaceId),
    supabase.from("agent_executions").select("agent, cost_usd, input_tokens, output_tokens").eq("workspace_id", s.workspaceId).gte("started_at", monthStart.toISOString()),
    supabase.from("agent_executions").select("id, agent, provider, model, status, input_tokens, output_tokens, cost_usd, error, started_at").eq("workspace_id", s.workspaceId).order("started_at", { ascending: false }).limit(15),
  ]);
  const spend = Object.fromEntries(Object.keys(AGENTS).map((a) => {
    const rows = (execs ?? []).filter((e) => e.agent === a);
    return [a, { usd: rows.reduce((x, r) => x + Number(r.cost_usd), 0), tokens: rows.reduce((x, r) => x + r.input_tokens + r.output_tokens, 0), runs: rows.length }];
  }));
  const envFallback = !!process.env.ANTHROPIC_API_KEY;
  return <ProvidersView connections={conns ?? []} agents={agents ?? []} spend={spend} recent={recent ?? []} envFallback={envFallback} envWorkspaceSet={!!process.env.ANTHROPIC_WORKSPACE_ID} isOwner={s.role === "owner"} />;
}
