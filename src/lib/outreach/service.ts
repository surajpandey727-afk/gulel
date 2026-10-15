import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/ai/gateway";
import { GOVERNANCE_SYSTEM, GovernanceSchema, REFINE_ACTIONS, REFINE_SYSTEM, RefineSchema, type RefineAction } from "@/lib/ai/agents/governance";
import { untrusted } from "@/lib/ai/agents/shared";
import { buildEvidencePackage, type EvidencePackage } from "@/lib/qualification/service";
import { getActiveVoice, voicePromptBlock, evaluateFidelity } from "@/lib/voice/service";
import { evaluateCompliance } from "@/lib/compliance";
import { buildMime, gmailConfigured, upsertDraft } from "@/lib/channels/gmail";

type Pkg = EvidencePackage;
type Channel = "gmail" | "linkedin";

function findRecipient(pkg: Pkg, contactId: string | null, value: string | null) {
  if (!value) return null;
  const v = value.toLowerCase();
  for (const c of pkg.contacts) {
    if (!c) continue;
    if (contactId && c.contact_id !== contactId) continue;
    const e = c.emails.find((x) => x.value.toLowerCase() === v);
    if (e) return { contact: c, channel: "gmail" as const, channelId: e.channel_id, value: e.value, quality: e.quality, verification: e.verification, suppressed: e.suppressed };
    const l = c.linkedin.find((x) => x.value.toLowerCase() === v);
    if (l) return { contact: c, channel: "linkedin" as const, channelId: l.channel_id, value: l.value, quality: null, verification: l.verification, suppressed: false };
  }
  const inbox = pkg.organisation_inboxes.find((x) => x.value.toLowerCase() === v);
  if (inbox) return { contact: null, channel: "gmail" as const, channelId: inbox.channel_id, value: inbox.value, quality: inbox.quality, verification: inbox.verification, suppressed: false };
  return null;
}

async function connectedGmail(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("channel_accounts").select("id, account_email, status").eq("workspace_id", workspaceId).eq("channel", "gmail").eq("status", "connected").limit(1).maybeSingle();
  return data;
}

function complianceFor(pkg: Pkg, r: NonNullable<ReturnType<typeof findRecipient>>) {
  return evaluateCompliance({
    channel: r.channel,
    market: (pkg.organisation.primary_market as "UK" | "IN") ?? null,
    subscriberType: (r.contact?.subscriber_type as "corporate") ?? "unknown",
    lawfulBasis: (r.contact?.lawful_basis as "legitimate_interest") ?? "legitimate_interest",
    emailQuality: r.quality,
    optedOut: !!r.contact?.opted_out,
    suppressed: r.suppressed || pkg.organisation_suppressed,
    verification: r.verification,
  });
}

