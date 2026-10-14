import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_VERSION = 1;

function key(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not configured");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

/** AES-256-GCM. Output: base64(iv[12] | tag[16] | ciphertext). */
export function encryptSecret(plaintext: string): { ciphertext: string; keyVersion: number } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, tag, ct]).toString("base64"), keyVersion: KEY_VERSION };
}

export function decryptSecret(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Display hint that never reveals enough to reuse the key. */
export function maskSecret(secret: string): string {
  if (secret.length <= 12) return "••••";
  return `${secret.slice(0, 7)}…${secret.slice(-5)}`;
}

/** Strip anything that looks like a credential before logging or sending to an LLM. */
export function redact(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, "[REDACTED_ANTHROPIC_KEY]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/ya29\.[A-Za-z0-9_-]+/g, "[REDACTED_GOOGLE_TOKEN]")
    .replace(/1\/\/[A-Za-z0-9_-]{20,}/g, "[REDACTED_GOOGLE_REFRESH]");
}
