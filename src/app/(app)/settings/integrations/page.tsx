import { Check, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { CHANNELS } from "@/lib/channels/registry";
import { gmailConfigured } from "@/lib/channels/gmail";
import { Panel } from "@/components/neo/surface";
import { StatusBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { GmailControls } from "./gmail-controls";

export const metadata = { title: "Integrations" };

const NOTICES: Record<string, string> = {
  connected: "Gmail connected.", denied: "Google sign-in was cancelled.", state_mismatch: "The sign-in session expired — try again.",
  forbidden: "Only the workspace owner can connect Gmail.", error: "Gmail connection failed — see Operations for details.",
  not_configured: "Google OAuth credentials are not configured on the server yet (see setup steps below).",
};

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { gmail: notice } = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("channel_accounts").select("id, account_email, status, scopes, last_sync_at, last_error, created_at").eq("workspace_id", s.workspaceId).eq("channel", "gmail");
  const caps: Array<[keyof (typeof CHANNELS)["gmail"], string]> = [
    ["canDiscover", "Can discover"], ["canReadConversations", "Can read conversations"], ["canDraftNatively", "Can draft natively"], ["canSendViaApi", "Can send via API"],
    ["canSyncReplies", "Can sync replies"], ["canTrackDelivery", "Can track delivery"], ["canLogManually", "Can log manually"], ["requiresHumanHandoff", "Requires human handoff"],
  ];
  return (
    <div className="flex flex-col gap-6">
      {notice && <p role="status" className="rounded-neo neo-inset-sm px-4 py-2.5 text-sm">{NOTICES[notice] ?? notice}</p>}
      <Panel title="Gmail" eyebrow="First-class integration · OAuth">
        {!gmailConfigured() && (
          <div className="mb-4 rounded-neo neo-inset-sm p-4 text-sm text-ink-2">
            <p className="font-medium text-ink">Setup required</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              <li>Google Cloud Console → APIs &amp; Services → enable the <strong>Gmail API</strong>.</li>
              <li>OAuth consent screen: External, “Testing”, add your Google account as a test user. Scopes: gmail.compose, gmail.readonly, gmail.send.</li>
              <li>Credentials → OAuth client ID → Web application. Authorised redirect URI: <code className="font-mono">{process.env.NEXT_PUBLIC_APP_URL}/api/gmail/oauth/callback</code></li>
              <li>Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code> (server only) and restart.</li>
            </ol>
          </div>
        )}
        <GmailControls configured={gmailConfigured()} isOwner={s.role === "owner"} accounts={(accounts ?? []).map((a) => ({ id: a.id, email: a.account_email as string, status: a.status, lastSync: a.last_sync_at, error: a.last_error, scopes: a.scopes }))} />
      </Panel>

      <Panel title="LinkedIn" eyebrow="Permission-aware · manual handoff">
        <p className="text-sm text-ink-2">LinkedIn does not offer an authorised messaging API for this use. gulel prepares and approves LinkedIn drafts, then you copy the message, open the profile, send it yourself and confirm. Replies are logged manually. No scraping, session automation or mass messaging.</p>
        <div className="mt-3"><StatusBadge status="permission_restricted" label="manual handoff only" /></div>
      </Panel>

      <Panel title="Channel capability registry" eyebrow="The UI reflects these — nothing is simulated">
        <Table>
          <thead><tr><Th>Capability</Th><Th>Gmail</Th><Th>LinkedIn</Th></tr></thead>
          <tbody>{caps.map(([k, l]) => (
            <Tr key={k}><Td>{l}</Td>{(["gmail", "linkedin"] as const).map((c) => <Td key={c}>{CHANNELS[c][k] ? <Check className="h-4 w-4 text-positive" aria-label="yes" /> : <Minus className="h-4 w-4 text-ink-3" aria-label="no" />}</Td>)}</Tr>
          ))}</tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-3">{CHANNELS.gmail.notes}</p>
      </Panel>
    </div>
  );
}
