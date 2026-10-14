import { z } from "zod";
import { NEEDS, NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "./shared";
import { DIMENSIONS } from "@/lib/scoring/model";

const dimensionKeys = DIMENSIONS.map((d) => d.key) as [string, ...string[]];

export const QualificationAssessmentSchema = z.object({
  dimensions: z.array(
    z.object({
      key: z.enum(dimensionKeys),
      raw_score: z.number().nullable().describe("0-10, or null when evidence is insufficient. Never use 0 for 'unknown'."),
      confidence: z.number().describe("0-1 confidence in this dimension's score."),
      rationale: z.string(),
      evidence_ids: z.array(z.string()),
    }),
  ),
  why_company: z.array(z.string()).describe("Up to three evidence-backed reasons."),
  why_now: z.string(),
  why_nishaan: z.string(),
  who_to_approach: z.string(),
  whats_missing: z.array(z.string()),
  needs: z.array(z.enum(NEEDS)),
  affordability: z.enum(["strong", "moderate", "uncertain", "weak"]),
  affordability_reasons: z.array(z.string()),
  engagement_signals: z.string(),
  risk_flags: z.array(z.object({
    kind: z.enum(["dissolved", "insolvency", "filing_issue", "regulatory", "identity_mismatch", "domain_legitimacy", "reputational", "other"]),
    severity: z.enum(["info", "warning", "critical"]),
    summary: z.string(),
    evidence_id: z.string().nullable(),
  })),
});
export type QualificationAssessment = z.infer<typeof QualificationAssessmentSchema>;

export const QUALIFICATION_SYSTEM = `You are the qualification analyst inside Discovery AI for Nishaan-a OS.
${NISHAANA_CONTEXT}

Score each dimension 0-10 using ONLY the evidence package. Cite evidence ids for every score.
If evidence for a dimension is missing, set raw_score = null (unknown) — never 0 — and list it in whats_missing.
Distinguish: a company that could theoretically benefit; one with an observable strategic challenge; one actively
signalling demand for external expertise; one able to finance an engagement; one with an identifiable decision-maker.
Generic adverts or job posts are weak signals, not proof of buying consultancy.
Estimated revenue is never a verified fact. Do not claim knowledge of consulting budgets.
A missing public record is not an adverse finding. Flag adverse findings only when evidenced; avoid defamatory conclusions.
Affordability compares evidence against the private pricing ranges provided; use "uncertain" when evidence is thin.
${UNTRUSTED_DATA_RULE}`;
