"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { addContact, addEvidence, createOrganisation } from "@/lib/orgs/service";
import { overrideQualification, runQualification } from "@/lib/qualification/service";
import { GatewayError } from "@/lib/ai/gateway";
import { createClient } from "@/lib/supabase/server";
import { companiesHouseConfigured } from "@/lib/discovery/companies-house";
import { enqueueJob } from "@/lib/jobs/enqueue";

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

const CreateOrgSchema = OrgSchema.extend({
  linkedin_url: z.string().optional(),
  decision_makers: z.array(z.object({ name: z.string(), title: z.string(), linkedin_url: z.string().nullable() })).optional(),
});

export async function createOrganisationAction(input: z.input<typeof CreateOrgSchema>): Promise<ActionResult<string>> {
  const s = await getSession();
  const p = CreateOrgSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    const id = await createOrganisation(s.workspaceId, s.userId, p.data);

    // Store LinkedIn URL as an org-level channel
    if (p.data.linkedin_url) {
      const supabase = await createClient();
      await supabase.from("contact_channels").insert({
        workspace_id: s.workspaceId, organisation_id: id, channel: "linkedin",
        value: p.data.linkedin_url, source: "linkedin_lookup",
      });
    }

    // Add decision-makers as contacts
    if (p.data.decision_makers?.length) {
      for (const dm of p.data.decision_makers.slice(0, 10)) {
        try {
          await addContact(s.workspaceId, s.userId, id, {
            full_name: dm.name, title: dm.title, linkedin_url: dm.linkedin_url,
            subscriber_type: "corporate", source: "linkedin_lookup",
          });
        } catch { /* duplicate names are OK to skip */ }
      }
    }

    // Sequential agent pipeline (fire-and-forget, errors don't block creation)
    triggerEnrichmentPipeline(s.workspaceId, s.userId, id, p.data).catch(() => {});

    revalidatePath("/organisations");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

async function triggerEnrichmentPipeline(workspaceId: string, userId: string, orgId: string, input: z.infer<typeof CreateOrgSchema>) {
  // Queue full enrichment pipeline as background jobs
  try { await enqueueJob(workspaceId, "people_discovery", { organisation_id: orgId, user_id: userId }, { timeoutSeconds: 600 }); } catch { /* non-fatal */ }
  try { await enqueueJob(workspaceId, "news_enrich", { organisation_id: orgId, user_id: userId, org_name: input.trading_name, org_website: input.website, org_market: input.primary_market }); } catch { /* non-fatal */ }
  if (input.primary_market === "UK" && companiesHouseConfigured()) {
    try { await enqueueJob(workspaceId, "companies_house", { organisation_id: orgId, user_id: userId, registration_number: input.registration_number }); } catch { /* non-fatal */ }
  }
  try { await enqueueJob(workspaceId, "qualification", { organisation_id: orgId, user_id: userId }); } catch { /* non-fatal */ }
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

export async function bulkLinkedInDiscoverAction(urls: string[]): Promise<ActionResult<{ queued: number; skipped: string[] }>> {
  const s = await getSession();
  const valid: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const norm = trimmed.replace(/^https?:\/\//, "").replace(/^(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
    if (!norm.startsWith("linkedin.com/company/")) { skipped.push(trimmed); continue; }
    if (seen.has(norm)) { skipped.push(`${trimmed} (duplicate)`); continue; }
    seen.add(norm);
    valid.push(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  }
  if (!valid.length) return { ok: false, error: "No valid LinkedIn company URLs found." };
  try {
    for (const url of valid) {
      await enqueueJob(s.workspaceId, "linkedin_lookup", { linkedin_url: url, user_id: s.userId });
    }
    revalidatePath("/organisations");
    return { ok: true, data: { queued: valid.length, skipped }, message: `${valid.length} URL(s) queued for discovery.` };
  } catch (e) { return fail(e); }
}

export async function rediscoverOrganisationAction(organisationId: string): Promise<ActionResult<{ jobId: string }>> {
  const s = await getSession();
  try {
    const jobId = await enqueueJob(s.workspaceId, "rediscovery", { organisation_id: organisationId, user_id: s.userId });
    revalidatePath(`/organisations/${organisationId}`);
    return { ok: true, data: { jobId }, message: "Re-discovery queued. Check Activity for progress." };
  } catch (e) { return fail(e); }
}

export async function findPeopleAction(organisationId: string): Promise<ActionResult<{ jobId: string }>> {
  const s = await getSession();
  try {
    const jobId = await enqueueJob(s.workspaceId, "people_discovery", { organisation_id: organisationId, user_id: s.userId }, { timeoutSeconds: 600 });
    revalidatePath(`/organisations/${organisationId}`);
    return { ok: true, data: { jobId }, message: "People discovery queued. Taftish is searching — check Activity for progress." };
  } catch (e) { return fail(e); }
}

export async function discoverPeopleAllAction(): Promise<ActionResult<{ queued: number }>> {
  const s = await getSession();
  const supabase = await createClient();
  const { data: orgs } = await supabase.from("organisations").select("id").eq("workspace_id", s.workspaceId).is("deleted_at", null);
  if (!orgs?.length) return { ok: false, error: "No organisations in your workspace." };
  let queued = 0;
  for (const org of orgs) {
    try {
      await enqueueJob(s.workspaceId, "people_discovery", { organisation_id: org.id, user_id: s.userId }, { timeoutSeconds: 600 });
      queued++;
    } catch { /* skip duplicates */ }
  }
  revalidatePath("/people");
  return { ok: true, data: { queued }, message: `People discovery queued for ${queued} organisation(s). Check Activity for progress.` };
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
