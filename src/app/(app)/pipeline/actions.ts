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

const NewOpp = z.object({
  name: z.string().trim().min(3, "Name the opportunity"),
  organisation_id: z.string().uuid(),
  market: z.enum(["UK", "IN"]),
  currency: z.enum(["GBP", "INR", "USD"]),
  stage: z.enum(["discovery", "meeting", "scoping", "proposal", "negotiation", "won", "lost", "nurture"]).default("discovery"),
  value_amount: z.number().min(0).nullable().optional(),
  value_basis: z.enum(["pricing_assumption", "client_stated", "proposal", "contract"]).nullable().optional(),
  probability_pct: z.number().int().min(0).max(100).nullable().optional(),
  expected_close_on: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
});

export async function createOpportunityAction(input: z.input<typeof NewOpp>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = await getSession();
  const p = NewOpp.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.value_amount != null && !p.data.value_basis) return { ok: false, error: "Say what the value is based on." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").insert({
    workspace_id: s.workspaceId, created_by: s.userId, ...p.data,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "opportunity.created", entity_type: "opportunity", entity_id: data.id });
  revalidatePath("/pipeline");
  return { ok: true, id: data.id };
}

const MeetingPatch = z.object({
  status: z.enum(["requested", "booked", "held", "cancelled", "no_show"]).optional(),
  notes: z.string().nullable().optional(),
  meeting_at: z.string().nullable().optional(),
});

export async function updateMeetingAction(id: string, patch: z.input<typeof MeetingPatch>): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await getSession();
  const p = MeetingPatch.safeParse(patch);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update(p.data).eq("id", id).eq("workspace_id", s.workspaceId);
  if (error) return { ok: false, error: error.message };
  if (p.data.status === "held") {
    const { data: m } = await supabase.from("meetings").select("opportunity_id").eq("id", id).single();
    if (m?.opportunity_id) {
      await supabase.from("opportunities").update({ stage: "scoping" }).eq("id", m.opportunity_id).eq("stage", "meeting");
    }
  }
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
