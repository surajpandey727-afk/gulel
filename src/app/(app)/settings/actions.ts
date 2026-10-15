"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { testConnection } from "@/lib/ai/gateway";
import { CLAUDE_MODELS } from "@/lib/ai/models";
import { validateWeights } from "@/lib/scoring/model";
import { extractVoice, rollbackVoice, addPreference, saveManualDna } from "@/lib/voice/service";
import { tick } from "@/lib/jobs/worker";

type R<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function owner() {
  const s = await getSession();
  if (s.role !== "owner") throw new Error("Only the workspace owner can change this setting.");
  return s;
}
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: (e as Error).message });

/* ------------------------------------------------ AI providers */
export async function saveProviderAction(input: { id?: string; provider: "anthropic" | "omniroute"; label: string; apiKey?: string; baseUrl?: string; anthropicWorkspaceId?: string }): Promise<R<string>> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    const label = input.label.trim() || (input.provider === "anthropic" ? "Anthropic" : "OmniRoute");
    if (input.provider === "anthropic" && input.apiKey && !/^sk-ant-/.test(input.apiKey.trim())) return { ok: false, error: "That does not look like an Anthropic key (sk-ant-…)." };
    if (input.baseUrl && !/^https:\/\//.test(input.baseUrl)) return { ok: false, error: "Base URL must use https." };
    const row = {
      workspace_id: s.workspaceId, provider: input.provider, label, base_url: input.baseUrl?.trim() || null,
      anthropic_workspace_id: input.anthropicWorkspaceId?.trim() || null, created_by: s.userId,
      ...(input.apiKey ? { key_hint: maskSecret(input.apiKey.trim()), rotated_at: input.id ? new Date().toISOString() : null, status: "not_configured" } : {}),
      // a newly added non-Anthropic gateway is never enabled automatically
      ...(!input.id ? { is_enabled: false } : {}),
    };
    const { data, error } = input.id
      ? await admin.from("provider_connections").update(row).eq("id", input.id).eq("workspace_id", s.workspaceId).select("id").single()
      : await admin.from("provider_connections").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Save failed" };
    if (input.apiKey) {
      const { ciphertext, keyVersion } = encryptSecret(input.apiKey.trim());
      await admin.from("provider_secrets").upsert({ connection_id: data.id, ciphertext, key_version: keyVersion });
    }
    await admin.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: input.apiKey ? (input.id ? "provider.key_rotated" : "provider.added") : "provider.updated", entity_type: "provider_connection", entity_id: data.id, metadata: { provider: input.provider, label } });
    revalidatePath("/settings/providers");
    return { ok: true, data: data.id, message: input.apiKey ? "Key stored encrypted. Run a connection test." : "Saved." };
  } catch (e) { return fail(e); }
}

export async function testProviderAction(id: string): Promise<R<{ model?: string; latencyMs: number }>> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    const { data: c } = await admin.from("provider_connections").select("id, provider, anthropic_workspace_id").eq("id", id).eq("workspace_id", s.workspaceId).single();
    if (!c) return { ok: false, error: "Not found" };
    if (c.provider !== "anthropic") return { ok: false, error: "Connection tests for this provider are not available in this build." };
    const { data: sec } = await admin.from("provider_secrets").select("ciphertext").eq("connection_id", id).maybeSingle();
    if (!sec) return { ok: false, error: "No key stored." };
    const r = await testConnection(decryptSecret(sec.ciphertext), c.anthropic_workspace_id);
    const status = r.ok ? "connected" : r.status === 429 ? "rate_limited" : r.status === 401 || r.status === 403 ? "permission_restricted" : "failed";
    await admin.from("provider_connections").update({ status, last_tested_at: new Date().toISOString(), last_test_result: r }).eq("id", id);
    await admin.from("integration_events").insert({ workspace_id: s.workspaceId, integration: "anthropic", event: "connection_test", status: r.ok ? "ok" : "error", detail: r });
    revalidatePath("/settings/providers");
    return r.ok ? { ok: true, data: { model: r.model, latencyMs: r.latencyMs }, message: `Connected (${r.model}, ${r.latencyMs} ms).` } : { ok: false, error: r.error };
  } catch (e) { return fail(e); }
}

