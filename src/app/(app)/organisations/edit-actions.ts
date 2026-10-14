"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { normaliseCompanyName, normaliseDomain, normaliseLinkedIn, normaliseUrl, classifyTitle } from "@/lib/import/normalise";
import { classifyEmail, normaliseEmail } from "@/lib/contacts/email-quality";

type R = { ok: true; message?: string } | { ok: false; error: string };

const OrgPatch = z.object({
  trading_name: z.string().trim().min(2),
  legal_name: z.string().nullable(),
  website: z.string().nullable(),
  registration_number: z.string().nullable(),
  sector: z.string().nullable(),
  sub_sector: z.string().nullable(),
  headquarters: z.string().nullable(),
  incorporation_date: z.string().nullable(),
  operating_status: z.enum(["active", "dissolved", "liquidation", "dormant", "unknown"]),
  employee_count: z.number().int().min(0).nullable(),
  employee_count_source: z.string().nullable(),
  relationship_status: z.enum(["prospect", "client", "former_client", "partner", "in_conversation", "do_not_contact"]),
  description: z.string().nullable(),
  secondary_market: z.enum(["UK", "IN"]).nullable(),
});

export async function updateOrganisationAction(id: string, input: z.input<typeof OrgPatch>): Promise<R> {
  const s = await getSession();
  const p = OrgPatch.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.employee_count != null && !p.data.employee_count_source?.trim()) return { ok: false, error: "Say where the employee count comes from." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("organisations").select("*").eq("id", id).eq("workspace_id", s.workspaceId).single();
  if (!before) return { ok: false, error: "Not found" };
  const website = normaliseUrl(p.data.website);
  const { secondary_market, ...rest } = p.data;
  const patch = {
    ...rest,
    legal_name: rest.legal_name?.trim() || null,
    website,
    primary_domain: normaliseDomain(website),
    registration_number: rest.registration_number?.trim() || null,
    registration_jurisdiction: rest.registration_number?.trim() ? before.primary_market : null,
    normalised_name: normaliseCompanyName(rest.trading_name),
    employee_count_as_of: rest.employee_count !== before.employee_count ? new Date().toISOString().slice(0, 10) : before.employee_count_as_of,
  };
  const { error } = await supabase.from("organisations").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "Another organisation already has this domain or registration number." : error.message };
  if (before.trading_name !== rest.trading_name) {
    await supabase.from("organisation_aliases").upsert({ workspace_id: s.workspaceId, organisation_id: id, alias: before.trading_name, normalised_alias: before.normalised_name, kind: "former" }, { onConflict: "organisation_id,normalised_alias", ignoreDuplicates: true });
  }
  if (secondary_market && secondary_market !== before.primary_market) {
    await supabase.from("organisation_market_profiles").upsert({ workspace_id: s.workspaceId, organisation_id: id, market: secondary_market, currency: secondary_market === "UK" ? "GBP" : "INR", presence: "operating" }, { onConflict: "organisation_id,market", ignoreDuplicates: true });
  }
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "organisation.updated", entity_type: "organisation", entity_id: id, before, after: patch });
  revalidatePath(`/organisations/${id}`);
  return { ok: true, message: "Saved." };
}

const ContactPatch = z.object({
  full_name: z.string().trim().min(2),
  title: z.string().nullable(),
  market: z.enum(["UK", "IN"]).nullable(),
  subscriber_type: z.enum(["corporate", "individual", "unknown"]),
  lawful_basis: z.enum(["legitimate_interest", "consent", "existing_relationship", "none"]),
  notes: z.string().nullable(),
});

