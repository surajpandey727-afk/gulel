"use server";
import { revalidatePath } from "next/cache";
import { getSession, canApprove } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { prepareOutreach, refineDraft, saveEdit, switchChannel } from "@/lib/outreach/service";
import { addPreference, proposePreference } from "@/lib/voice/service";
import { executeApprovedSend } from "@/lib/execution/gateway";
import type { RefineAction } from "@/lib/ai/agents/governance";

type R<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

export async function prepareOutreachAction(organisationId: string, channel: "gmail" | "linkedin" | null): Promise<R<{ decision: string; rationale: string; draftId: string | null }>> {
  const s = await getSession();
  try {
    const r = await prepareOutreach(s.workspaceId, s.userId, organisationId, channel);
    revalidatePath(`/organisations/${organisationId}`);
    return { ok: true, data: { decision: r.decision, rationale: r.rationale, draftId: r.draftId } };
  } catch (e) { return fail(e); }
}

export async function saveEditAction(draftId: string, subject: string | null, body: string, original: string): Promise<R<{ versionNo: number; proposal: { preference: string; generalisable: boolean } | null }>> {
  const s = await getSession();
  if (!body.trim()) return { ok: false, error: "The message body cannot be empty." };
  try {
    const v = await saveEdit(s.workspaceId, s.userId, draftId, { subject, body });
    // Offer (never auto-apply) a generalisable writing preference from substantive edits.
    const changed = Math.abs(original.length - body.length) > 15 || original.trim() !== body.trim();
    const proposal = changed && !("unchanged" in v) ? await proposePreference(s.workspaceId, s.userId, original, body) : null;
    revalidatePath(`/outreach/${draftId}`);
    revalidatePath("/approvals");
    return { ok: true, data: { versionNo: v.version_no, proposal } };
  } catch (e) { return fail(e); }
}

export async function recordVoiceFeedbackAction(draftId: string, original: string, final: string, disposition: "one_off" | "preference" | "replace_preference", preference: string | null, replaces: string | null): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  const { data: d } = await supabase.from("outreach_drafts").select("current_version_id").eq("id", draftId).single();
  let applied: string | undefined;
  if (disposition !== "one_off" && preference) applied = await addPreference(s.workspaceId, s.userId, preference.trim(), replaces);
  await supabase.from("voice_feedback").insert({ workspace_id: s.workspaceId, draft_version_id: d?.current_version_id, original_text: original, final_text: final, disposition, preference_text: preference, replaces_preference: replaces, applied_to_version_id: applied ?? null, created_by: s.userId });
  return { ok: true, message: disposition === "one_off" ? "Kept as a one-off edit." : "Saved to your Voice DNA." };
}

export async function saveAsExampleAction(draftId: string): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  const { data: d } = await supabase.from("outreach_drafts").select("channel, draft_versions!od_current_version_fk(body, subject)").eq("id", draftId).single();
  const v = d?.draft_versions as unknown as { body: string; subject: string | null };
  if (!v) return { ok: false, error: "Draft not found" };
  await supabase.from("writing_samples").insert({ workspace_id: s.workspaceId, kind: d!.channel === "gmail" ? "email" : "linkedin", title: v.subject, body: v.body, created_by: s.userId });
  return { ok: true, message: "Saved as a writing sample. Re-run extraction in Settings → Voice DNA to fold it in." };
}

export async function refineAction(draftId: string, action: RefineAction): Promise<R<{ versionNo: number }>> {
  const s = await getSession();
  try {
    const v = await refineDraft(s.workspaceId, s.userId, draftId, action);
    revalidatePath(`/outreach/${draftId}`);
    return { ok: true, data: { versionNo: v.version_no } };
  } catch (e) { return fail(e); }
}

export async function switchChannelAction(draftId: string, channel: "gmail" | "linkedin"): Promise<R<string>> {
  const s = await getSession();
  try { return { ok: true, data: await switchChannel(s.workspaceId, s.userId, draftId, channel) }; } catch (e) { return fail(e); }
}

