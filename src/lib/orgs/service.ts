import "server-only";
import { createClient } from "@/lib/supabase/server";
import { classifyEmail, normaliseEmail } from "@/lib/contacts/email-quality";
import { classifyTitle, normaliseCompanyName, normaliseDomain, normaliseLinkedIn, normalisePersonName, normaliseUrl, splitName } from "@/lib/import/normalise";

export type Market = "UK" | "IN";

export interface OrgInput {
  trading_name: string;
  legal_name?: string | null;
  website?: string | null;
  registration_number?: string | null;
  primary_market: Market;
  sector?: string | null;
  headquarters?: string | null;
  relationship_status?: string;
  description?: string | null;
  is_demo?: boolean;
}

export async function createOrganisation(workspaceId: string, userId: string, input: OrgInput) {
  const supabase = await createClient();
  const website = normaliseUrl(input.website);
  const { data, error } = await supabase.from("organisations").insert({
    workspace_id: workspaceId,
    trading_name: input.trading_name.trim(),
    legal_name: input.legal_name?.trim() || null,
    normalised_name: normaliseCompanyName(input.trading_name),
    website,
    primary_domain: normaliseDomain(website),
    registration_number: input.registration_number?.trim() || null,
    registration_jurisdiction: input.registration_number ? input.primary_market : null,
    primary_market: input.primary_market,
    sector: input.sector?.trim() || null,
    headquarters: input.headquarters?.trim() || null,
    relationship_status: input.relationship_status ?? "prospect",
    description: input.description?.trim() || null,
    is_demo: input.is_demo ?? false,
    created_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.code === "23505" ? "An organisation with this domain or registration number already exists." : error.message);
  await supabase.from("organisation_market_profiles").insert({
    workspace_id: workspaceId, organisation_id: data.id, market: input.primary_market,
    currency: input.primary_market === "UK" ? "GBP" : "INR", presence: "headquartered",
  });
  if (input.legal_name && normaliseCompanyName(input.legal_name) !== normaliseCompanyName(input.trading_name)) {
    await supabase.from("organisation_aliases").insert({ workspace_id: workspaceId, organisation_id: data.id, alias: input.legal_name, normalised_alias: normaliseCompanyName(input.legal_name), kind: "legal" });
  }
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: userId, action: "organisation.created", entity_type: "organisation", entity_id: data.id });
  return data.id as string;
}

export interface ContactInput {
  full_name: string;
  title?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  market?: Market | null;
  subscriber_type?: "corporate" | "individual" | "unknown";
  email_verified?: boolean; // only when the user asserts a credible source
  source?: string;
  is_demo?: boolean;
}

export async function addContact(workspaceId: string, userId: string, organisationId: string, input: ContactInput) {
  const supabase = await createClient();
  const { first, last } = splitName(input.full_name);
  const role = classifyTitle(input.title);
  const email = input.email ? normaliseEmail(input.email) : null;
  if (input.email && !email) throw new Error("That email address is not valid.");
  const linkedin = input.linkedin_url ? normaliseLinkedIn(input.linkedin_url) : null;
  if (input.linkedin_url && !linkedin) throw new Error("LinkedIn URL must be a linkedin.com/in/ or /company/ link.");

  const { data: c, error } = await supabase.from("contacts").insert({
    workspace_id: workspaceId, full_name: input.full_name.trim(), first_name: first, last_name: last,
    normalised_name: normalisePersonName(input.full_name), market: input.market ?? null, linkedin_url: linkedin,
    verification_status: email && input.email_verified ? "verified" : email || linkedin ? "candidate" : "missing",
    subscriber_type: input.subscriber_type ?? "unknown", is_demo: input.is_demo ?? false, created_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("contact_organisations").insert({
    workspace_id: workspaceId, contact_id: c.id, organisation_id: organisationId, title: input.title ?? null,
    role_category: role.category, buyer_relevance: role.relevance, source: input.source ?? "manual",
  });
  if (email) {
    const { error: chErr } = await supabase.from("contact_channels").insert({
      workspace_id: workspaceId, contact_id: c.id, channel: "email", value: email,
      email_quality: classifyEmail(email, first, last),
      verification_status: input.email_verified ? "verified" : "candidate",
      verification_method: input.email_verified ? "user_confirmed" : "import_unverified",
      verified_at: input.email_verified ? new Date().toISOString() : null,
      source: input.source ?? "manual", is_primary: true,
    });
    if (chErr?.code === "23505") throw new Error("That email is already attached to another record.");
  }
  if (linkedin) {
    await supabase.from("contact_channels").insert({ workspace_id: workspaceId, contact_id: c.id, channel: "linkedin", value: linkedin, verification_status: "candidate", source: input.source ?? "manual" });
  }
  return c.id as string;
}

export interface EvidenceInput {
  organisation_id: string;
  claim_field: string;
  claim_text: string;
  fact_type: "reported_fact" | "dated_filing" | "third_party_estimate" | "inference" | "unknown";
  source_name: string;
  source_url?: string | null;
  published_at?: string | null;
  excerpt?: string | null;
  confidence: number;
  value_numeric?: number | null;
  value_currency?: "GBP" | "INR" | "USD" | null;
  value_as_of?: string | null;
  is_adverse?: boolean;
  review_by?: string | null;
}

export async function addEvidence(workspaceId: string, userId: string, e: EvidenceInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("evidence_items").insert({
    workspace_id: workspaceId, ...e, source_url: normaliseUrl(e.source_url) ?? null, created_by_type: "user", created_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (e.claim_field.startsWith("financials.") && e.value_numeric != null) {
    const metric = e.claim_field.split(".")[1];
    const { data: org } = await supabase.from("organisations").select("primary_market").eq("id", e.organisation_id).single();
    await supabase.from("organisation_financials").insert({
      workspace_id: workspaceId, organisation_id: e.organisation_id, market: org?.primary_market ?? "UK", metric, amount: e.value_numeric,
      currency: e.value_currency ?? null, period_end: e.value_as_of ?? null, fact_type: e.fact_type, evidence_id: data.id,
    });
  }
  if (e.claim_field.startsWith("news.") && e.source_url && e.published_at) {
    await supabase.from("organisation_news").insert({
      workspace_id: workspaceId, organisation_id: e.organisation_id, headline: e.claim_text, publisher: e.source_name,
      published_at: e.published_at.slice(0, 10), url: normaliseUrl(e.source_url)!, is_press_release: e.claim_field === "news.press_release",
      summary: e.excerpt ?? null, evidence_id: data.id,
    });
  }
  return data.id as string;
}

export { CLAIM_FIELDS, FACT_TYPE_LABEL } from "./constants";
