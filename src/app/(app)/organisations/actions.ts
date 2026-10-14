"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { addContact, addEvidence, createOrganisation } from "@/lib/orgs/service";
import { overrideQualification, runQualification } from "@/lib/qualification/service";
import { GatewayError } from "@/lib/ai/gateway";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof GatewayError || e instanceof Error ? e.message : "Something went wrong" });

const OrgSchema = z.object({
  trading_name: z.string().trim().min(2, "Trading name is required"),
  legal_name: z.string().optional(),
  website: z.string().optional(),
  registration_number: z.string().optional(),
  primary_market: z.enum(["UK", "IN"]),
  sector: z.string().optional(),
  headquarters: z.string().optional(),
  relationship_status: z.enum(["prospect", "client", "former_client", "partner", "in_conversation", "do_not_contact"]).default("prospect"),
  description: z.string().optional(),
});

export async function createOrganisationAction(input: z.input<typeof OrgSchema>): Promise<ActionResult<string>> {
  const s = await getSession();
  const p = OrgSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    const id = await createOrganisation(s.workspaceId, s.userId, p.data);
    revalidatePath("/organisations");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

const ContactSchema = z.object({
  organisation_id: z.string().uuid(),
  full_name: z.string().trim().min(2, "Name is required"),
  title: z.string().optional(),
  email: z.string().optional(),
  linkedin_url: z.string().optional(),
  market: z.enum(["UK", "IN"]).nullable().optional(),
  subscriber_type: z.enum(["corporate", "individual", "unknown"]).default("unknown"),
  email_verified: z.boolean().default(false),
  verification_note: z.string().optional(),
});

export async function addContactAction(input: z.input<typeof ContactSchema>): Promise<ActionResult<string>> {
  const s = await getSession();
  const p = ContactSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.email_verified && !(p.data.verification_note ?? "").trim()) return { ok: false, error: "Say how the email was verified (e.g. 'signature on their reply')." };
  try {
    const id = await addContact(s.workspaceId, s.userId, p.data.organisation_id, { ...p.data, source: p.data.email_verified ? `manual: ${p.data.verification_note}` : "manual" });
    revalidatePath(`/organisations/${p.data.organisation_id}`);
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

const EvidenceSchema = z.object({
  organisation_id: z.string().uuid(),
  claim_field: z.string().min(3),
  claim_text: z.string().trim().min(5, "Describe the claim"),
  fact_type: z.enum(["reported_fact", "dated_filing", "third_party_estimate", "inference", "unknown"]),
  source_name: z.string().trim().min(2, "Name the source"),
  source_url: z.string().optional(),
  published_at: z.string().optional(),
  excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1),
  value_numeric: z.number().nullable().optional(),
  value_currency: z.enum(["GBP", "INR", "USD"]).nullable().optional(),
  value_as_of: z.string().optional(),
});

export async function addEvidenceAction(input: z.input<typeof EvidenceSchema>): Promise<ActionResult<string>> {
  const s = await getSession();
  const p = EvidenceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.fact_type !== "inference" && p.data.fact_type !== "unknown" && !p.data.source_url && p.data.source_name.toLowerCase() !== "founder knowledge") {
    return { ok: false, error: "Facts need a source URL (or set the source to 'Founder knowledge')." };
  }
  try {
    const id = await addEvidence(s.workspaceId, s.userId, {
      ...p.data,
      published_at: p.data.published_at || null,
      value_as_of: p.data.value_as_of || null,
      is_adverse: p.data.claim_field === "diligence.adverse",
    });
    revalidatePath(`/organisations/${p.data.organisation_id}`);
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

export async function runQualificationAction(organisationId: string): Promise<ActionResult<{ score: number; band: string }>> {
  const s = await getSession();
  try {
    const r = await runQualification(s.workspaceId, s.userId, organisationId);
    revalidatePath(`/organisations/${organisationId}`);
    revalidatePath("/qualification");
    return { ok: true, data: { score: r.score, band: r.band } };
  } catch (e) { return fail(e); }
}

export async function overrideQualificationAction(organisationId: string, qualificationId: string, score: number, reason: string): Promise<ActionResult> {
  const s = await getSession();
  try {
    await overrideQualification(s.workspaceId, s.userId, qualificationId, score, reason);
    revalidatePath(`/organisations/${organisationId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function reviewRiskFlagAction(flagId: string, organisationId: string, status: "confirmed" | "dismissed"): Promise<ActionResult> {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("organisation_risk_flags").update({ status, reviewed_by: s.userId, reviewed_at: new Date().toISOString() }).eq("id", flagId).eq("workspace_id", s.workspaceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/organisations/${organisationId}`);
  return { ok: true };
}

export async function suppressAction(kind: "organisation" | "contact" | "email" | "domain", value: string, reason: "do_not_contact" | "opt_out" | "manual", path: string): Promise<ActionResult> {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("suppression_entries").upsert({ workspace_id: s.workspaceId, kind, value, reason, created_by: s.userId }, { onConflict: "workspace_id,kind,value" });
  if (error) return { ok: false, error: error.message };
  if (kind === "organisation") await supabase.from("organisations").update({ relationship_status: "do_not_contact" }).eq("id", value);
  if (kind === "contact") await supabase.from("contacts").update({ opted_out_at: new Date().toISOString(), outreach_status: "do_not_contact" }).eq("id", value);
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "suppression.added", metadata: { kind, value, reason } });
  revalidatePath(path);
  return { ok: true };
}