export async function requestApprovalAction(draftId: string): Promise<R<string>> {
  const s = await getSession();
  const supabase = await createClient();
  // Bind the sending account before approval so the fingerprint covers it.
  const { data: d } = await supabase.from("outreach_drafts").select("channel, current_version_id, draft_versions!od_current_version_fk(sending_account_id)").eq("id", draftId).single();
  if (d?.channel === "gmail" && !(d.draft_versions as unknown as { sending_account_id: string | null }).sending_account_id) {
    const { data: acc } = await supabase.from("channel_accounts").select("id").eq("workspace_id", s.workspaceId).eq("channel", "gmail").eq("status", "connected").limit(1).maybeSingle();
    if (!acc) return { ok: false, error: "Connect Gmail in Settings before requesting approval for an email." };
    const { data: v } = await supabase.from("draft_versions").select("*").eq("id", d.current_version_id).single();
    const { data: last } = await supabase.from("draft_versions").select("version_no").eq("draft_id", draftId).order("version_no", { ascending: false }).limit(1).single();
    await supabase.from("draft_versions").insert({ ...v, id: undefined, fingerprint: undefined, created_at: undefined, version_no: (last?.version_no ?? 0) + 1, sending_account_id: acc.id, source: "manual", refine_action: "bind_sending_account", created_by: s.userId });
  }
  const { data, error } = await supabase.rpc("request_approval", { p_draft_id: draftId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/approvals");
  revalidatePath(`/outreach/${draftId}`);
  return { ok: true, data: data as string };
}

export async function decideApprovalAction(approvalId: string, decision: "approve" | "reject" | "snooze", reason?: string): Promise<R<string>> {
  const s = await getSession();
  if (!canApprove(s.role)) return { ok: false, error: "Your role cannot approve outreach." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_approval", { p_approval_id: approvalId, p_decision: decision, p_reason: reason ?? null, p_snooze_until: null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/approvals");
  revalidatePath("/overview");
  if (data === "invalidated") return { ok: false, error: "The draft changed since this approval was requested. Review the new version." };
  return { ok: true, data: data as string };
}

export async function preflightAction(approvalId: string): Promise<R<{ ok: boolean; reasons: string[]; warnings: string[] }>> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preflight_send", { p_approval_id: approvalId, p_claim: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as { ok: boolean; reasons: string[]; warnings: string[] } };
}

/** Human-triggered execution of an approved Gmail message. The gateway re-checks everything. */
export async function sendApprovedAction(approvalId: string): Promise<R<{ providerMessageId?: string }>> {
  const s = await getSession();
  if (!canApprove(s.role)) return { ok: false, error: "Your role cannot send outreach." };
  const r = await executeApprovedSend(approvalId, s.workspaceId);
  revalidatePath("/approvals");
  revalidatePath("/inbox");
  revalidatePath("/overview");
  if (!r.ok) return { ok: false, error: `Not sent: ${(r.reasons ?? []).map((x) => x.replace(/_/g, " ")).join("; ")}` };
  return { ok: true, data: { providerMessageId: r.providerMessageId }, message: "Sent and recorded." };
}

/** LinkedIn: the founder confirms they sent it manually. */
export async function confirmManualSendAction(approvalId: string): Promise<R> {
  const s = await getSession();
  if (!canApprove(s.role)) return { ok: false, error: "Your role cannot confirm sends." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_manual_send", { p_approval_id: approvalId });
  if (error) return { ok: false, error: error.message.replace(/preflight failed: /, "Blocked: ") };
  revalidatePath("/approvals");
  revalidatePath("/inbox");
  return { ok: true, message: "Recorded as manually sent on LinkedIn." };
}

/** Batch: only eligible, individually reviewable items; returns per-item outcome. */
export async function approveBatchAction(approvalIds: string[]): Promise<R<{ approved: string[]; blocked: Array<{ id: string; reason: string }> }>> {
  const s = await getSession();
  if (!canApprove(s.role)) return { ok: false, error: "Your role cannot approve outreach." };
  if (approvalIds.length > 50) return { ok: false, error: "Approve at most 50 at a time." };
  const supabase = await createClient();
  const batchId = crypto.randomUUID();
  const approved: string[] = [];
  const blocked: Array<{ id: string; reason: string }> = [];
  for (const id of approvalIds) {
    const { data, error } = await supabase.rpc("decide_approval", { p_approval_id: id, p_decision: "approve", p_reason: `batch ${batchId}`, p_snooze_until: null });
    if (error || data !== "approve") blocked.push({ id, reason: error?.message ?? String(data) });
    else approved.push(id);
  }
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "approval.batch", metadata: { batch_id: batchId, approved, blocked } });
  revalidatePath("/approvals");
  return { ok: true, data: { approved, blocked } };
}
