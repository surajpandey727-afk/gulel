import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ApiCaller { workspaceId: string; canWrite: boolean; label: string; tokenId: string }

export async function authenticate(req: Request): Promise<ApiCaller | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : req.headers.get("x-api-key")?.trim();
  if (!token || !token.startsWith("cr_")) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("cr_api_tokens").select("id, workspace_id, can_write, label, revoked_at")
    .eq("token_hash", createHash("sha256").update(token).digest("hex")).maybeSingle();
  if (!data || data.revoked_at) return null;
  await admin.from("cr_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { workspaceId: data.workspace_id, canWrite: data.can_write, label: data.label, tokenId: data.id };
}

export const unauthorized = () => Response.json({ error: "Missing or invalid API token. Create one in gulel: Central Repository, Sync & access." }, { status: 401 });
export const readOnly = () => Response.json({ error: "This token is read-only." }, { status: 403 });
