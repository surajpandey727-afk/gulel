import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/ai/gateway";
import { ANALYST_SYSTEM, AnalystSchema, type AnalystOutput } from "@/lib/ai/agents/analyst";
import { untrusted } from "@/lib/ai/agents/shared";

/** Read-only snapshot. The analyst has no write tools; it only sees what is queried here. */
export async function buildSnapshot(workspaceId: string) {
  const supabase = await createClient();
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 86400_000).toISOString();
  const [kUK, kIN, quals, approvals, replies, tasks, opps] = await Promise.all([
    supabase.rpc("kpi_summary", { p_workspace_id: workspaceId, p_from: from, p_to: now.toISOString(), p_market: "UK" }),
    supabase.rpc("kpi_summary", { p_workspace_id: workspaceId, p_from: from, p_to: now.toISOString(), p_market: "IN" }),
    supabase.from("lead_qualifications").select("organisation_id, score, override_score, band, coverage, evidence_confidence, affordability, engagement_propensity, explanation, created_at, organisations(trading_name, primary_market, sector, needs, relationship_status)")
      .eq("workspace_id", workspaceId).eq("is_current", true).order("score", { ascending: false }).limit(25),
    supabase.from("approval_requests").select("id, channel, recipient_value, subject, created_at, outreach_drafts(organisation_id, organisations(trading_name))").eq("workspace_id", workspaceId).eq("status", "pending").limit(20),
    supabase.from("conversations").select("id, organisation_id, contact_id, status, latest_classification, last_inbound_at, organisations(trading_name)").eq("workspace_id", workspaceId).not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: false }).limit(20),
    supabase.from("tasks").select("id, title, due_at, kind, organisation_id").eq("workspace_id", workspaceId).eq("status", "open").order("due_at").limit(20),
    supabase.from("opportunities").select("id, name, stage, market, currency, value_amount, value_basis, probability_pct, organisation_id").eq("workspace_id", workspaceId).limit(30),
  ]);
  return {
    generated_at: now.toISOString(),
    window: "last 90 days",
    kpis: { UK: kUK.data, IN: kIN.data },
    current_qualifications: quals.data ?? [],
    pending_approvals: approvals.data ?? [],
    recent_replies: replies.data ?? [],
    open_tasks: tasks.data ?? [],
    opportunities: opps.data ?? [],
  };
}

export async function askAnalyst(workspaceId: string, userId: string, question: string): Promise<{ insightId: string; answer: AnalystOutput; model: string }> {
  const snapshot = await buildSnapshot(workspaceId);
  const res = await runStructured({
    workspaceId, agent: "chanakya", system: ANALYST_SYSTEM, schema: AnalystSchema, userId, maxTokens: 8000,
    input: `Question from the founder: ${question}\n\nDatabase snapshot (the only data you may use):\n${untrusted("database_snapshot", snapshot)}`,
  });
  // Only keep record links that actually exist in the snapshot.
  const ids = new Set(JSON.stringify(snapshot).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []);
  const answer = { ...res.data, records: res.data.records.filter((r) => ids.has(r.id)) };
  const supabase = await createClient();
  const { data } = await supabase.from("insights").insert({
    workspace_id: workspaceId, question, conclusion: answer.conclusion, body: answer, agent_execution_id: res.executionId, created_by: userId,
  }).select("id").single();
  return { insightId: data!.id, answer, model: res.model };
}
