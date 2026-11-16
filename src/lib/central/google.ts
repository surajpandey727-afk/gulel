import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, redact } from "@/lib/crypto";

export const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
];
export const SHEETS_STATE_COOKIE = "cr_oauth_state";

export class SheetsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function sheetsConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Reuses the redirect URI already registered for Gmail; the callback branches on the state cookie.
function redirectUri() {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/api/gmail/oauth/callback`;
}

export function sheetsAuthUrl(state: string, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code",
    scope: SHEETS_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenSet { access_token: string; refresh_token: string; expiry: number; scope: string }

export async function exchangeSheetsCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const json = await res.json();
  if (!res.ok) throw new SheetsError(res.status, redact(json.error_description ?? json.error ?? "token exchange failed"));
  if (!json.refresh_token) throw new SheetsError(400, "Google did not return a refresh token. Remove gulel's access in your Google account and reconnect.");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${json.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  return { access_token: json.access_token as string, refresh_token: json.refresh_token as string, expiry: Date.now() + json.expires_in * 1000, scope: json.scope as string, email: (info.email as string) ?? null };
}

export async function storeSheetsTokens(workspaceId: string, t: TokenSet) {
  const admin = createAdminClient();
  const { ciphertext, keyVersion } = encryptSecret(JSON.stringify(t));
  await admin.from("cr_link_secrets").upsert({ workspace_id: workspaceId, ciphertext, key_version: keyVersion, updated_at: new Date().toISOString() });
}

async function accessToken(workspaceId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("cr_link_secrets").select("ciphertext").eq("workspace_id", workspaceId).maybeSingle();
  if (!data) throw new SheetsError(401, "Google Sheets is not connected. Connect it under Central Repository → Sync.");
  const t = JSON.parse(decryptSecret(data.ciphertext)) as TokenSet;
  if (t.expiry - Date.now() > 120_000) return t.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const json = await res.json();
  if (!res.ok) {
    await admin.from("cr_link").update({ last_status: "error", last_error: "Google token refresh failed. Reconnect Google Sheets." }).eq("workspace_id", workspaceId);
    throw new SheetsError(401, "Google token refresh failed. Reconnect Google Sheets.");
  }
  const next = { ...t, access_token: json.access_token, expiry: Date.now() + json.expires_in * 1000 };
  await storeSheetsTokens(workspaceId, next);
  return next.access_token;
}

async function gfetch<T>(workspaceId: string, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(workspaceId);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error?.message ?? text; } catch {}
    throw new SheetsError(res.status, redact(msg).slice(0, 600));
  }
  return res.json() as Promise<T>;
}

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export function parseSpreadsheetId(input: string) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

export async function getSpreadsheetMeta(workspaceId: string, id: string) {
  return gfetch<{ spreadsheetId: string; spreadsheetUrl: string; properties: { title: string }; sheets: { properties: { title: string; gridProperties: { rowCount: number; columnCount: number } } }[] }>(
    workspaceId, `${SHEETS_API}/${id}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(title,gridProperties)`,
  );
}

export async function batchGet(workspaceId: string, id: string, ranges: string[]) {
  const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER", majorDimension: "ROWS" });
  for (const r of ranges) qs.append("ranges", r);
  const res = await gfetch<{ valueRanges: { range: string; values?: unknown[][] }[] }>(workspaceId, `${SHEETS_API}/${id}/values:batchGet?${qs}`);
  return res.valueRanges;
}

export async function batchUpdate(workspaceId: string, id: string, data: { range: string; majorDimension: "ROWS" | "COLUMNS"; values: unknown[][] }[]) {
  if (!data.length) return;
  for (let i = 0; i < data.length; i += 200) {
    await gfetch(workspaceId, `${SHEETS_API}/${id}/values:batchUpdate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: data.slice(i, i + 200) }),
    });
  }
}

/** Upload an .xlsx to the connected Drive as a native Google Sheet (keeps formulas, validation and named ranges). */
export async function createSheetFromXlsx(workspaceId: string, xlsx: ArrayBuffer, name: string) {
  const boundary = `gulel${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name, mimeType: "application/vnd.google-apps.spreadsheet" });
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  const body = new Blob([head, new Uint8Array(xlsx), `\r\n--${boundary}--`]);
  return gfetch<{ id: string; webViewLink: string }>(workspaceId, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true", {
    method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body,
  });
}

export const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;
