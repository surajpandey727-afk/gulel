import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/ai/gateway";
import { BRIEF_SYSTEM, BriefSchema, FOLLOWUP_SYSTEM, FollowUpSchema } from "@/lib/ai/agents/followup";
import { untrusted } from "@/lib/ai/agents/shared";
import { buildEvidencePackage } from "@/lib/qualification/service";
import { getActiveVoice, voicePromptBlock } from "@/lib/voice/service";
import { evaluateCompliance } from "@/lib/compliance";
import { syncGmailDraft } from "./service";

/**
 * Prepares a follow-up or reply as a NEW draft in the same conversation. It needs its own approval:
 * a previous approval never authorises future messages.
 */
export async function draftConversationMessage(workspaceId: string, userId: string, conversationId: string, kind: "follow_up" | "reply") {
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id, channel, status, organisation_id, contact_id, channel_account_id, subject").eq("id", conversationId).eq("workspace_id", workspaceId).single();
  if (!conv?.organisation_id) throw new Error("Conversation not found");
  if (["opted_out", "do_not_contact", "bounced", "won", "lost"].includes(conv.status)) throw new Error(`Conversation is ${conv.status.replace(/_/g, " ")} — no further message is prepared.`);
  const { data: open } = await supabase.from("outreach_drafts").select("id").eq("conversation_id", conversationId).in("status", ["draft", "awaiting_approval", "approved"]).limit(1).maybeSingle();
  if (open) return { draftId: open.id as string, decision: "existing", rationale: "An unsent draft already exists for this conversation." };

  const [pkg, { data: msgs }, { data: last }] = await Promise.all([
    buildEvidencePackage(workspaceId, conv.organisation_id),
    supabase.from("conversation_messages").select("direction, body_text, snippet, occurred_at, subject").eq("conversation_id", conversationId).order("occurred_at"),
    supabase.from("outbound_messages").select("recipient_value, draft_version_id, sent_at").eq("conversation_id", conversationId).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!last) throw new Error("No sent message in this conversation yet.");
  const contact = pkg.contacts.find((c) => c?.contact_id === conv.contact_id) ?? null;
  const compliance = evaluateCompliance({
    channel: conv.channel as "gmail", market: pkg.organisation.primary_market as "UK", subscriberType: (contact?.subscriber_type as "corporate") ?? "unknown",
    lawfulBasis: (contact?.lawful_basis as "legitimate_interest") ?? "legitimate_interest", optedOut: !!contact?.opted_out, suppressed: pkg.organisation_suppressed,
  });
  if (!compliance.eligible) throw new Error(`Not eligible: ${compliance.reasons.join(" ")}`);

  const { version: voice } = await getActiveVoice(workspaceId);
  const res = await runStructured({
    workspaceId, agent: "governance", system: FOLLOWUP_SYSTEM.replace("{{kind}}", kind === "reply" ? "reply" : "follow-up"), schema: FollowUpSchema, userId, maxTokens: 6000,
    entity: { type: "conversation", id: conversationId }, cachedContext: voicePromptBlock(voice),
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}. Channel: ${conv.channel === "gmail" ? "email" : "LinkedIn message"}. Kind: ${kind}.`,
      untrusted("conversation_so_far", (msgs ?? []).map((m) => ({ from: m.direction === "outbound" ? "founder" : "recipient", at: m.occurred_at, text: m.body_text ?? m.snippet }))),
      untrusted("evidence", pkg.evidence.slice(0, 30)),
    ].join("\n\n"),
  });
  if (res.data.decision !== "draft" || !res.data.body.trim()) return { draftId: null, decision: res.data.decision, rationale: res.data.rationale };

  const { data: prevV } = await supabase.from("draft_versions").select("sending_account_id, recipient_channel_id, supporting_evidence_ids").eq("id", last.draft_version_id!).maybeSingle();
  const { data: d } = await supabase.from("outreach_drafts").insert({
    workspace_id: workspaceId, organisation_id: conv.organisation_id, contact_id: conv.contact_id, conversation_id: conversationId, channel: conv.channel, kind, created_by: userId,
  }).select("id").single();
  await supabase.from("draft_versions").insert({
    workspace_id: workspaceId, draft_id: d!.id, version_no: 1, channel: conv.channel, sending_account_id: prevV?.sending_account_id ?? conv.channel_account_id,
    recipient_channel_id: prevV?.recipient_channel_id ?? null, recipient_value: last.recipient_value,
    subject: conv.channel === "gmail" ? (res.data.subject ?? (conv.subject ? `Re: ${conv.subject.replace(/^re:\s*/i, "")}` : "")) : null,
    body: res.data.body, source: "governance", strategic_angle: res.data.rationale, supporting_evidence_ids: prevV?.supporting_evidence_ids ?? [], voice_version_id: voice.id, agent_execution_id: res.executionId,
    quality: { tone_match: res.data.tone_match, factuality: { status: res.data.unsupported_claims.length ? "issues" : "pass", unsupported_claims: res.data.unsupported_claims, invalid_citations: [] }, compliance, brief: { next_action: res.data.next_action }, model: res.model },
    created_by: userId,
  });
  await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("kind", "follow_up").eq("status", "open");
  if (conv.channel === "gmail") await syncGmailDraft(workspaceId, d!.id).catch(() => undefined);
  return { draftId: d!.id as string, decision: "draft", rationale: res.data.rationale };
}

export async function generateMeetingBrief(workspaceId: string, userId: string, opportunityId: string) {
  const supabase = await createClient();
  const { data: opp } = await supabase.from("opportunities").select("id, organisation_id, conversation_id, name, service, market, currency").eq("id", opportunityId).eq("workspace_id", workspaceId).single();
  if (!opp) throw new Error("Opportunity not found");
  const pkg = await buildEvidencePackage(workspaceId, opp.organisation_id);
  const { data: msgs } = opp.conversation_id ? await supabase.from("conversation_messages").select("direction, body_text, snippet, occurred_at").eq("conversation_id", opp.conversation_id).order("occurred_at") : { data: [] };
  const { data: notes } = await supabase.from("notes").select("body, created_at").eq("organisation_id", opp.organisation_id);
  const res = await runStructured({
    workspaceId, agent: "analyst", system: BRIEF_SYSTEM, schema: BriefSchema, userId, maxTokens: 8000, entity: { type: "opportunity", id: opportunityId },
    input: [untrusted("dossier", pkg), untrusted("conversation", msgs ?? []), untrusted("internal_notes", notes ?? []), `Opportunity: ${opp.name}${opp.service ? ` · service ${opp.service}` : ""}`].join("\n\n"),
  });
  const valid = new Set(pkg.evidence.map((e) => e.id));
  const brief = { ...res.data, evidence_ids: res.data.evidence_ids.filter((x) => valid.has(x)), generated_at: new Date().toISOString(), model: res.model };
  await supabase.from("opportunities").update({ prep_brief: brief }).eq("id", opportunityId);
  return brief;
}
