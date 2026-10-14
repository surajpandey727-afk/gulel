import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStructured } from "@/lib/ai/gateway";
import { CLASSIFIER_SYSTEM, ClassificationSchema } from "@/lib/ai/agents/classifier";
import { untrusted } from "@/lib/ai/agents/shared";

const STATUS_FOR: Record<string, string | null> = {
  meeting_request: "meeting_requested", positive: "qualified_conversation", opt_out: "opted_out", bounce: "bounced", negative: "replied",
  neutral: "replied", question: "replied", referral: "replied", not_now: "nurture", out_of_office: null,
};

export async function classifyReply(workspaceId: string, messageId: string) {
  const admin = createAdminClient();
  const { data: m } = await admin.from("conversation_messages").select("id, conversation_id, body_text, snippet, subject, from_value").eq("id", messageId).eq("workspace_id", workspaceId).single();
  if (!m) return { skipped: true };
  const { count } = await admin.from("conversation_classifications").select("id", { count: "exact", head: true }).eq("conversation_message_id", messageId);
  if (count) return { skipped: "already_classified" };
  const res = await runStructured({
    workspaceId, agent: "classifier", system: CLASSIFIER_SYSTEM, schema: ClassificationSchema, maxTokens: 1500,
    entity: { type: "conversation_message", id: messageId },
    input: untrusted("reply_email", { from: m.from_value, subject: m.subject, body: m.body_text ?? m.snippet }),
  });
  await admin.from("conversation_classifications").insert({ workspace_id: workspaceId, conversation_message_id: messageId, proposed: res.data.category, confidence: Math.max(0, Math.min(1, res.data.confidence)), rationale: res.data.rationale, agent_execution_id: res.executionId });
  const { data: conv } = await admin.from("conversations").select("id, contact_id, status").eq("id", m.conversation_id).single();
  const next = STATUS_FOR[res.data.category];
  await admin.from("conversations").update({ latest_classification: res.data.category, needs_review: true, ...(next && conv && !["won", "lost", "opportunity", "proposal", "meeting_booked"].includes(conv.status) ? { status: next } : {}) }).eq("id", m.conversation_id);
  // Fail safe: a proposed opt-out is honoured immediately (and remains reviewable).
  if (res.data.category === "opt_out" && conv?.contact_id) {
    await admin.from("contacts").update({ opted_out_at: new Date().toISOString(), outreach_status: "opted_out" }).eq("id", conv.contact_id);
    await admin.from("suppression_entries").upsert({ workspace_id: workspaceId, kind: "contact", value: conv.contact_id, reason: "opt_out", notes: "Auto-applied from a reply classified as opt-out; review in Inbox." }, { onConflict: "workspace_id,kind,value" });
  }
  return { category: res.data.category };
}
