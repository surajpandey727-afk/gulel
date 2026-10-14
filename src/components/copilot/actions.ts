"use server";
import { getSession } from "@/lib/workspace";
import { askAnalyst } from "@/lib/intelligence/analyst";
import { GatewayError } from "@/lib/ai/gateway";
import { createClient } from "@/lib/supabase/server";
import type { AnalystOutput } from "@/lib/ai/agents/analyst";

export async function ask(question: string): Promise<{ ok: true; insightId: string; answer: AnalystOutput; model: string } | { ok: false; error: string }> {
  const q = question.trim();
  if (q.length < 4 || q.length > 1000) return { ok: false, error: "Ask a question between 4 and 1,000 characters." };
  const session = await getSession();
  try {
    return { ok: true, ...(await askAnalyst(session.workspaceId, session.userId, q)) };
  } catch (e) {
    return { ok: false, error: e instanceof GatewayError ? e.message : "The analyst could not answer. Check Settings → AI providers." };
  }
}

export async function setInsightStatus(id: string, status: "saved" | "dismissed") {
  const session = await getSession();
  const supabase = await createClient();
  await supabase.from("insights").update({ status }).eq("id", id).eq("workspace_id", session.workspaceId);
}

export async function insightToTask(id: string) {
  const session = await getSession();
  const supabase = await createClient();
  const { data: ins } = await supabase.from("insights").select("conclusion, body").eq("id", id).single();
  if (!ins) return;
  const next = (ins.body as AnalystOutput).next_action || ins.conclusion;
  const { data: t } = await supabase.from("tasks").insert({ workspace_id: session.workspaceId, title: next.slice(0, 240), kind: "other", source: "insight", created_by: session.userId }).select("id").single();
  await supabase.from("insights").update({ status: "converted", task_id: t?.id }).eq("id", id);
}
