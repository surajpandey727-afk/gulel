"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { syncGmailAccount } from "@/lib/channels/gmail-sync";
import { classifyReply } from "@/lib/inbox/classify";
import { REPLY_CATEGORIES } from "@/lib/ai/agents/classifier";

type R = { ok: true; message?: string } | { ok: false; error: string };

export async function reviewClassificationAction(classificationId: string, conversationId: string, final: (typeof REPLY_CATEGORIES)[number]): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  if (!REPLY_CATEGORIES.includes(final)) return { ok: false, error: "Unknown category" };
  await supabase.from("conversation_classifications").update({ final, reviewed_by: s.userId, reviewed_at: new Date().toISOString() }).eq("id", classificationId).eq("workspace_id", s.workspaceId);
  await supabase.from("conversations").update({ latest_classification: final, needs_review: false }).eq("id", conversationId);
  revalidatePath("/inbox");
  return { ok: true };
}

const LIFECYCLE = ["awaiting_response", "replied", "qualified_conversation", "meeting_requested", "meeting_booked", "opportunity", "proposal", "won", "lost", "nurture", "deferred", "opted_out", "do_not_contact", "archived"] as const;

export async function setConversationStatusAction(conversationId: string, status: (typeof LIFECYCLE)[number], meetingAt?: string): Promise<R> {
  const s = await getSession();
  if (!LIFECYCLE.includes(status)) return { ok: false, error: "Invalid status" };
  const supabase = await createClient();
  const { data: c } = await supabase.from("conversations").select("id, organisation_id, contact_id, market, organisations(trading_name, primary_market)").eq("id", conversationId).eq("workspace_id", s.workspaceId).single();
  if (!c) return { ok: false, error: "Conversation not found" };
  await supabase.from("conversations").update({ status, needs_review: false }).eq("id", conversationId);
  const org = c.organisations as unknown as { trading_name: string; primary_market: "UK" | "IN" } | null;
  if (status === "meeting_booked") {
    await supabase.from("meetings").insert({ workspace_id: s.workspaceId, organisation_id: c.organisation_id, contact_id: c.contact_id, conversation_id: c.id, status: "booked", scheduled_at: meetingAt || null });
  }
  if (status === "opportunity" && c.organisation_id && org) {
    const { count } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("conversation_id", c.id);
    if (!count) await supabase.from("opportunities").insert({ workspace_id: s.workspaceId, organisation_id: c.organisation_id, contact_id: c.contact_id, conversation_id: c.id, name: `${org.trading_name} — advisory`, market: org.primary_market, currency: org.primary_market === "UK" ? "GBP" : "INR", lead_source: "outreach", owner_user_id: s.userId });
  }
  if ((status === "opted_out" || status === "do_not_contact") && c.contact_id) {
    await supabase.from("contacts").update({ opted_out_at: new Date().toISOString(), outreach_status: status }).eq("id", c.contact_id);
    await supabase.from("suppression_entries").upsert({ workspace_id: s.workspaceId, kind: "contact", value: c.contact_id, reason: status === "opted_out" ? "opt_out" : "do_not_contact", created_by: s.userId }, { onConflict: "workspace_id,kind,value" });
  }
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function addNoteAction(conversationId: string, body: string): Promise<R> {
  const s = await getSession();
  if (!body.trim()) return { ok: false, error: "Note is empty" };
  const supabase = await createClient();
  const { data: c } = await supabase.from("conversations").select("contact_id, organisation_id").eq("id", conversationId).single();
  await supabase.from("notes").insert({ workspace_id: s.workspaceId, conversation_id: conversationId, contact_id: c?.contact_id, organisation_id: c?.organisation_id, body: body.trim(), created_by: s.userId });
  revalidatePath("/inbox");
  return { ok: true };
}

/** LinkedIn replies cannot be synced — the founder logs them; they are labelled as manual. */
export async function logManualReplyAction(conversationId: string, body: string, occurredAt: string): Promise<R> {
  const s = await getSession();
  if (!body.trim()) return { ok: false, error: "Paste the reply text" };
  const supabase = await createClient();
  const { data: c } = await supabase.from("conversations").select("id, channel, contact_id").eq("id", conversationId).eq("workspace_id", s.workspaceId).single();
  if (!c) return { ok: false, error: "Conversation not found" };
  const at = occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();
  const { data: m } = await supabase.from("conversation_messages").insert({ workspace_id: s.workspaceId, conversation_id: c.id, direction: "inbound", source: "manual_log", body_text: body.trim(), snippet: body.trim().slice(0, 160), occurred_at: at }).select("id").single();
  await supabase.from("manual_channel_events").insert({ workspace_id: s.workspaceId, channel: c.channel === "linkedin" ? "linkedin" : "other", event: "reply_received", conversation_id: c.id, contact_id: c.contact_id, body: body.trim(), occurred_at: at, confirmed_by: s.userId });
  await supabase.from("conversations").update({ last_inbound_at: at, status: "replied", needs_review: true }).eq("id", c.id);
  if (m) await classifyReply(s.workspaceId, m.id).catch(() => undefined);
  revalidatePath("/inbox");
  return { ok: true };
}

export async function syncNowAction(): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  const { data: accs } = await supabase.from("channel_accounts").select("id").eq("workspace_id", s.workspaceId).eq("channel", "gmail").eq("status", "connected");
  if (!accs?.length) return { ok: false, error: "Gmail is not connected." };
  try {
    let inbound = 0;
    for (const a of accs) inbound += (await syncGmailAccount(s.workspaceId, a.id)).inbound ?? 0;
    // classify anything new straight away
    const { data: pending } = await supabase.from("jobs").select("id, payload").eq("workspace_id", s.workspaceId).eq("type", "classify_reply").eq("status", "queued").limit(20);
    for (const j of pending ?? []) await classifyReply(s.workspaceId, (j.payload as { conversation_message_id: string }).conversation_message_id).then(() => supabase.from("jobs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", j.id)).catch(() => undefined);
    revalidatePath("/inbox");
    return { ok: true, message: `Synced. ${inbound} new repl${inbound === 1 ? "y" : "ies"}.` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