/** Governance decision first; a draft only when outreach is commercially justified. */
export async function prepareOutreach(workspaceId: string, userId: string, organisationId: string, channelPref: Channel | null) {
  const supabase = await createClient();
  const pkg = await buildEvidencePackage(workspaceId, organisationId);
  const { data: qual } = await supabase.from("lead_qualifications").select("id, score, override_score, band, coverage, evidence_confidence, explanation, affordability, engagement_propensity").eq("organisation_id", organisationId).eq("is_current", true).maybeSingle();

  // Deterministic short-circuit: suppressed organisations never reach the LLM.
  if (pkg.organisation_suppressed) {
    const { data: s } = await supabase.from("outreach_strategies").insert({ workspace_id: workspaceId, organisation_id: organisationId, qualification_id: qual?.id ?? null, decision: "suppressed", reasoning: { decision_rationale: "Organisation is suppressed / do-not-contact." }, created_by: userId }).select("id").single();
    return { strategyId: s!.id, decision: "suppressed", rationale: "Organisation is suppressed / do-not-contact.", draftId: null };
  }

  const { version: voice } = await getActiveVoice(workspaceId);
  const gmail = await connectedGmail(workspaceId);
  const res = await runStructured({
    workspaceId, agent: "doot", system: GOVERNANCE_SYSTEM, schema: GovernanceSchema, userId, maxTokens: 16000,
    entity: { type: "organisation", id: organisationId },
    cachedContext: voicePromptBlock(voice),
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      channelPref ? `The founder prefers the ${channelPref === "gmail" ? "email (Gmail)" : "LinkedIn"} channel for this approach if suitable.` : "Choose the most suitable channel.",
      gmail ? `Email will be sent from ${gmail.account_email}.` : "Gmail is not connected yet; an email draft can still be prepared for later.",
      `Current qualification: ${JSON.stringify(qual ?? "not yet qualified")}`,
      untrusted("evidence_package", pkg),
    ].join("\n\n"),
  });
  const g = res.data;

  // Validate the agent's choices against the package. Never trust ids or addresses blindly.
  const validEvidence = new Set(pkg.evidence.map((e) => e.id));
  const recipient = findRecipient(pkg, g.recipient_contact_id, g.recipient_channel_value);
  let decision: string = g.decision;
  let rationale = g.decision_rationale;
  const problems: string[] = [];
  if (decision === "outreach_recommended") {
    if (!g.draft) problems.push("Agent recommended outreach but returned no draft.");
    if (!recipient) problems.push("Chosen recipient is not one of the organisation's recorded channels.");
    if (recipient && g.channel && recipient.channel !== g.channel) problems.push("Recipient channel does not match the chosen channel.");
  }
  const compliance = recipient ? complianceFor(pkg, recipient) : null;
  if (decision === "outreach_recommended" && compliance && !compliance.eligible) problems.push(...compliance.reasons);
  if (problems.length) {
    decision = "further_research";
    rationale = `${g.decision_rationale}\n\nBlocked by deterministic checks: ${problems.join(" ")}`;
  }

  const citations = (g.draft?.supporting_evidence_ids ?? []).filter((id) => validEvidence.has(id));
  const invalidCitations = (g.draft?.supporting_evidence_ids ?? []).filter((id) => !validEvidence.has(id));

  const { data: strategy } = await supabase.from("outreach_strategies").insert({
    workspace_id: workspaceId, organisation_id: organisationId, qualification_id: qual?.id ?? null, decision,
    strategic_problem: g.strategic_problem, service_offering: g.service_offering, advisory_readiness: g.advisory_readiness,
    recommended_contact_id: recipient?.contact?.contact_id ?? null, recommended_channel: g.channel, timing_rationale: g.timing_rationale,
    communication_objective: g.communication_objective, evidence_ids: citations, agent_execution_id: res.executionId, created_by: userId,
    reasoning: { decision_rationale: rationale, recipient_justification: g.recipient_justification, self_check: g.self_check, agent_decision: g.decision },
  }).select("id").single();

  if (decision !== "outreach_recommended" || !g.draft || !recipient) {
    return { strategyId: strategy!.id, decision, rationale, draftId: null };
  }

  const channel: Channel = recipient.channel;
  const { data: draft } = await supabase.from("outreach_drafts").insert({
    workspace_id: workspaceId, organisation_id: organisationId, contact_id: recipient.contact?.contact_id ?? null, strategy_id: strategy!.id,
    channel, kind: channel === "linkedin" ? "linkedin_message" : "cold",
    suggested_follow_up_on: new Date(Date.now() + Math.max(3, g.draft.suggested_follow_up_days) * 86400_000).toISOString().slice(0, 10),
    created_by: userId,
  }).select("id").single();

  // Run independent fidelity evaluation (uses haiku — fast and cheap)
  const fidelity = await evaluateFidelity(workspaceId, userId, g.draft.body, voice).catch(() => null);

  await supabase.from("draft_versions").insert({
    workspace_id: workspaceId, draft_id: draft!.id, version_no: 1, channel,
    sending_account_id: channel === "gmail" ? gmail?.id ?? null : null,
    recipient_channel_id: recipient.channelId, recipient_value: recipient.value,
    subject: channel === "gmail" ? g.draft.subject ?? "" : null, body: g.draft.body, source: "governance",
    strategic_angle: g.draft.strategic_angle, supporting_evidence_ids: citations, voice_version_id: voice.id, agent_execution_id: res.executionId,
    quality: {
      tone_match: g.self_check.tone_match,
      factuality: { status: g.self_check.factuality === "pass" && invalidCitations.length === 0 ? "pass" : "issues", unsupported_claims: g.self_check.unsupported_claims, invalid_citations: invalidCitations },
      compliance,
      brief: { why_company: g.draft.why_company, why_individual: g.draft.why_individual, business_issue: g.draft.business_issue, contribution: g.draft.contribution, rationale: g.draft.rationale, next_action: g.draft.next_action },
      recipient_justification: g.recipient_justification,
      model: res.model,
      ...(fidelity ? { fidelity_score: fidelity.tone_match, fidelity_notes: fidelity.specific_issues, fidelity_assessment: fidelity.overall_assessment, fidelity_dimensions: fidelity.dimension_scores } : {}),
    },
    created_by: userId,
  });
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "agent", actor_id: "governance", action: "draft.created", entity_type: "outreach_draft", entity_id: draft!.id, metadata: { execution_id: res.executionId } });
  if (channel === "gmail") await syncGmailDraft(workspaceId, draft!.id).catch(() => undefined);
  return { strategyId: strategy!.id, decision, rationale, draftId: draft!.id as string };
}

