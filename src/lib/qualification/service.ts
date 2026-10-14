import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/ai/gateway";
import { QUALIFICATION_SYSTEM, QualificationAssessmentSchema } from "@/lib/ai/agents/qualification";
import { untrusted } from "@/lib/ai/agents/shared";
import { computeScore, heuristicPropensity, type DimensionInput, type DimensionKey, type Weights, type Band } from "@/lib/scoring/model";
import { rankEmails, type EmailQuality } from "@/lib/contacts/email-quality";

/** Everything an agent is allowed to know about an organisation. Used by qualification and governance. */
export async function buildEvidencePackage(workspaceId: string, organisationId: string) {
  const supabase = await createClient();
  const [org, evidence, contacts, financials, conversations, suppression, risks] = await Promise.all([
    supabase.from("organisations").select("id, trading_name, legal_name, website, primary_domain, registration_number, primary_market, headquarters, incorporation_date, operating_status, sector, sub_sector, employee_count, employee_count_source, employee_count_as_of, description, needs, relationship_status, organisation_market_profiles(market, currency, presence)").eq("id", organisationId).eq("workspace_id", workspaceId).single(),
    supabase.from("evidence_items").select("id, claim_field, claim_text, fact_type, value_numeric, value_currency, value_as_of, source_name, source_url, published_at, retrieved_at, excerpt, confidence, is_adverse").eq("organisation_id", organisationId).eq("status", "active").order("retrieved_at", { ascending: false }).limit(80),
    supabase.from("contact_organisations").select("title, role_category, buyer_relevance, is_current, contacts!inner(id, full_name, market, verification_status, subscriber_type, lawful_basis, opted_out_at, outreach_status, last_interaction_at, linkedin_url, deleted_at, contact_channels(id, channel, value, email_quality, verification_status, bounced_at))").eq("organisation_id", organisationId),
    supabase.from("organisation_financials").select("metric, amount, currency, period_end, fact_type, evidence_id").eq("organisation_id", organisationId),
    supabase.from("conversations").select("id, channel, status, last_outbound_at, last_inbound_at, latest_classification").eq("organisation_id", organisationId),
    supabase.from("suppression_entries").select("kind, value, reason").eq("workspace_id", workspaceId),
    supabase.from("organisation_risk_flags").select("kind, severity, summary, status").eq("organisation_id", organisationId).neq("status", "dismissed"),
  ]);
  if (!org.data) throw new Error("Organisation not found");

  const sup = suppression.data ?? [];
  const domain = org.data.primary_domain;
  const orgSuppressed = sup.some((s) => (s.kind === "organisation" && s.value === organisationId) || (s.kind === "domain" && s.value === domain)) || org.data.relationship_status === "do_not_contact";

  type Ch = { id: string; channel: string; value: string; email_quality: EmailQuality | null; verification_status: string; bounced_at: string | null };
  const people = (contacts.data ?? [])
    .map((co) => {
      const c = co.contacts as unknown as { id: string; full_name: string; market: string | null; verification_status: string; subscriber_type: string; lawful_basis: string; opted_out_at: string | null; outreach_status: string; last_interaction_at: string | null; linkedin_url: string | null; deleted_at: string | null; contact_channels: Ch[] };
      if (c.deleted_at) return null;
      const emails = rankEmails(c.contact_channels.filter((ch) => ch.channel === "email")).map((ch) => ({
        channel_id: ch.id, value: ch.value, quality: ch.email_quality, verification: ch.verification_status,
        suppressed: sup.some((s) => (s.kind === "email" && s.value === ch.value) || (s.kind === "domain" && ch.value.endsWith("@" + s.value))),
      }));
      const linkedin = c.contact_channels.filter((ch) => ch.channel === "linkedin").map((ch) => ({ channel_id: ch.id, value: ch.value, verification: ch.verification_status }));
      return {
        contact_id: c.id, name: c.full_name, title: co.title, role_category: co.role_category, buyer_relevance: co.buyer_relevance, is_current: co.is_current,
        verification: c.verification_status, subscriber_type: c.subscriber_type, lawful_basis: c.lawful_basis,
        opted_out: !!c.opted_out_at || sup.some((s) => s.kind === "contact" && s.value === c.id),
        outreach_status: c.outreach_status, last_interaction_at: c.last_interaction_at, emails, linkedin,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.buyer_relevance ?? 0) - (a!.buyer_relevance ?? 0));

  // Generic inboxes attached to the organisation itself (last resort).
  const { data: orgChannels } = await supabase.from("contact_channels").select("id, value, email_quality, verification_status, bounced_at").eq("organisation_id", organisationId).is("contact_id", null).eq("channel", "email");

  return {
    organisation: org.data,
    organisation_suppressed: orgSuppressed,
    evidence: evidence.data ?? [],
    financials: financials.data ?? [],
    contacts: people,
    organisation_inboxes: (orgChannels ?? []).map((c) => ({ channel_id: c.id, value: c.value, quality: c.email_quality, verification: c.verification_status })),
    prior_conversations: conversations.data ?? [],
    risk_flags: risks.data ?? [],
  };
}
export type EvidencePackage = Awaited<ReturnType<typeof buildEvidencePackage>>;

export async function runQualification(workspaceId: string, userId: string, organisationId: string) {
  const supabase = await createClient();
  const [pkg, { data: model }, { data: settings }] = await Promise.all([
    buildEvidencePackage(workspaceId, organisationId),
    supabase.from("scoring_models").select("id, weights, bands, freshness_half_life_days").eq("workspace_id", workspaceId).eq("is_active", true).single(),
    supabase.from("workspace_settings").select("pricing_ranges").eq("workspace_id", workspaceId).single(),
  ]);
  if (!model) throw new Error("No active scoring model");
  if (pkg.evidence.length === 0 && pkg.contacts.length === 0) {
    throw new Error("Add at least one evidence item or contact before qualifying — the model will not score an empty dossier.");
  }

  const res = await runStructured({
    workspaceId, agent: "discovery", system: QUALIFICATION_SYSTEM, schema: QualificationAssessmentSchema, userId,
    entity: { type: "organisation", id: organisationId }, maxTokens: 12000,
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}. Assess this organisation.`,
      `Scoring weights (for context; the final score is computed outside the model): ${JSON.stringify(model.weights)}`,
      `Private engagement pricing ranges: ${JSON.stringify(settings?.pricing_ranges ?? {})}`,
      untrusted("evidence_package", pkg),
    ].join("\n\n"),
  });

  // Deterministic: drop citations of unknown evidence, compute freshness from cited evidence dates.
  const evidenceById = new Map(pkg.evidence.map((e) => [e.id, e]));
  const now = Date.now();
  const dims: DimensionInput[] = res.data.dimensions.map((d) => {
    const ids = d.evidence_ids.filter((id) => evidenceById.has(id));
    const ages = ids.map((id) => {
      const e = evidenceById.get(id)!;
      return (now - new Date(e.published_at ?? e.retrieved_at).getTime()) / 86400_000;
    });
    // A score with no valid citation is treated as unknown — never silently trusted.
    const raw = d.raw_score == null || ids.length === 0 ? null : Math.max(0, Math.min(10, d.raw_score));
    return { key: d.key as DimensionKey, raw, confidence: Math.max(0, Math.min(1, d.confidence)), evidenceAgeDays: ages.length ? Math.min(...ages) : null, rationale: d.rationale, evidenceIds: ids };
  });
  const result = computeScore(dims, model.weights as Weights, { halfLifeDays: model.freshness_half_life_days, bands: model.bands as Band[] });
  const hasNamed = pkg.contacts.some((c) => c!.emails.some((e) => e.quality === "personal_named" && !e.suppressed));
  const propensity = heuristicPropensity(result, hasNamed);

  const { data: last } = await supabase.from("lead_qualifications").select("version_no").eq("organisation_id", organisationId).order("version_no", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("lead_qualifications").update({ is_current: false }).eq("organisation_id", organisationId).eq("is_current", true);
  const { data: q, error } = await supabase.from("lead_qualifications").insert({
    workspace_id: workspaceId, organisation_id: organisationId, scoring_model_id: model.id, version_no: (last?.version_no ?? 0) + 1,
    score: result.score, coverage: result.coverage, evidence_confidence: result.evidenceConfidence,
    engagement_propensity: propensity, affordability: res.data.affordability, affordability_reasons: res.data.affordability_reasons,
    band: result.band, is_current: true, agent_execution_id: res.executionId, created_by: userId,
    explanation: {
      why_company: res.data.why_company.slice(0, 3), why_now: res.data.why_now, why_nishaan: res.data.why_nishaan,
      who_to_approach: res.data.who_to_approach, whats_missing: res.data.whats_missing, engagement_signals: res.data.engagement_signals,
    },
    critical_unknowns: result.unknown,
  }).select("id").single();
  if (error || !q) throw new Error(error?.message ?? "Could not save qualification");

  await supabase.from("qualification_dimensions").insert(result.dimensions.map((d) => ({
    workspace_id: workspaceId, qualification_id: q.id, dimension: d.key, weight: d.weight, raw_score: d.raw,
    freshness_factor: Math.round(d.freshness * 1000) / 1000, contribution: d.contribution, confidence: d.confidence,
    rationale: d.rationale ?? null, evidence_ids: d.evidenceIds ?? [],
  })));

  if (res.data.needs.length) await supabase.from("organisations").update({ needs: Array.from(new Set(res.data.needs)) }).eq("id", organisationId);
  for (const rf of res.data.risk_flags) {
    if (rf.evidence_id && !evidenceById.has(rf.evidence_id)) continue; // adverse findings must be evidenced
    if (!rf.evidence_id && rf.severity !== "info") continue;
    await supabase.from("organisation_risk_flags").insert({ workspace_id: workspaceId, organisation_id: organisationId, kind: rf.kind, severity: rf.severity, summary: rf.summary, evidence_id: rf.evidence_id, status: "needs_review" });
  }
  return { qualificationId: q.id, score: result.score, band: result.band };
}

export async function overrideQualification(workspaceId: string, userId: string, qualificationId: string, score: number, reason: string) {
  if (reason.trim().length < 5) throw new Error("An override needs a reason (at least 5 characters).");
  if (score < 0 || score > 100) throw new Error("Score must be 0–100.");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_qualifications").update({ override_score: score, override_reason: reason.trim(), overridden_by: userId, overridden_at: new Date().toISOString() }).eq("id", qualificationId).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: userId, action: "qualification.override", entity_type: "lead_qualification", entity_id: qualificationId, metadata: { score, reason } });
}
