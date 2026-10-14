import { z } from "zod";
import { UNTRUSTED_DATA_RULE } from "./shared";

export const VoiceDnaSchema = z.object({
  formality: z.string(),
  sentence_length: z.string(),
  vocabulary: z.string(),
  assertiveness: z.string(),
  directness: z.string(),
  rhythm: z.string(),
  persuasion_style: z.string(),
  commercial_reasoning: z.string(),
  typical_openings: z.array(z.string()),
  typical_conclusions: z.array(z.string()),
  personalisation_level: z.string(),
  use_of_evidence: z.string(),
  preferred_ctas: z.array(z.string()),
  punctuation_habits: z.string(),
  expressions_to_preserve: z.array(z.string()),
  expressions_to_reject: z.array(z.string()),
  avoided_phrases: z.array(z.string()),
});

export const VoiceExtractionSchema = z.object({
  dna: VoiceDnaSchema,
  generation_prompt: z.string().describe("A compact (<= 250 words) second-person instruction that reproduces this voice."),
  representative_examples: z.array(z.object({ excerpt: z.string(), why: z.string() })).describe("2-5 short verbatim excerpts from the samples."),
  confidence_notes: z.string().describe("Where samples were thin or contradictory."),
});
export type VoiceExtraction = z.infer<typeof VoiceExtractionSchema>;

export const VOICE_SYSTEM = `You are the Voice DNA analyst for a founder's private writing profile.
Derive a precise, reusable description of how this person writes — not how a generic professional writes.
Base every observation on the samples. Quote short verbatim excerpts only from the samples provided.
Samples marked "dislike" show writing the founder rejects: derive expressions_to_reject and avoided_phrases from them,
never imitate them. Where the samples conflict with professional factual communication, keep factuality.
${UNTRUSTED_DATA_RULE}`;

export const PreferenceSchema = z.object({
  preference: z.string().describe("One generalisable writing preference, phrased as an instruction."),
  generalisable: z.boolean().describe("False if the edit is specific to this one message."),
});
export const PREFERENCE_SYSTEM = `Compare an AI draft with the founder's edited version. State the single most generalisable
writing preference the edit reveals (e.g. "Open with the commercial observation, not a greeting"). If the edit only fixes
facts or is specific to this message, set generalisable=false.`;
