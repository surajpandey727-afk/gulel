import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThread, header, listHistory, plainText, stripQuoted, GmailError, getProfile } from "./gmail";

/**
 * Incremental sync: Gmail history → only threads we started (known provider_thread_id) are
 * imported, so unrelated personal mail never enters the platform. Idempotent on provider ids.
 * Runs with the service role from the job worker; always scoped by workspace_id.
 */
export async function syncGmailAccount(workspaceId: string, accountId: string) {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("channel_accounts").select("id, account_email, history_id, status").eq("id", accountId).eq("workspace_id", workspaceId).single();
  if (!acc || acc.status !== "connected") return { skipped: true };
  if (!acc.account_email) throw new Error("Gmail account has no address on record; reconnect it so replies can be told apart from sent mail");

  const { data: convs } = await admin.from("conversations").select("id, provider_thread_id, contact_id, organisation_id, status").eq("workspace_id", workspaceId).eq("channel", "gmail").not("provider_thread_id", "is", null);
  const byThread = new Map((convs ?? []).map((c) => [c.provider_thread_id!, c]));
  if (!byThread.size) {
    const p = await getProfile(accountId);
    await admin.from("channel_accounts").update({ history_id: p.historyId, last_sync_at: new Date().toISOString() }).eq("id", accountId);
    return { threads: 0, inbound: 0 };
  }

  let touched = new Set<string>();
  let latestHistory = acc.history_id;
  try {
    if (acc.history_id) {
      let page: string | undefined;
      do {
        const h = await listHistory(accountId, acc.history_id, page);
        latestHistory = h.historyId;
        for (const rec of h.history ?? []) for (const m of rec.messagesAdded ?? []) if (byThread.has(m.message.threadId)) touched.add(m.message.threadId);
        page = h.nextPageToken;
      } while (page);
    } else {
      touched = new Set(byThread.keys());
    }
  } catch (e) {
    // history id too old → full re-scan of known threads
    if (e instanceof GmailError && e.status === 404) touched = new Set(byThread.keys());
    else throw e;
  }

  let inbound = 0;
  const me = (acc.account_email ?? "").toLowerCase();
  for (const threadId of touched) {
    const conv = byThread.get(threadId)!;
    const t = await getThread(accountId, threadId);
    for (const m of t.messages) {
      const from = (header(m, "From") ?? "").toLowerCase();
      const isOutbound = from.includes(me);
      const occurred = new Date(Number(m.internalDate)).toISOString();
      const isBounce = /mailer-daemon|postmaster/.test(from);
      const { data: ins } = await admin.from("conversation_messages").upsert({
        workspace_id: workspaceId, conversation_id: conv.id, direction: isOutbound ? "outbound" : "inbound", source: "gmail_sync",
        provider_message_id: m.id, from_value: header(m, "From"), to_value: header(m, "To"), subject: header(m, "Subject"),
        body_text: isOutbound ? null : stripQuoted(plainText(m)).slice(0, 20000), snippet: m.snippet, occurred_at: occurred,
      }, { onConflict: "workspace_id,provider_message_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (ins && !isOutbound) {
        inbound++;
        await admin.from("conversations").update({ last_inbound_at: occurred, needs_review: true, status: isBounce ? "bounced" : ["sent", "awaiting_response"].includes(conv.status) ? "replied" : conv.status }).eq("id", conv.id);
        if (conv.contact_id) await admin.from("contacts").update({ last_interaction_at: occurred, outreach_status: isBounce ? "bounced" : "replied" }).eq("id", conv.contact_id);
        if (isBounce) await admin.from("contact_channels").update({ bounced_at: occurred, verification_status: "invalid" }).eq("workspace_id", workspaceId).eq("value", (header(m, "X-Failed-Recipients") ?? "").toLowerCase());
        // a reply from the address we wrote to proves it is a working address
        else if (conv.contact_id) await admin.from("contact_channels").update({ verification_status: "verified", verification_method: "reply_received", verified_at: occurred }).eq("contact_id", conv.contact_id).eq("channel", "email").neq("verification_status", "verified");
        await admin.from("jobs").insert({ workspace_id: workspaceId, type: "classify_reply", payload: { conversation_message_id: ins.id }, idempotency_key: `classify:${ins.id}` });
      }
    }
  }
  await admin.from("channel_accounts").update({ history_id: latestHistory, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", accountId);
  await admin.from("integration_events").insert({ workspace_id: workspaceId, integration: "gmail", event: "sync_completed", status: "ok", detail: { threads: touched.size, inbound } });
  return { threads: touched.size, inbound };
}
