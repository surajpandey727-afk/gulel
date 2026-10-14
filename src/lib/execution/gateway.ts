import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMime, GmailError, sendMessage, deleteDraft } from "@/lib/channels/gmail";

/**
 * Deterministic Execution Gateway — the ONLY code path that sends an external message.
 * No LLM is involved. All checks run inside Postgres (`preflight_send`), which also claims
 * the send job atomically (unique per approval ⇒ retries / double-clicks cannot double-send).
 */
export interface ExecuteResult {
  ok: boolean;
  reasons?: string[];
  outboundMessageId?: string;
  providerMessageId?: string;
}

export async function executeApprovedSend(approvalId: string, workspaceId: string): Promise<ExecuteResult> {
  const admin = createAdminClient();
  const { data: approval } = await admin.from("approval_requests").select("id, workspace_id, channel, draft_id, sending_account_id").eq("id", approvalId).single();
  if (!approval || approval.workspace_id !== workspaceId) return { ok: false, reasons: ["approval_not_found"] };
  if (approval.channel !== "gmail") return { ok: false, reasons: ["channel_requires_manual_handoff"] };

  const { data: pre, error } = await admin.rpc("preflight_send", { p_approval_id: approvalId, p_claim: true });
  if (error) return { ok: false, reasons: [`preflight_error: ${error.message}`] };
  if (!pre.ok) return { ok: false, reasons: pre.reasons };
  const sendJobId: string = pre.send_job_id;

  // Load the exact approved content (bound to the fingerprint checked above).
  const { data: full } = await admin
    .from("approval_requests")
    .select("recipient_value, subject, draft_versions!approval_requests_draft_version_id_fkey(body), outreach_drafts!inner(provider_draft_id, conversation_id, conversations(provider_thread_id)), channel_accounts(account_email)")
    .eq("id", approvalId)
    .single();
  const f = full as unknown as {
    recipient_value: string; subject: string | null;
    draft_versions: { body: string };
    outreach_drafts: { provider_draft_id: string | null; conversations: { provider_thread_id: string | null } | null };
    channel_accounts: { account_email: string };
  };

  try {
    const mime = buildMime({ from: f.channel_accounts.account_email, to: f.recipient_value, subject: f.subject ?? "", body: f.draft_versions.body });
    const sent = await sendMessage(approval.sending_account_id!, mime, f.outreach_drafts.conversations?.provider_thread_id);
    const { data: om, error: cErr } = await admin.rpc("complete_send", {
      p_send_job_id: sendJobId, p_delivery_status: "sent_confirmed", p_provider_message_id: sent.id,
      p_provider_thread_id: sent.threadId, p_provider_response: { id: sent.id, threadId: sent.threadId, labelIds: sent.labelIds ?? [] }, p_actor: "gateway",
    });
    if (cErr) {
      // The email went out but recording failed: surface loudly, never retry the send.
      await admin.from("system_errors").insert({ workspace_id: workspaceId, source: "execution_gateway", message: `Sent ${sent.id} but failed to record: ${cErr.message}`, context: { approvalId, sendJobId } });
      return { ok: false, reasons: ["sent_but_record_failed"], providerMessageId: sent.id };
    }
    // The Gmail draft (if any) is now redundant; best effort cleanup.
    if (f.outreach_drafts.provider_draft_id) await deleteDraft(approval.sending_account_id!, f.outreach_drafts.provider_draft_id).catch(() => undefined);
    return { ok: true, outboundMessageId: om as string, providerMessageId: sent.id };
  } catch (e) {
    const ge = e instanceof GmailError ? e : new GmailError(0, e instanceof Error ? e.message : String(e), false);
    await admin.rpc("fail_send", { p_send_job_id: sendJobId, p_error: ge.message, p_retryable: ge.retryable, p_http_status: ge.status });
    return { ok: false, reasons: [`provider_error_${ge.status}`, ge.message] };
  }
}
