"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { extractVoice } from "@/lib/voice/service";
import { GatewayError } from "@/lib/ai/gateway";
import { encryptSecret } from "@/lib/crypto";

const SampleInput = z.object({
  kind: z.enum(["email", "linkedin", "introduction", "observation", "proposal", "principles", "dislike", "other"]),
  title: z.string().max(200).optional(),
  body: z.string().trim().min(20, "Each sample needs at least 20 characters"),
});

async function markOnboarding(workspaceId: string, value: "completed" | "skipped") {
  const supabase = await createClient();
  const { data } = await supabase.from("workspace_settings").select("onboarding").eq("workspace_id", workspaceId).single();
  await supabase.from("workspace_settings").update({ onboarding: { ...(data?.onboarding as object), voice: value, voice_at: new Date().toISOString() } }).eq("workspace_id", workspaceId);
}

export type VoiceSubmitState = { ok: boolean; message: string | null; versionNo?: number; notes?: string };

export async function submitVoiceSamples(samples: Array<z.input<typeof SampleInput>>): Promise<VoiceSubmitState> {
  const session = await getSession();
  const parsed = z.array(SampleInput).min(1).safeParse(samples);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid samples" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("writing_samples").select("body").eq("workspace_id", session.workspaceId).is("deleted_at", null);
  const seen = new Set((existing ?? []).map((e) => e.body.trim()));
  const fresh = parsed.data.filter((s) => !seen.has(s.body.trim()));
  const { error } = fresh.length ? await supabase.from("writing_samples").insert(
    fresh.map((s) => {
      const { ciphertext } = encryptSecret(s.body);
      return { workspace_id: session.workspaceId, kind: s.kind, title: s.title || null, body: ciphertext, is_negative: s.kind === "dislike", is_encrypted: true, created_by: session.userId };
    }),
  ) : { error: null };
  if (error) return { ok: false, message: error.message };

  try {
    const r = await extractVoice(session.workspaceId, session.userId);
    await markOnboarding(session.workspaceId, "completed");
    revalidatePath("/", "layout");
    return { ok: true, message: null, versionNo: r.versionNo, notes: r.confidenceNotes };
  } catch (e) {
    // Samples are persisted regardless; extraction can be re-run from Settings → Voice DNA.
    const msg = e instanceof GatewayError ? `Your samples are saved, but the voice could not be analysed yet: ${e.message}` : (e as Error).message;
    return { ok: false, message: msg };
  }
}

export async function continueWithProvisionalVoice() {
  const session = await getSession();
  await markOnboarding(session.workspaceId, "skipped");
  revalidatePath("/", "layout");
}
