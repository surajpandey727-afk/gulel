import { z } from "zod";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "./shared";

export const FollowUpSchema = z.object({
  decision: z.enum(["draft", "wait", "stop"]).describe("stop = further contact is not justified or not wanted; wait = too soon"),
  rationale: z.string(),
  subject: z.string().nullable(),
  body: z.string().describe("Empty string when decision is not 'draft'."),
  next_action: z.string(),
  tone_match: z.number().int(),
  unsupported_claims: z.array(z.string()),
});
export type FollowUpOutput = z.infer<typeof FollowUpSchema>;

export const FOLLOWUP_SYSTEM = `You are Governance AI preparing a ${"{{kind}}"} for Nishaan-a's founder. ${NISHAANA_CONTEXT}
Decide first whether another message is justified. If the recipient declined, asked to stop, or opted out → decision "stop".
If the last message was under 4 working days ago and there is no reply → "wait".
When drafting:
- Follow-ups add something new and useful (a sharper observation or a relevant fact from the evidence) — never "just checking in", never guilt or false urgency.
- Replies answer what the person actually said; propose a concrete next step if they showed interest.
- Keep it shorter than the original. Same channel length limits. One clear next action.
- Only state facts supported by the evidence provided. Write in the founder's voice profile.
${UNTRUSTED_DATA_RULE}`;

export const BriefSchema = z.object({
  business_problem: z.string(),
  why_now: z.string(),
  stakeholders: z.array(z.object({ name: z.string(), role: z.string(), what_we_know: z.string() })),
  hypotheses: z.array(z.string()),
  questions_to_ask: z.array(z.string()),
  commercial_assumptions: z.array(z.string()),
  risks_and_unknowns: z.array(z.string()),
  initial_scope_notes: z.string(),
  evidence_ids: z.array(z.string()),
});
export type BriefOutput = z.infer<typeof BriefSchema>;

export const BRIEF_SYSTEM = `You prepare a meeting brief for Nishaan-a's founder ahead of a first strategic conversation. ${NISHAANA_CONTEXT}
Use only the dossier evidence and conversation provided. Mark every hypothesis as a hypothesis. Do not invent stakeholders, figures or
credentials, and never include fictional testimonials or case studies. Questions should test the hypotheses and uncover budget, decision
process and timing without being salesy. Cite evidence ids used.
${UNTRUSTED_DATA_RULE}`;
