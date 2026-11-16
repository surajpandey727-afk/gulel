import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel } from "@/components/neo/surface";
import { getLinkState } from "@/lib/central/link";
import { sheetsConfigured } from "@/lib/central/google";
import { SyncControls, TokensPanel, ChangeLog } from "./sync-client";

export const metadata = { title: "Sync & access" };
export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  connected: "Google account connected. Link a sheet or create one from the workbook below.",
  denied: "Google access was declined.",
  state_mismatch: "The Google sign-in expired. Try again.",
  forbidden: "Only owners and analysts can connect Google Sheets.",
  missing_scopes: "Google didn't grant Sheets and Drive access. Tick both permissions when you reconnect.",
  not_configured: "Google OAuth isn't configured on this deployment.",
  error: "Connecting Google failed. See Operations → integration events.",
};

export default async function SyncPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const s = await getSession();
  const db = await createClient();
  const [link, runs, changes, pending, tokens, rows] = await Promise.all([
    getLinkState(db, s.workspaceId),
    db.from("sync_log").select("id, direction, entity, rows_synced, rows_skipped, status, error_detail, started_at, finished_at").eq("workspace_id", s.workspaceId).order("started_at", { ascending: false }).limit(15),
    db.from("cr_changes").select("id, sheet, row_key, action, via, note, created_at, pushed_at, push_error, actor_id, before, after").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(60),
    db.from("cr_changes").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspaceId).is("pushed_at", null).neq("via", "sheet"),
    s.role === "owner" ? db.from("cr_api_tokens").select("id, label, token_hint, can_write, created_at, last_used_at, revoked_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("cr_rows").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspaceId).is("deleted_at", null),
  ]);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const manage = s.role === "owner" || s.role === "analyst";
  return (
    <div className="flex flex-col gap-6">
      {google && NOTICE[google] && <p role="status" className="rounded-neo neo-inset-sm px-4 py-3 text-sm text-ink">{NOTICE[google]}</p>}
      <Panel title="Google Sheets" eyebrow="Two-way sync" id="google">
        <SyncControls
          link={link} canManage={manage} googleConfigured={sheetsConfigured()} pending={pending.count ?? 0} rowCount={rows.count ?? 0}
          runs={(runs.data ?? []) as never}
        />
      </Panel>
      <Panel title="Change log" eyebrow="Audit trail" id="changes">
        <ChangeLog changes={(changes.data ?? []) as never} me={s.userId} />
      </Panel>
      <Panel title="Agent & API access" eyebrow="Connect your AI agents" id="api">
        <TokensPanel tokens={(tokens.data ?? []) as never} isOwner={s.role === "owner"} appUrl={appUrl} />
      </Panel>
    </div>
  );
}
