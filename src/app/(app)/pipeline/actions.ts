"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const Patch = z.object({
  stage: z.enum(["discovery", "meeting", "scoping", "proposal", "negotiation", "won", "lost", "nurture"]).optional(),
  value_amount: z.number().min(0).nullable().optional(),
  value_basis: z.enum(["pricing_assumption", "client_stated", "proposal", "contract"]).nullable().optional(),
  probability_pct: z.number().int().min(0).max(100).nullable().optional(),
  expected_close_on: z.string().nullable().optional(),
  actual_value_amount: z.number().min(0).nullable().optional(),
  reason_lost: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_due: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
  competitive_outcome: z.string().nullable().optional(),
  win_loss_notes: z.string().nullable().optional(),
  proposal_status: z.enum(["not_started", "drafting", "sent", "accepted", "declined"]).nullable().optional(),
});

export async function updateOpportunityAction(id: string, patch: z.input<typeof Patch>): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await getSession();
  const p = Patch.safeParse(patch);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.stage === "won" && p.data.actual_value_amount == null) return { ok: false, error: "Record the actual won value." };
  if (p.data.stage === "lost" && !p.data.reason_lost) return { ok: false, error: "Record why it was lost." };
  if (p.data.value_amount != null && !p.data.value_basis) return { ok: false, error: "Say what the value is based on." };
  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").update(p.data).eq("id", id).eq("workspace_id", s.workspaceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function generateBriefAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await getSession();
  try {
    const { generateMeetingBrief } = await import("@/lib/outreach/followup");
    await generateMeetingBrief(s.workspaceId, s.userId, id);
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
