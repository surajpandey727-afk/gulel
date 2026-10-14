import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { VoiceSettings } from "./voice-settings";

export const metadata = { title: "Voice DNA" };

export default async function VoicePage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ data: profile }, { data: versions }, { data: samples }, { data: feedback }] = await Promise.all([
    supabase.from("voice_profiles").select("active_version_id").eq("workspace_id", s.workspaceId).single(),
    supabase.from("voice_profile_versions").select("id, version_no, source, dna, generation_prompt, examples, preferences, created_at").eq("workspace_id", s.workspaceId).order("version_no", { ascending: false }),
    supabase.from("writing_samples").select("id, kind, title, body, created_at").eq("workspace_id", s.workspaceId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("voice_feedback").select("id, disposition, preference_text, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(20),
  ]);
  return <VoiceSettings activeId={profile?.active_version_id ?? null} versions={(versions ?? []) as never} samples={samples ?? []} feedback={feedback ?? []} />;
}
