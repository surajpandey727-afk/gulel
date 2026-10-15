import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { decryptSecret } from "@/lib/crypto";
import { VoiceSettings } from "./voice-settings";

export const metadata = { title: "Voice DNA" };

export default async function VoicePage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ data: profile }, { data: versions }, { data: samples }, { data: feedback }, { data: draftsWithFidelity }] = await Promise.all([
    supabase.from("voice_profiles").select("active_version_id").eq("workspace_id", s.workspaceId).single(),
    supabase.from("voice_profile_versions").select("id, version_no, source, dna, generation_prompt, examples, preferences, created_at").eq("workspace_id", s.workspaceId).order("version_no", { ascending: false }),
    supabase.from("writing_samples").select("id, kind, title, body, is_encrypted, created_at").eq("workspace_id", s.workspaceId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("voice_feedback").select("id, disposition, preference_text, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(20),
    supabase.from("draft_versions").select("quality, created_at").eq("workspace_id", s.workspaceId).not("quality->fidelity_score", "is", null).order("created_at", { ascending: false }).limit(30),
  ]);
  const fidelityScores = (draftsWithFidelity ?? []).map((d) => ({ score: Number((d.quality as Record<string, unknown>).fidelity_score ?? (d.quality as Record<string, unknown>).tone_match ?? 0), date: d.created_at as string })).reverse();
  const decryptedSamples = (samples ?? []).map((s) => ({ ...s, body: s.is_encrypted ? decryptSecret(s.body) : s.body }));
  return <VoiceSettings activeId={profile?.active_version_id ?? null} versions={(versions ?? []) as never} samples={decryptedSamples} feedback={feedback ?? []} fidelityScores={fidelityScores} />;
}
