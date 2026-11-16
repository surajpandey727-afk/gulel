import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LinkState {
  spreadsheet_id: string | null; spreadsheet_url: string | null; account_email: string | null; auto_push: boolean;
  last_pull_at: string | null; last_push_at: string | null; last_status: string | null; last_error: string | null;
}

export async function getLinkState(db: SupabaseClient, workspaceId: string): Promise<LinkState | null> {
  const { data } = await db.from("cr_link").select("spreadsheet_id, spreadsheet_url, account_email, auto_push, last_pull_at, last_push_at, last_status, last_error").eq("workspace_id", workspaceId).maybeSingle();
  return (data as LinkState | null) ?? null;
}

export function linkProps(l: LinkState | null) {
  const last = [l?.last_pull_at, l?.last_push_at].filter(Boolean).sort().at(-1) ?? null;
  return { url: l?.spreadsheet_url ?? null, lastSync: last, autoSync: l?.auto_push ?? true, status: l?.last_status ?? null, error: l?.last_error ?? null, connected: !!l?.account_email };
}
