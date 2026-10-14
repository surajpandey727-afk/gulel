import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { VoiceOnboarding } from "./voice-onboarding";

export const metadata = { title: "How do you write?" };

export default async function VoiceOnboardingPage() {
  const session = await getSession();
  const supabase = await createClient();
  const { count } = await supabase.from("writing_samples").select("id", { count: "exact", head: true }).eq("workspace_id", session.workspaceId).is("deleted_at", null);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:py-16">
      <p className="eyebrow mb-3">Voice DNA · one-time setup</p>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">How do you write?</h1>
      <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-ink-2">
        Paste writing that sounds like you: emails, LinkedIn messages, introductions, strategic observations, proposals,
        or the principles you write by. Add examples you dislike too. Every draft will use this profile.
        You won&apos;t need to paste it again.
      </p>
      <VoiceOnboarding existingSamples={count ?? 0} />
    </main>
  );
}