async function currentVersion(draftId: string) {
  const supabase = await createClient();
  const { data: d } = await supabase.from("outreach_drafts").select("*, organisations(primary_market)").eq("id", draftId).single();
  if (!d) throw new Error("Draft not found");
  const { data: v } = await supabase.from("draft_versions").select("*").eq("id", d.current_version_id).single();
  return { d, v: v! };
}

async function insertVersion(workspaceId: string, userId: string, draftId: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const { v } = await currentVersion(draftId);
  const { data: last } = await supabase.from("draft_versions").select("version_no").eq("draft_id", draftId).order("version_no", { ascending: false }).limit(1).single();
  const row = {
    workspace_id: workspaceId, draft_id: draftId, version_no: (last?.version_no ?? 0) + 1, channel: v.channel,
    sending_account_id: v.sending_account_id, recipient_channel_id: v.recipient_channel_id, recipient_value: v.recipient_value,
    subject: v.subject, body: v.body, strategic_angle: v.strategic_angle, supporting_evidence_ids: v.supporting_evidence_ids,
    voice_version_id: v.voice_version_id, quality: v.quality, created_by: userId, ...patch,
  };
  const { data, error } = await supabase.from("draft_versions").insert(row).select("id, version_no").single();
  if (error) throw new Error(error.message);
  if (v.channel === "gmail") await syncGmailDraft(workspaceId, draftId).catch(() => undefined);
  return data!;
}

/** Manual edit → new immutable version (DB trigger revokes any approval). */
export async function saveEdit(workspaceId: string, userId: string, draftId: string, edit: { subject?: string | null; body: string; recipientValue?: string }) {
  const { v } = await currentVersion(draftId);
  const patch: Record<string, unknown> = { source: "user_edit", subject: edit.subject ?? v.subject, body: edit.body };
  if (edit.recipientValue && edit.recipientValue !== v.recipient_value) {
    const supabase = await createClient();
    const { data: ch } = await supabase.from("contact_channels").select("id, value").eq("workspace_id", workspaceId).eq("value", edit.recipientValue.toLowerCase()).maybeSingle();
    if (!ch) throw new Error("Recipient must be one of the contact's recorded channels. Add it on the dossier first.");
    patch.recipient_channel_id = ch.id;
    patch.recipient_value = ch.value;
  }
  if (patch.subject === v.subject && patch.body === v.body && !patch.recipient_value) return { id: v.id, version_no: v.version_no, unchanged: true };
  return insertVersion(workspaceId, userId, draftId, patch);
}

export async function refineDraft(workspaceId: string, userId: string, draftId: string, action: RefineAction) {
  const { d, v } = await currentVersion(draftId);
  const supabase = await createClient();
  const { data: evidence } = await supabase.from("evidence_items").select("id, claim_text, source_name, published_at, fact_type").in("id", v.supporting_evidence_ids.length ? v.supporting_evidence_ids : ["00000000-0000-0000-0000-000000000000"]);
  const { version: voice } = await getActiveVoice(workspaceId);
  const res = await runStructured({
    workspaceId, agent: "doot", system: REFINE_SYSTEM, schema: RefineSchema, userId, maxTokens: 6000,
    entity: { type: "outreach_draft", id: draftId }, cachedContext: voicePromptBlock(voice),
    input: [
      `Requested change: ${REFINE_ACTIONS[action]}`,
      `Channel: ${v.channel === "gmail" ? "email" : d.kind === "connection_note" ? "LinkedIn connection note" : "LinkedIn message"}`,
      untrusted("current_draft", { subject: v.subject, body: v.body, strategic_angle: v.strategic_angle }),
      untrusted("supporting_evidence", evidence ?? []),
    ].join("\n\n"),
  });
  const q = (v.quality ?? {}) as Record<string, unknown>;
  return insertVersion(workspaceId, userId, draftId, {
    source: action === "regenerate" ? "regenerate" : "refine", refine_action: action,
    subject: v.channel === "gmail" ? res.data.subject ?? v.subject : null, body: res.data.body, voice_version_id: voice.id, agent_execution_id: res.executionId,
    quality: { ...q, tone_match: res.data.tone_match, factuality: { status: res.data.unsupported_claims.length ? "issues" : "pass", unsupported_claims: res.data.unsupported_claims, invalid_citations: [] }, change_summary: res.data.change_summary, model: res.model },
  });
}

