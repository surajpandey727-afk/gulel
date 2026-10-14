import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured, GatewayError } from "@/lib/ai/gateway";
import { PREFERENCE_SYSTEM, PreferenceSchema, VOICE_SYSTEM, VoiceExtractionSchema } from "@/lib/ai/agents/voice";
import { untrusted } from "@/lib/ai/agents/shared";

export interface VoiceVersion {
  id: string;
  version_no: number;
  source: string;
  dna: Record<string, unknown>;
  generation_prompt: string;
  examples: Array<{ excerpt: string; why: string }>;
  preferences: string[];
  created_at: string;
}

export async function getActiveVoice(workspaceId: string): Promise<{ profileId: string; version: VoiceVersion }> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("voice_profiles").select("id, active_version_id").eq("workspace_id", workspaceId).single();
  if (!profile?.active_version_id) throw new Error("Voice profile missing");
  const { data: version } = await supabase.from("voice_profile_versions").select("*").eq("id", profile.active_version_id).single();
  return { profileId: profile.id, version: version as unknown as VoiceVersion };
}

/** Compact, cacheable prompt block injected into every Governance/refine call. */
export function voicePromptBlock(v: VoiceVersion): string {
  const dna = v.dna as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(dna[k]) ? (dna[k] as string[]).join("; ") : "");
  return [
    `VOICE PROFILE (version ${v.version_no}, ${v.source}) — write exactly like this:`,
    v.generation_prompt,
    list("expressions_to_preserve") && `Preserve: ${list("expressions_to_preserve")}`,
    (list("avoided_phrases") || list("avoid")) && `Never use: ${list("avoided_phrases") || list("avoid")}`,
    list("expressions_to_reject") && `Reject: ${list("expressions_to_reject")}`,
    v.preferences.length ? `Founder corrections (override the above where they conflict):\n- ${v.preferences.join("\n- ")}` : "",
    v.examples.length ? `Representative excerpts of the founder's own writing:\n${v.examples.map((e) => `> ${e.excerpt}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

async function nextVersionNo(profileId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("voice_profile_versions").select("version_no").eq("profile_id", profileId).order("version_no", { ascending: false }).limit(1).single();
  return (data?.version_no ?? 0) + 1;
}

async function activate(profileId: string, versionId: string) {
  const supabase = await createClient();
  await supabase.from("voice_profiles").update({ active_version_id: versionId }).eq("id", profileId);
}

export async function extractVoice(workspaceId: string, userId: string) {
  const supabase = await createClient();
  const { data: samples } = await supabase.from("writing_samples").select("id, kind, title, body, is_negative").eq("workspace_id", workspaceId).is("deleted_at", null).order("created_at");
  if (!samples?.length) throw new Error("Add at least one writing sample first.");
  const positive = samples.filter((s) => !s.is_negative);
  if (!positive.length) throw new Error("Add at least one sample of your own writing (not only examples you dislike).");

  const { profileId, version: current } = await getActiveVoice(workspaceId);
  const input = [
    "Analyse these writing samples and produce the founder's Voice DNA.",
    untrusted("founder_writing_samples", positive.map((s) => ({ kind: s.kind, title: s.title, text: s.body }))),
    samples.some((s) => s.is_negative) ? untrusted("writing_the_founder_dislikes", samples.filter((s) => s.is_negative).map((s) => s.body)) : "",
  ].join("\n\n");

  const res = await runStructured({ workspaceId, agent: "voice", system: VOICE_SYSTEM, input, schema: VoiceExtractionSchema, userId, entity: { type: "voice_profile", id: profileId } });
  const versionNo = await nextVersionNo(profileId);
  const { data: v, error } = await supabase.from("voice_profile_versions").insert({
    workspace_id: workspaceId,
    profile_id: profileId,
    version_no: versionNo,
    source: "extraction",
    dna: res.data.dna,
    generation_prompt: res.data.generation_prompt,
    examples: res.data.representative_examples,
    preferences: current.source === "default" ? [] : current.preferences, // carry forward explicit corrections
    sample_ids: samples.map((s) => s.id),
    agent_execution_id: res.executionId,
    created_by: userId,
  }).select("id").single();
  if (error || !v) throw new Error(error?.message ?? "Could not save voice version");
  await activate(profileId, v.id);
  return { versionId: v.id, versionNo, confidenceNotes: res.data.confidence_notes };
}

export async function addPreference(workspaceId: string, userId: string, preference: string, replaces?: string | null) {
  const supabase = await createClient();
  const { profileId, version } = await getActiveVoice(workspaceId);
  const prefs = version.preferences.filter((p) => p !== replaces);
  if (!prefs.includes(preference)) prefs.push(preference);
  const { data: v } = await supabase.from("voice_profile_versions").insert({
    workspace_id: workspaceId, profile_id: profileId, version_no: await nextVersionNo(profileId), source: "preference",
    dna: version.dna, generation_prompt: version.generation_prompt, examples: version.examples, preferences: prefs, created_by: userId,
  }).select("id").single();
  if (v) await activate(profileId, v.id);
  return v?.id;
}

export async function rollbackVoice(workspaceId: string, userId: string, targetVersionId: string) {
  const supabase = await createClient();
  const { profileId } = await getActiveVoice(workspaceId);
  const { data: t } = await supabase.from("voice_profile_versions").select("*").eq("id", targetVersionId).eq("profile_id", profileId).single();
  if (!t) throw new Error("Version not found");
  const { data: v } = await supabase.from("voice_profile_versions").insert({
    workspace_id: workspaceId, profile_id: profileId, version_no: await nextVersionNo(profileId), source: "rollback",
    dna: t.dna, generation_prompt: t.generation_prompt, examples: t.examples, preferences: t.preferences, sample_ids: t.sample_ids, created_by: userId,
  }).select("id").single();
  if (v) await activate(profileId, v.id);
}

/** Proposes a generalisable preference from an edit; the founder decides whether to keep it. */
export async function proposePreference(workspaceId: string, userId: string, original: string, edited: string) {
  try {
    const res = await runStructured({
      workspaceId, agent: "voice", system: PREFERENCE_SYSTEM, schema: PreferenceSchema, userId, maxTokens: 2000,
      input: `${untrusted("ai_draft", original)}\n\n${untrusted("founder_edit", edited)}`,
    });
    return res.data;
  } catch (e) {
    if (e instanceof GatewayError) return null;
    throw e;
  }
}
