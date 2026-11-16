import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, getProfile, storeTokens, GMAIL_SCOPES } from "@/lib/channels/gmail";
import { SHEETS_SCOPES, SHEETS_STATE_COOKIE, exchangeSheetsCode, storeSheetsTokens } from "@/lib/central/google";

/** Google Sheets consent for the Central Repository shares this registered redirect URI. */
async function handleSheets(req: NextRequest, stored: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL!;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return NextResponse.redirect(new URL("/central/sync?google=denied", base));
  if (!code || !state || stored.split(".")[0] !== state) return NextResponse.redirect(new URL("/central/sync?google=state_mismatch", base));
  const workspaceId = stored.split(".")[1];
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", auth.user?.id ?? "").maybeSingle();
  if (!auth.user || !["owner", "analyst"].includes(member?.role ?? "")) return NextResponse.redirect(new URL("/central/sync?google=forbidden", base));
  const admin = createAdminClient();
  try {
    const t = await exchangeSheetsCode(code);
    const granted = t.scope.split(" ");
    const missing = SHEETS_SCOPES.filter((sc) => sc.startsWith("https://") && !granted.includes(sc));
    if (missing.length) return NextResponse.redirect(new URL("/central/sync?google=missing_scopes", base));
    await storeSheetsTokens(workspaceId, { access_token: t.access_token, refresh_token: t.refresh_token, expiry: t.expiry, scope: t.scope });
    await admin.from("cr_link").upsert({ workspace_id: workspaceId, account_email: t.email, last_status: "connected", last_error: null, updated_at: new Date().toISOString() });
    await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: auth.user.id, action: "google_sheets.connected", entity_type: "cr_link", entity_id: workspaceId, metadata: { email: t.email } });
    return NextResponse.redirect(new URL("/central/sync?google=connected", base));
  } catch (e) {
    await admin.from("integration_events").insert({ workspace_id: workspaceId, integration: "google_sheets", event: "connect_failed", status: "error", detail: { message: (e as Error).message } });
    return NextResponse.redirect(new URL("/central/sync?google=error", base));
  }
}

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL!;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  const jar = await cookies();
  const sheetsState = jar.get(SHEETS_STATE_COOKIE)?.value;
  if (sheetsState && sheetsState.split(".")[0] === state) {
    jar.delete(SHEETS_STATE_COOKIE);
    return handleSheets(req, sheetsState);
  }
  const stored = jar.get("gmail_oauth_state")?.value;
  jar.delete("gmail_oauth_state");
  if (err) return NextResponse.redirect(new URL(`/settings/integrations?gmail=denied`, base));
  if (!code || !state || !stored || stored.split(".")[0] !== state) return NextResponse.redirect(new URL(`/settings/integrations?gmail=state_mismatch`, base));
  const workspaceId = stored.split(".")[1];

  // The user must still be signed in and a member of that workspace.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: member } = await supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", auth.user?.id ?? "").maybeSingle();
  if (!auth.user || member?.role !== "owner") return NextResponse.redirect(new URL(`/settings/integrations?gmail=forbidden`, base));

  try {
    const t = await exchangeCode(code);
    const granted = t.scope.split(" ");
    const missing = GMAIL_SCOPES.filter((s) => s.startsWith("https://") && !granted.includes(s));
    const admin = createAdminClient();
    const { data: acc, error } = await admin.from("channel_accounts").upsert({
      workspace_id: workspaceId, channel: "gmail", account_email: t.email, display_name: t.email,
      status: missing.length ? "permission_restricted" : "connected", scopes: granted, connected_by: auth.user.id, last_error: missing.length ? `Missing scopes: ${missing.join(", ")}` : null,
    }, { onConflict: "workspace_id,channel,account_email" }).select("id").single();
    if (error || !acc) throw new Error(error?.message);
    await storeTokens(acc.id, { access_token: t.access_token, refresh_token: t.refresh_token, expiry: t.expiry, scope: t.scope });
    const profile = await getProfile(acc.id);
    await admin.from("channel_accounts").update({ history_id: profile.historyId, last_sync_at: new Date().toISOString() }).eq("id", acc.id);
    await admin.from("integration_events").insert({ workspace_id: workspaceId, integration: "gmail", event: "connected", status: missing.length ? "warning" : "ok", detail: { email: t.email, missing } });
    await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: auth.user.id, action: "gmail.connected", entity_type: "channel_account", entity_id: acc.id, metadata: { email: t.email } });
    return NextResponse.redirect(new URL(`/settings/integrations?gmail=connected`, base));
  } catch (e) {
    const admin = createAdminClient();
    await admin.from("integration_events").insert({ workspace_id: workspaceId, integration: "gmail", event: "connect_failed", status: "error", detail: { message: (e as Error).message } });
    return NextResponse.redirect(new URL(`/settings/integrations?gmail=error`, base));
  }
}