export async function toggleProviderAction(id: string, enabled: boolean): Promise<R> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    const { data: c } = await admin.from("provider_connections").select("provider").eq("id", id).eq("workspace_id", s.workspaceId).single();
    if (!c) return { ok: false, error: "Not found" };
    if (enabled && c.provider !== "anthropic") {
      const { data: conn } = await admin.from("provider_connections").select("base_url").eq("id", id).single();
      if (!conn?.base_url) return { ok: false, error: "Non-Anthropic providers need a base URL configured before they can be enabled." };
    }
    await admin.from("provider_connections").update({ is_enabled: enabled, status: enabled ? undefined : "disabled" }).eq("id", id).eq("workspace_id", s.workspaceId);
    await admin.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: enabled ? "provider.enabled" : "provider.disabled", entity_type: "provider_connection", entity_id: id });
    revalidatePath("/settings/providers");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function revokeProviderKeyAction(id: string): Promise<R> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    const { data: own } = await admin.from("provider_connections").select("id").eq("id", id).eq("workspace_id", s.workspaceId).maybeSingle();
    if (!own) return { ok: false, error: "Not found" };
    await admin.from("provider_secrets").delete().eq("connection_id", own.id);
    await admin.from("provider_connections").update({ is_enabled: false, status: "not_configured", key_hint: null }).eq("id", id).eq("workspace_id", s.workspaceId);
    await admin.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "provider.key_revoked", entity_type: "provider_connection", entity_id: id });
    revalidatePath("/settings/providers");
    return { ok: true, message: "Key removed from storage. Also revoke it in the Anthropic Console." };
  } catch (e) { return fail(e); }
}

const AgentCfg = z.object({ agent: z.enum(["discovery", "governance", "analyst", "voice", "classifier", "fidelity"]), model: z.string(), effort: z.enum(["low", "medium", "high", "xhigh", "max"]), monthly_budget_usd: z.number().min(0).max(10000), on_budget_exhausted: z.enum(["pause", "warn"]), connection_id: z.string().uuid().nullable() });
export async function saveAgentConfigAction(input: z.input<typeof AgentCfg>): Promise<R> {
  try {
    const s = await owner();
    const p = AgentCfg.parse(input);
    if (!(p.model in CLAUDE_MODELS)) return { ok: false, error: "Only supported Claude models can be assigned." };
    const supabase = await createClient();
    const { data: before } = await supabase.from("agent_configurations").select("model, effort, monthly_budget_usd").eq("workspace_id", s.workspaceId).eq("agent", p.agent).single();
    await supabase.from("agent_configurations").update(p).eq("workspace_id", s.workspaceId).eq("agent", p.agent);
    await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "agent.config_changed", before, after: p });
    revalidatePath("/settings/providers");
    return { ok: true, message: "Saved." };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------ Gmail */
export async function disconnectGmailAction(accountId: string): Promise<R> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    const { data: own } = await admin.from("channel_accounts").select("id").eq("id", accountId).eq("workspace_id", s.workspaceId).maybeSingle();
    if (!own) return { ok: false, error: "Not found" };
    await admin.from("channel_account_secrets").delete().eq("account_id", own.id);
    await admin.from("channel_accounts").update({ status: "disconnected" }).eq("id", accountId).eq("workspace_id", s.workspaceId);
    await admin.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "gmail.disconnected", entity_type: "channel_account", entity_id: accountId });
    revalidatePath("/settings/integrations");
    return { ok: true, message: "Disconnected and tokens deleted. Also remove access at myaccount.google.com/permissions." };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------ Scoring */
