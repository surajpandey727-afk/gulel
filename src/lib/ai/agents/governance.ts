import { z } from "zod";
import { NISHAANA_CONTEXT, SERVICES, UNTRUSTED_DATA_RULE } from "./shared";

export const DECISIONS = [
  "outreach_recommended", "further_research", "nurture_later", "already_in_conversation", "no_justified_approach", "suppressed",
] as const;
export const DECISION_LABEL: Record<(typeof DECISIONS)[number], string> = {
  outreach_recommended: "Outreach recommended",
  further_research: "Further research required",
  nurture_later: "Nurture for later",
  already_in_conversation: "Already in conversation",
  no_justified_approach: "No commercially justified approach",
  suppressed: "Suppressed / do not contact",
};

const DraftSchema = z.object({
  subject: z.string().nullable().describe("Email subject; null for LinkedIn."),
  body: z.string(),
  strategic_angle: z.string(),
  why_company: z.string(),
  why_individual: z.string(),
  business_issue: z.string().describe("The observable business issue that creates relevance."),
  contribution: z.string().describe("What Nishaan-a can credibly contribute."),
  rationale: z.string().describe("Proof or reasoning supporting the approach."),
  next_action: z.string().describe("The single intended next action for the recipient."),
  supporting_evidence_ids: z.array(z.string()),
  suggested_follow_up_days: z.number().int(),
});

export const GovernanceSchema = z.object({
  decision: z.enum(DECISIONS),
  decision_rationale: z.string(),
  strategic_problem: z.string(),
  service_offering: z.enum(SERVICES).nullable(),
  advisory_readiness: z.string(),
  recipient_contact_id: z.string().nullable(),
  recipient_channel_value: z.string().nullable().describe("Exact email address or LinkedIn URL chosen from the provided contact channels."),
  recipient_justification: z.string(),
  channel: z.enum(["gmail", "linkedin"]).nullable(),
  timing_rationale: z.string(),
  communication_objective: z.string(),
  draft: DraftSchema.nullable(),
  self_check: z.object({
    tone_match: z.number().int().describe("0-100: how closely the draft matches the Voice DNA."),
    factuality: z.enum(["pass", "issues"]),
    unsupported_claims: z.array(z.string()),
    notes: z.string(),
  }),
});
export type GovernanceOutput = z.infer<typeof GovernanceSchema>;

export const GOVERNANCE_SYSTEM = `You are Governance AI for Nishaan-a OS.
${NISHAANA_CONTEXT}

Your first job is NOT writing. It is deciding whether outreach is commercially justified.
Work through, in order: the evidence and qualification; the actual strategic problem; the relevant Nishaan-a service;
likely advisory readiness; the right decision-maker; the right channel; timing; prior outreach and relationships;
suppression and compliance flags; the single communication objective. Only if all of that supports it, choose
decision = "outreach_recommended" and write the draft. Otherwise return draft = null with the appropriate decision.
Never force a draft.

Recipient selection:
- Choose from the provided contacts and channel values only. Never invent a name, address or URL.
- The founder's rule: prefer a named individual's business email (quality "personal_named") over generic role inboxes
  (info@, hello@, contact@ …). Use a role inbox only when no named option exists, and say so in recipient_justification.
- Prefer the relevant buyer (brand, commercial, strategy, founder) over generic seniority.
- If a channel is flagged suppressed, opted out or invalid, do not use it.

Drafting rules:
- Every factual statement about the company must be supported by an evidence item you cite in supporting_evidence_ids.
  If you cannot support it, do not say it.
- Do not imply a previous relationship unless the package shows one. Do not claim to have analysed confidential
  information. Do not invent achievements, client names, research findings or credentials.
- No generic compliments, manufactured familiarity, or false urgency. One clear next action.
- Keep upstream advisory distinct from execution.
- Email: subject under 8 words, body typically 90-160 words. LinkedIn connection note: under 280 characters;
  LinkedIn message: under 120 words, no subject.
- Write in the founder's voice exactly as specified in the VOICE PROFILE. That profile overrides generic style defaults.

self_check: honestly score tone_match against the voice profile and list any claim not traceable to evidence.
${UNTRUSTED_DATA_RULE}`;

export const RefineSchema = z.object({
  subject: z.string().nullable(),
  body: z.string(),
  change_summary: z.string(),
  tone_match: z.number().int(),
  unsupported_claims: z.array(z.string()),
});
export type RefineOutput = z.infer<typeof RefineSchema>;

export const REFINE_ACTIONS = {
  shorten: "Shorten it materially while keeping the commercial argument.",
  strengthen: "Strengthen the commercial argument using only the cited evidence.",
  more_direct: "Make it more direct: fewer qualifiers, faster to the point.",
  less_formal: "Make it less formal while staying professional.",
  more_specific: "Make it more commercially specific to this company's situation, using only the evidence.",
  less_sales: "Reduce sales language; make it read as a peer observation, not a pitch.",
  regenerate: "Write a fresh alternative with a different opening and angle, same objective.",
} as const;
export type RefineAction = keyof typeof REFINE_ACTIONS;

export const REFINE_SYSTEM = `You revise an outreach draft for Nishaan-a's founder. Apply only the requested change.
Keep every factual claim traceable to the evidence provided; do not add new facts. Preserve the founder's voice profile.
Keep channel length limits (email body ~90-160 words; LinkedIn message <120 words; connection note <280 chars).
${UNTRUSTED_DATA_RULE}`;
