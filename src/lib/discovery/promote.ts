import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addContact, addEvidence, createOrganisation } from "@/lib/orgs/service";
import { advancedSearch, getOfficers, getProfile, officerDisplayName, profileToFindings, companiesHouseConfigured } from "./companies-house";
import { normaliseCompanyName, normalisePersonName } from "@/lib/import/normalise";

const FIELD: Record<string, string> = {
  funding: "signal.funding", expansion: "signal.expansion", launch: "signal.launch", rebrand: "signal.rebrand", consolidation: "signal.consolidation",
  leadership_change: "signal.leadership_change", hiring: "signal.hiring", rfp: "signal.rfp", registry_match: "diligence.status", other: "signal.expansion",
};
const CONF = { strong: 0.8, moderate: 0.65, weak: 0.5 } as const;

/** Human-reviewed: creates (or attaches to) the canonical organisation and records the signal as evidence. */
export async function promoteSignal(workspaceId: string, userId: string, signalId: string, mode: "auto" | "new" | "merge") {
  const supabase = await createClient();
  const { data: s } = await supabase.from("discovery_signals").select("*").eq("id", signalId).eq("workspace_id", workspaceId).single();
  if (!s) throw new Error("Signal not found");
  if (s.status !== "new") throw new Error(`Signal already ${s.status}`);
  const hint = s.match_hint as { matchId?: string; decision?: string } | null;
  let orgId: string | null = s.organisation_id ?? (mode !== "new" && hint?.matchId ? hint.matchId : null);
  const created = !orgId;
  if (!orgId) {
    orgId = await createOrganisation(workspaceId, userId, {
      trading_name: s.candidate_name, website: s.candidate_domain ? `https://${s.candidate_domain}` : null, registration_number: s.candidate_registration,
      primary_market: (s.market as "UK" | "IN") ?? "UK", description: `Added from discovery (${s.source}).`,
    });
  }
  await addEvidence(workspaceId, userId, {
    organisation_id: orgId, claim_field: FIELD[s.signal_type] ?? "signal.expansion", claim_text: s.claim_text,
    fact_type: s.source === "companies_house" ? "dated_filing" : "reported_fact", source_name: s.source === "companies_house" ? "Companies House" : (s.source_url ? new URL(s.source_url).hostname.replace(/^www\./, "") : s.source),
    source_url: s.source_url, published_at: s.published_at, excerpt: s.uncertainty ? `Uncertainty: ${s.uncertainty}` : null, confidence: CONF[s.strength as keyof typeof CONF] ?? 0.5,
  });
  await supabase.from("discovery_signals").update({ status: created ? "promoted" : "merged", organisation_id: orgId, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", signalId);
  return { organisationId: orgId, created };
}

export async function dismissSignal(workspaceId: string, userId: string, signalId: string) {
  const supabase = await createClient();
  await supabase.from("discovery_signals").update({ status: "dismissed", reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", signalId).eq("workspace_id", workspaceId);
}

/**
 * Registry enrichment for a UK organisation. Writes dated-filing evidence, raises review flags,
 * adds current directors as people without contact details, and fills only empty identity fields
 * (operating status is taken from the registry because it is the authoritative source).
 */
export async function enrichFromCompaniesHouse(workspaceId: string, userId: string, organisationId: string, companyNumber?: string) {
  if (!companiesHouseConfigured()) throw new Error("Companies House is not configured. Add COMPANIES_HOUSE_API_KEY on the server (free key from developer.company-information.service.gov.uk).");
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("id, trading_name, legal_name, registration_number, incorporation_date, primary_market, contact_organisations(contacts(normalised_name))").eq("id", organisationId).eq("workspace_id", workspaceId).single();
  if (!org) throw new Error("Organisation not found");
  let number = companyNumber ?? org.registration_number;
  if (!number) {
    const items = await advancedSearch({ nameIncludes: org.legal_name ?? org.trading_name, size: 10 });
    const target = normaliseCompanyName(org.legal_name ?? org.trading_name);
    const exact = items.filter((i) => normaliseCompanyName(i.company_name) === target);
    if (exact.length !== 1) return { needsChoice: true as const, candidates: items.slice(0, 8).map((i) => ({ number: i.company_number, name: i.company_name, status: i.company_status, incorporated: i.date_of_creation ?? null, locality: i.registered_office_address?.locality ?? null })) };
    number = exact[0].company_number;
  }
  const [profile, officers] = await Promise.all([getProfile(number), getOfficers(number)]);
  const f = profileToFindings(profile);
  for (const e of f.evidence) {
    await addEvidence(workspaceId, userId, { organisation_id: organisationId, claim_field: e.claim_field, claim_text: e.claim_text, fact_type: "dated_filing", source_name: "Companies House", source_url: f.url, value_as_of: e.value_as_of, confidence: 0.95, is_adverse: e.is_adverse });
  }
  for (const fl of f.flags) {
    await supabase.from("organisation_risk_flags").insert({ workspace_id: workspaceId, organisation_id: organisationId, kind: fl.kind, severity: fl.severity, summary: fl.summary, status: "needs_review" });
  }
  const current = officers.filter((o) => !o.resigned_on && /director|member|partner/i.test(o.officer_role));
  if (current.length) {
    await addEvidence(workspaceId, userId, { organisation_id: organisationId, claim_field: "identity.leadership", claim_text: `Current officers: ${current.map((o) => `${officerDisplayName(o.name)} (${o.officer_role.replace(/-/g, " ")}${o.appointed_on ? `, since ${o.appointed_on}` : ""})`).join("; ")}`, fact_type: "dated_filing", source_name: "Companies House", source_url: `${f.url}/officers`, confidence: 0.95 });
  }
  const known = new Set(((org.contact_organisations ?? []) as unknown as Array<{ contacts: { normalised_name: string } }>).map((x) => x.contacts.normalised_name));
  let added = 0;
  for (const o of current.slice(0, 12)) {
    const name = officerDisplayName(o.name);
    if (known.has(normalisePersonName(name))) continue;
    await addContact(workspaceId, userId, organisationId, { full_name: name, title: `Director${o.occupation ? ` · ${o.occupation}` : ""} (Companies House)`, market: "UK", subscriber_type: "corporate", source: "companies_house" });
    added++;
  }
  const patch: Record<string, unknown> = { operating_status: f.status };
  if (!org.registration_number) { patch.registration_number = number; patch.registration_jurisdiction = "UK"; }
  if (!org.legal_name) patch.legal_name = profile.company_name;
  if (!org.incorporation_date && profile.date_of_creation) patch.incorporation_date = profile.date_of_creation;
  const { error } = await supabase.from("organisations").update(patch).eq("id", organisationId);
  if (error?.code === "23505") delete patch.registration_number;
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: userId, action: "organisation.enriched", entity_type: "organisation", entity_id: organisationId, metadata: { source: "companies_house", number, evidence: f.evidence.length, flags: f.flags.length, directors_added: added } });
  return { needsChoice: false as const, number, evidence: f.evidence.length + (current.length ? 1 : 0), flags: f.flags.length, directorsAdded: added };
}