/** Channel switch keeps both drafts: an existing sibling is reused; otherwise a channel-specific version is generated. */
export async function switchChannel(workspaceId: string, userId: string, draftId: string, channel: Channel) {
  const supabase = await createClient();
  const { d, v } = await currentVersion(draftId);
  if (d.channel === channel) return draftId;
  const { data: sibling } = await supabase.from("outreach_drafts").select("id").eq("organisation_id", d.organisation_id).eq("contact_id", d.contact_id).eq("channel", channel).eq("strategy_id", d.strategy_id).not("status", "in", "(sent,archived)").maybeSingle();
  if (sibling) return sibling.id as string;
  const { data: ch } = await supabase.from("contact_channels").select("id, value").eq("contact_id", d.contact_id).eq("channel", channel === "gmail" ? "email" : "linkedin").order("is_primary", { ascending: false }).limit(1).maybeSingle();
  if (!ch) throw new Error(`This contact has no ${channel === "gmail" ? "email address" : "LinkedIn profile"} on record.`);
  const gmail = channel === "gmail" ? await connectedGmail(workspaceId) : null;
  const { version: voice } = await getActiveVoice(workspaceId);
  const res = await runStructured({
    workspaceId, agent: "doot", system: REFINE_SYSTEM, schema: RefineSchema, userId, maxTokens: 6000, cachedContext: voicePromptBlock(voice),
    input: [`Requested change: Adapt this message for ${channel === "gmail" ? "email (add a short subject line)" : "a LinkedIn message (no subject, under 120 words)"}, keeping the same objective and evidence.`, untrusted("current_draft", { subject: v.subject, body: v.body })].join("\n\n"),
  });
  const { data: nd } = await supabase.from("outreach_drafts").insert({ workspace_id: workspaceId, organisation_id: d.organisation_id, contact_id: d.contact_id, strategy_id: d.strategy_id, channel, kind: channel === "linkedin" ? "linkedin_message" : "cold", suggested_follow_up_on: d.suggested_follow_up_on, created_by: userId }).select("id").single();
  await supabase.from("draft_versions").insert({
    workspace_id: workspaceId, draft_id: nd!.id, version_no: 1, channel, sending_account_id: gmail?.id ?? null, recipient_channel_id: ch.id, recipient_value: ch.value,
    subject: channel === "gmail" ? res.data.subject ?? "" : null, body: res.data.body, source: "regenerate", refine_action: `channel:${channel}`,
    strategic_angle: v.strategic_angle, supporting_evidence_ids: v.supporting_evidence_ids, voice_version_id: voice.id, agent_execution_id: res.executionId,
    quality: { ...(v.quality as object), tone_match: res.data.tone_match, change_summary: res.data.change_summary }, created_by: userId,
  });
  return nd!.id as string;
}

/** Creates/updates the native Gmail draft. A Gmail draft is NOT a sent email. */
export async function syncGmailDraft(workspaceId: string, draftId: string) {
  if (!gmailConfigured()) return { synced: false, reason: "gmail_not_configured" };
  const supabase = await createClient();
  const { d, v } = await currentVersion(draftId);
  if (v.channel !== "gmail") return { synced: false, reason: "not_email" };
  const gmail = await connectedGmail(workspaceId);
  if (!gmail) return { synced: false, reason: "gmail_not_connected" };
  if (d.provider_draft_synced_version_id === v.id) return { synced: true };
  const mime = buildMime({ from: gmail.account_email!, to: v.recipient_value, subject: v.subject ?? "", body: v.body });
  const r = await upsertDraft(gmail.id, mime, d.provider_draft_id);
  await supabase.from("outreach_drafts").update({ provider_draft_id: r.id, provider_draft_synced_version_id: v.id }).eq("id", draftId);
  return { synced: true };
}
