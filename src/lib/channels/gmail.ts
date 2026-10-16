import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, redact } from "@/lib/crypto";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
];
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(public status: number, message: string, public retryable: boolean) {
    super(message);
  }
}

export function gmailConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/gmail/oauth/callback`;
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenSet { access_token: string; refresh_token: string; expiry: number; scope: string }

export async function exchangeCode(code: string): Promise<TokenSet & { email: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(), grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new GmailError(res.status, redact(json.error_description ?? json.error ?? "token exchange failed"), false);
  if (!json.refresh_token) throw new GmailError(400, "Google did not return a refresh token. Remove the app's access in your Google account and reconnect.", false);
  const profile = await fetch(`${API}/profile`, { headers: { authorization: `Bearer ${json.access_token}` } }).then((r) => r.json());
  return { access_token: json.access_token, refresh_token: json.refresh_token, expiry: Date.now() + json.expires_in * 1000, scope: json.scope, email: profile.emailAddress };
}

export async function storeTokens(accountId: string, t: TokenSet) {
  const admin = createAdminClient();
  const { ciphertext, keyVersion } = encryptSecret(JSON.stringify(t));
  await admin.from("channel_account_secrets").upsert({ account_id: accountId, ciphertext, key_version: keyVersion, updated_at: new Date().toISOString() });
}

/** Returns a valid access token, refreshing (and persisting) when within 2 minutes of expiry. */
export async function accessToken(accountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("channel_account_secrets").select("ciphertext").eq("account_id", accountId).single();
  if (!data) throw new GmailError(401, "Gmail account has no stored credentials", false);
  const t = JSON.parse(decryptSecret(data.ciphertext)) as TokenSet;
  if (t.expiry - Date.now() > 120_000) return t.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const json = await res.json();
  if (!res.ok) {
    const { data: acc } = await admin.from("channel_accounts").select("workspace_id").eq("id", accountId).single();
    await admin.from("channel_accounts").update({ status: "awaiting_user_action", last_error: "Token refresh failed — reconnect Gmail" }).eq("id", accountId);
    if (acc) await admin.from("integration_events").insert({ workspace_id: acc.workspace_id, integration: "gmail", event: "token_refresh_failed", status: "error", detail: { http: res.status } });
    throw new GmailError(res.status, "Gmail token refresh failed; reconnect required", false);
  }
  const next = { ...t, access_token: json.access_token, expiry: Date.now() + json.expires_in * 1000 };
  await storeTokens(accountId, next);
  return next.access_token;
}

async function call<T>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(accountId);
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new GmailError(res.status, redact(text).slice(0, 500), res.status === 429); // 5xx on send is an UNKNOWN outcome — never auto-retried
  }
  return res.json() as Promise<T>;
}

function encodeHeader(v: string) {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

const SINGLE_ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

/** Header-injection safe: one plain address per field, no CR/LF anywhere in headers. */
export function buildMime(o: { from: string; to: string; subject: string; body: string; inReplyTo?: string; references?: string }) {
  for (const [k, val] of Object.entries({ from: o.from, to: o.to, subject: o.subject, inReplyTo: o.inReplyTo ?? "", references: o.references ?? "" })) {
    if (/[\r\n]/.test(val)) throw new GmailError(0, `Refusing to build email: line break in ${k}`, false);
  }
  if (!SINGLE_ADDRESS.test(o.to) || !SINGLE_ADDRESS.test(o.from)) throw new GmailError(0, "Refusing to build email: recipient and sender must each be a single plain address", false);
  const lines = [
    `From: ${o.from}`,
    `To: ${o.to}`,
    `Subject: ${encodeHeader(o.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (o.inReplyTo) lines.push(`In-Reply-To: ${o.inReplyTo}`);
  if (o.references) lines.push(`References: ${o.references}`);
  const raw = `${lines.join("\r\n")}\r\n\r\n${Buffer.from(o.body, "utf8").toString("base64")}`;
  return Buffer.from(raw).toString("base64url");
}

export interface GmailSendResult { id: string; threadId: string; labelIds?: string[] }

export async function sendMessage(accountId: string, mime: string, threadId?: string | null) {
  return call<GmailSendResult>(accountId, "/messages/send", { method: "POST", body: JSON.stringify({ raw: mime, threadId: threadId ?? undefined }) });
}

export async function upsertDraft(accountId: string, mime: string, draftId?: string | null) {
  if (draftId) {
    try {
      return await call<{ id: string; message: { id: string; threadId: string } }>(accountId, `/drafts/${draftId}`, { method: "PUT", body: JSON.stringify({ id: draftId, message: { raw: mime } }) });
    } catch (e) {
      if (!(e instanceof GmailError) || e.status !== 404) throw e;
    }
  }
  return call<{ id: string; message: { id: string; threadId: string } }>(accountId, "/drafts", { method: "POST", body: JSON.stringify({ message: { raw: mime } }) });
}

export async function deleteDraft(accountId: string, draftId: string) {
  const token = await accessToken(accountId);
  await fetch(`${API}/drafts/${draftId}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
}

export interface GmailMessage {
  id: string; threadId: string; internalDate: string; snippet: string; labelIds?: string[];
  payload: { headers: { name: string; value: string }[]; mimeType: string; body?: { data?: string }; parts?: GmailMessage["payload"][] };
}

export const getThread = (accountId: string, threadId: string) =>
  call<{ id: string; historyId: string; messages: GmailMessage[] }>(accountId, `/threads/${threadId}?format=full`);

export const getProfile = (accountId: string) => call<{ emailAddress: string; historyId: string }>(accountId, "/profile");

export const listHistory = (accountId: string, startHistoryId: string, pageToken?: string) =>
  call<{ history?: { messagesAdded?: { message: { id: string; threadId: string } }[] }[]; historyId: string; nextPageToken?: string }>(
    accountId,
    `/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded${pageToken ? `&pageToken=${pageToken}` : ""}`,
  );

export function header(m: GmailMessage, name: string) {
  return m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export function plainText(m: GmailMessage): string {
  const walk = (p: GmailMessage["payload"]): string | null => {
    if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const c of p.parts ?? []) {
      const t = walk(c);
      if (t) return t;
    }
    return null;
  };
  return walk(m.payload) ?? m.snippet;
}

/** Remove quoted history so classification sees only the new reply. */
export function stripQuoted(text: string): string {
  const cut = text.search(/\n(On .{5,200}wrote:|-{2,}\s*Original Message|From: .+\nSent: )/i);
  return (cut > 0 ? text.slice(0, cut) : text).split("\n").filter((l) => !l.startsWith(">")).join("\n").trim();
}