export async function updateContactAction(contactId: string, organisationId: string, input: z.input<typeof ContactPatch>): Promise<R> {
  const s = await getSession();
  const p = ContactPatch.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: before } = await supabase.from("contacts").select("*").eq("id", contactId).eq("workspace_id", s.workspaceId).single();
  if (!before) return { ok: false, error: "Not found" };
  const parts = p.data.full_name.split(/\s+/);
  const { title, ...rest } = p.data;
  await supabase.from("contacts").update({ ...rest, first_name: parts[0], last_name: parts.length > 1 ? parts[parts.length - 1] : null, normalised_name: p.data.full_name.toLowerCase() }).eq("id", contactId);
  const role = classifyTitle(title);
  await supabase.from("contact_organisations").update({ title, role_category: role.category, buyer_relevance: role.relevance }).eq("contact_id", contactId).eq("organisation_id", organisationId);
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: "contact.updated", entity_type: "contact", entity_id: contactId, before, after: p.data });
  revalidatePath(`/organisations/${organisationId}`);
  revalidatePath(`/people/${contactId}`);
  return { ok: true, message: "Saved." };
}

export async function addChannelAction(contactId: string, organisationId: string, channel: "email" | "linkedin", raw: string): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("first_name, last_name").eq("id", contactId).eq("workspace_id", s.workspaceId).single();
  if (!c) return { ok: false, error: "Not found" };
  const value = channel === "email" ? normaliseEmail(raw) : normaliseLinkedIn(raw);
  if (!value) return { ok: false, error: channel === "email" ? "Not a valid email." : "Use a linkedin.com/in/… URL." };
  const { error } = await supabase.from("contact_channels").insert({
    workspace_id: s.workspaceId, contact_id: contactId, channel, value, verification_status: "candidate", source: "manual",
    email_quality: channel === "email" ? classifyEmail(value, c.first_name, c.last_name) : null,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "That channel is already on another record." : error.message };
  if (channel === "linkedin") await supabase.from("contacts").update({ linkedin_url: value }).eq("id", contactId);
  revalidatePath(`/organisations/${organisationId}`);
  return { ok: true };
}

/** Verification requires a stated method; pattern-inferred addresses can never be marked verified (DB check). */
export async function setChannelVerificationAction(channelId: string, organisationId: string, status: "verified" | "invalid" | "candidate", note: string): Promise<R> {
  const s = await getSession();
  if (status === "verified" && note.trim().length < 5) return { ok: false, error: "Say how you verified it (e.g. 'signature on their reply, 12 Oct')." };
  const supabase = await createClient();
  const { data: ch } = await supabase.from("contact_channels").select("contact_id, verification_method, source").eq("id", channelId).eq("workspace_id", s.workspaceId).single();
  if (!ch) return { ok: false, error: "Not found" };
  if (status === "verified" && ch.verification_method === "pattern_inferred") return { ok: false, error: "A pattern-inferred address cannot be marked verified. Add the confirmed address instead." };
  const { error } = await supabase.from("contact_channels").update({
    verification_status: status, verification_method: status === "verified" ? "user_confirmed" : ch.verification_method,
    verified_at: status === "verified" ? new Date().toISOString() : null, source: status === "verified" ? `${ch.source ?? "manual"} · verified: ${note.trim()}` : ch.source,
  }).eq("id", channelId);
  if (error) return { ok: false, error: error.message };
  if (ch.contact_id && status === "verified") await supabase.from("contacts").update({ verification_status: "verified" }).eq("id", ch.contact_id);
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: `channel.${status}`, entity_type: "contact_channel", entity_id: channelId, metadata: { note } });
  revalidatePath(`/organisations/${organisationId}`);
  return { ok: true };
}

export async function setEvidenceStatusAction(evidenceId: string, organisationId: string, status: "active" | "disputed" | "rejected"): Promise<R> {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("evidence_items").update({ status }).eq("id", evidenceId).eq("workspace_id", s.workspaceId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: `evidence.${status}`, entity_type: "evidence_item", entity_id: evidenceId });
  revalidatePath(`/organisations/${organisationId}`);
  return { ok: true, message: status === "active" ? "Restored." : "Removed from scoring. Re-qualify to update the score." };
}
