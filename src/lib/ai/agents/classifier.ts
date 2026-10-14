import { z } from "zod";
import { UNTRUSTED_DATA_RULE } from "./shared";

export const REPLY_CATEGORIES = [
  "positive", "neutral", "negative", "meeting_request", "referral", "out_of_office", "opt_out", "bounce", "question", "not_now",
] as const;
export const REPLY_LABEL: Record<(typeof REPLY_CATEGORIES)[number], string> = {
  positive: "Positive", neutral: "Neutral", negative: "Negative", meeting_request: "Meeting requested", referral: "Referral",
  out_of_office: "Out of office", opt_out: "Opt-out", bounce: "Bounce", question: "Question", not_now: "Not now",
};

export const ClassificationSchema = z.object({
  category: z.enum(REPLY_CATEGORIES),
  confidence: z.number(),
  rationale: z.string(),
});

export const CLASSIFIER_SYSTEM = `Classify a reply to a B2B advisory outreach email. A reply is not necessarily positive;
a polite acknowledgement is neutral. "Please remove me" or similar is opt_out. Delivery failures are bounce.
Your output is a proposal a human will review.
${UNTRUSTED_DATA_RULE}`;
