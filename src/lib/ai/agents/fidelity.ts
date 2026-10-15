import { z } from "zod";
import { UNTRUSTED_DATA_RULE } from "./shared";

export const FidelitySchema = z.object({
  tone_match: z.number().min(0).max(100).describe("0-100 score: how closely the draft replicates the founder's voice."),
  dimension_scores: z.record(z.string(), z.number().min(0).max(100)).describe("Per-dimension fidelity scores keyed by VoiceDNA dimension name."),
  strongest_dimensions: z.array(z.string()).describe("Top 3 dimensions where the draft best matches the founder's voice."),
  weakest_dimensions: z.array(z.string()).describe("Up to 3 dimensions where the draft diverges most from the voice profile."),
  specific_issues: z.array(z.string()).describe("Concrete, actionable notes on where the draft's voice diverges."),
  overall_assessment: z.string().describe("One-paragraph summary of voice fidelity."),
});
export type FidelityResult = z.infer<typeof FidelitySchema>;

export const FIDELITY_SYSTEM = `You are an independent Voice Fidelity evaluator. You receive a founder's Voice DNA profile and a draft message.
Your ONLY job is to evaluate how faithfully the draft reproduces the founder's writing voice. You are NOT the author.
Score each Voice DNA dimension (formality, sentence_length, vocabulary, assertiveness, directness, rhythm,
persuasion_style, commercial_reasoning, personalisation_level, use_of_evidence, punctuation_habits) individually,
then produce an overall tone_match score (0-100).
Be precise and critical — a score of 80+ means the draft could pass as the founder's own writing.
A score below 60 means significant voice divergence. Flag specific phrases or patterns that break character.
${UNTRUSTED_DATA_RULE}`;
