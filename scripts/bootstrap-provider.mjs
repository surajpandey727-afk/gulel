// Moves ANTHROPIC_API_KEY (+ optional ANTHROPIC_WORKSPACE_ID) from server env into the encrypted
// provider_connections store for every workspace that has none. Never prints the key.
// Usage: node --env-file=.env.local scripts/bootstrap-provider.mjs
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "node:crypto";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY not set");
const enc = (plain) => {
  const k = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY, "base64");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
};
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: wss } = await admin.from("workspaces").select("id");
for (const w of wss ?? []) {
  const { count } = await admin.from("provider_connections").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("provider", "anthropic");
  if (count) { console.log(`workspace ${w.id}: already has an Anthropic connection`); continue; }
  const { data: c, error } = await admin.from("provider_connections").insert({
    workspace_id: w.id, provider: "anthropic", label: "Anthropic (bootstrapped)", key_hint: `${key.slice(0, 7)}…${key.slice(-5)}`,
    anthropic_workspace_id: process.env.ANTHROPIC_WORKSPACE_ID || null, is_enabled: true, status: "not_configured",
  }).select("id").single();
  if (error) throw error;
  await admin.from("provider_secrets").insert({ connection_id: c.id, ciphertext: enc(key), key_version: 1 });
  console.log(`workspace ${w.id}: stored encrypted connection ${c.id}`);
}
