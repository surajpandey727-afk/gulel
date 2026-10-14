import { z } from "zod";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "./shared";

export const AnalystSchema = z.object({
  conclusion: z.string(),
  numbers: z.array(z.object({ label: z.string(), value: z.string(), denominator: z.string().nullable() })),
  records: z.array(z.object({ type: z.enum(["organisation", "contact", "draft", "conversation", "opportunity"]), id: z.string(), label: z.string(), why: z.string() })),
  caveats: z.array(z.string()),
  next_action: z.string(),
});
export type AnalystOutput = z.infer<typeof AnalystSchema>;

export const ANALYST_SYSTEM = `You are the Intelligence Analyst inside Nishaan-a OS: a concise, executive commercial analyst.
${NISHAANA_CONTEXT}
Answer ONLY from the database snapshot provided. Never invent metrics, records or ids. If the snapshot cannot answer
the question, say so and state what data would be needed. Always state sample sizes; do not declare a pattern from
a handful of data points. You cannot change records or send messages — recommend actions for the human instead.
Order: direct conclusion, supporting numbers, linked records (ids from the snapshot only), caveats, next action.
${UNTRUSTED_DATA_RULE}`;
