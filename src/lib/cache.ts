import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const mem = new Map<string, { value: unknown; expiresAt: number }>();
const MAX_MEM_ENTRIES = 500;

function evict() {
  if (mem.size <= MAX_MEM_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of mem) {
    if (v.expiresAt <= now) mem.delete(k);
  }
  if (mem.size > MAX_MEM_ENTRIES) {
    const oldest = [...mem.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < oldest.length - MAX_MEM_ENTRIES; i++) mem.delete(oldest[i][0]);
  }
}

export function memGet<T>(key: string): T | undefined {
  const entry = mem.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) { mem.delete(key); return undefined; }
  return entry.value as T;
}

export function memSet<T>(key: string, value: T, ttlMs: number): void {
  mem.set(key, { value, expiresAt: Date.now() + ttlMs });
  evict();
}

export function memDel(pattern: string): void {
  for (const k of mem.keys()) {
    if (k.startsWith(pattern)) mem.delete(k);
  }
}

export function cacheKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

const FIVE_MIN = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export async function cachedWorkspaceConfig(workspaceId: string) {
  const k = `ws:${workspaceId}`;
  const hit = memGet<Record<string, unknown>>(k);
  if (hit) return hit;
  const admin = createAdminClient();
  const { data } = await admin.from("workspaces").select("*").eq("id", workspaceId).single();
  if (data) memSet(k, data, FIVE_MIN);
  return data;
}

export async function cachedAgentConfig(workspaceId: string, agent: string) {
  const k = `agent:${workspaceId}:${agent}`;
  const hit = memGet<Record<string, unknown>>(k);
  if (hit) return hit;
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_configurations")
    .select("model, effort, monthly_budget_usd, on_budget_exhausted, prompt_version, connection_id")
    .eq("workspace_id", workspaceId)
    .eq("agent", agent)
    .single();
  if (data) memSet(k, data, FIVE_MIN);
  return data;
}

export async function cachedVoiceProfile(workspaceId: string) {
  const k = `voice:${workspaceId}`;
  const hit = memGet<Record<string, unknown>>(k);
  if (hit) return hit;
  const admin = createAdminClient();
  const { data } = await admin
    .from("voice_profiles")
    .select("id, workspace_id, version:voice_profile_versions!inner(id, dimensions, source, created_at)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { referencedTable: "voice_profile_versions", ascending: false })
    .limit(1, { referencedTable: "voice_profile_versions" })
    .maybeSingle();
  if (data) memSet(k, data, FIVE_MIN);
  return data;
}

export function invalidateWorkspace(workspaceId: string) {
  memDel(`ws:${workspaceId}`);
  memDel(`agent:${workspaceId}`);
  memDel(`voice:${workspaceId}`);
}

export async function llmCacheGet(hash: string): Promise<unknown | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("llm_cache")
    .select("response, expires_at")
    .eq("hash", hash)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) {
    await admin.from("llm_cache").delete().eq("hash", hash);
    return null;
  }
  return data.response;
}

export async function llmCacheSet(hash: string, workspaceId: string, agent: string, response: unknown, ttlMs: number = ONE_HOUR) {
  const admin = createAdminClient();
  await admin.from("llm_cache").upsert({
    hash,
    workspace_id: workspaceId,
    agent,
    response,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  });
}