export async function saveScoringAction(weights: Record<string, number>, threshold: number, halfLife: number, notes: string): Promise<R> {
  try {
    const s = await owner();
    const err = validateWeights(weights);
    if (err) return { ok: false, error: err };
    const supabase = await createClient();
    const { data: last } = await supabase.from("scoring_models").select("version_no").eq("workspace_id", s.workspaceId).order("version_no", { ascending: false }).limit(1).single();
    await supabase.from("scoring_models").update({ is_active: false }).eq("workspace_id", s.workspaceId).eq("is_active", true);
    const { error } = await supabase.from("scoring_models").insert({ workspace_id: s.workspaceId, version_no: (last?.version_no ?? 0) + 1, weights, qualified_threshold: threshold, freshness_half_life_days: halfLife, is_active: true, notes, created_by: s.userId });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings/scoring");
    return { ok: true, message: "New scoring version active. Existing scores keep their original version until re-qualified." };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------ Policies */
export async function savePoliciesAction(p: { daily_send_cap: number; min_hours_between_org_sends: number; approval_ttl_hours: number; require_compliance_check: boolean; pricing_ranges: Record<string, { currency: string; min: number; typical: number; max: number }> }): Promise<R> {
  try {
    const s = await owner();
    const supabase = await createClient();
    const { error } = await supabase.from("workspace_settings").update(p).eq("workspace_id", s.workspaceId);
    if (error) return { ok: false, error: error.message };
    await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "policies.updated", after: p });
    revalidatePath("/settings/policies");
    return { ok: true, message: "Saved." };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------ Voice */
export async function reExtractVoiceAction(): Promise<R> {
  try {
    const s = await getSession();
    const r = await extractVoice(s.workspaceId, s.userId);
    const supabase = await createClient();
    const { data } = await supabase.from("workspace_settings").select("onboarding").eq("workspace_id", s.workspaceId).single();
    await supabase.from("workspace_settings").update({ onboarding: { ...(data?.onboarding as object), voice: "completed" } }).eq("workspace_id", s.workspaceId);
    revalidatePath("/settings/voice");
    return { ok: true, message: `Voice DNA v${r.versionNo} extracted and active.` };
  } catch (e) { return fail(e); }
}
export async function rollbackVoiceAction(versionId: string): Promise<R> {
  try { const s = await getSession(); await rollbackVoice(s.workspaceId, s.userId, versionId); revalidatePath("/settings/voice"); return { ok: true, message: "Rolled back (as a new version)." }; } catch (e) { return fail(e); }
}
export async function addPreferenceAction(text: string): Promise<R> {
  try { const s = await getSession(); if (text.trim().length < 5) return { ok: false, error: "Write the preference as an instruction." }; await addPreference(s.workspaceId, s.userId, text.trim()); revalidatePath("/settings/voice"); return { ok: true, message: "Preference added." }; } catch (e) { return fail(e); }
}
export async function addSampleAction(kind: string, body: string): Promise<R> {
  try {
    const s = await getSession();
    if (body.trim().length < 20) return { ok: false, error: "Samples need at least 20 characters." };
    const supabase = await createClient();
    const { ciphertext } = encryptSecret(body.trim());
    await supabase.from("writing_samples").insert({ workspace_id: s.workspaceId, kind, body: ciphertext, is_negative: kind === "dislike", is_encrypted: true, created_by: s.userId });
    revalidatePath("/settings/voice");
    return { ok: true, message: "Sample saved. Re-extract to fold it into the profile." };
  } catch (e) { return fail(e); }
}
export async function saveManualDnaAction(dna: Record<string, unknown>): Promise<R> {
  try {
    const s = await owner();
    const r = await saveManualDna(s.workspaceId, s.userId, dna);
    revalidatePath("/settings/voice");
    return { ok: true, message: `Manual DNA v${r.versionNo} saved and active.` };
  } catch (e) { return fail(e); }
}
export async function deleteSampleAction(id: string): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  await supabase.from("writing_samples").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath("/settings/voice");
  return { ok: true };
}

/* ------------------------------------------------ Operations & data */
export async function runWorkerAction(): Promise<R> {
  try { await owner(); const r = await tick("manual"); revalidatePath("/settings/operations"); return { ok: true, message: `Processed ${r.length} job(s): ${r.filter((x) => x.ok).length} ok, ${r.filter((x) => !x.ok).length} failed.` }; } catch (e) { return fail(e); }
}
export async function retryJobAction(id: string): Promise<R> {
  const s = await owner().catch((e) => e as Error);
  if (s instanceof Error) return fail(s);
  const supabase = await createClient();
  await supabase.from("jobs").update({ status: "queued", run_after: new Date().toISOString(), attempts: 0, last_error: null }).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath("/settings/operations");
  return { ok: true };
}
export async function resetDemoAction(): Promise<R> {
  try { const s = await owner(); const supabase = await createClient(); const { data, error } = await supabase.rpc("reset_demo_data", { p_workspace_id: s.workspaceId }); if (error) return { ok: false, error: error.message }; revalidatePath("/", "layout"); return { ok: true, message: `Removed ${(data as { organisations: number }).organisations} demo organisations.` }; } catch (e) { return fail(e); }
}
export async function removeSuppressionAction(id: string): Promise<R> {
  try {
    const s = await owner();
    const supabase = await createClient();
    const { data: e } = await supabase.from("suppression_entries").select("*").eq("id", id).single();
    await supabase.from("suppression_entries").delete().eq("id", id).eq("workspace_id", s.workspaceId);
    await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "suppression.removed", before: e });
    revalidatePath("/settings/security");
    return { ok: true };
  } catch (e) { return fail(e); }
}
