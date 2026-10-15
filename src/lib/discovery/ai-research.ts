import "server-only";
import { z } from "zod";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";
import { normaliseUrlForCompare } from "./filters";

export const ResearchCandidatesSchema = z.object({
  candidates: z.array(z.object({
    name: z.string(),
    domain: z.string().nullable(),
    market: z.enum(["UK", "IN"]).nullable(),
    signal_type: z.enum(["funding", "expansion", "launch", "rebrand", "consolidation", "leadership_change", "hiring", "rfp", "other"]),
    strength: z.enum(["weak", "moderate", "strong"]),
    claim: z.string().describe("One factual sentence describing the signal, supported by source_url."),
    uncertainty: z.string().describe("What the signal does NOT prove (e.g. a job ad is not proof of buying consultancy)."),
    source_url: z.string(),
    published_date: z.string().nullable().describe("YYYY-MM-DD if stated on the source"),
  })),
  notes: z.string(),
});

const SYSTEM = `You are Discovery AI for Nishaan-a OS. ${NISHAANA_CONTEXT}
Use web search to find organisations showing credible, recent signals that they may need upstream strategic advisory.
Rules:
- Every candidate must be supported by a page you actually retrieved in this session; put that exact URL in source_url.
- Never invent companies, funding amounts, dates or people. If unsure, leave it out.
- Classify signal strength honestly. Generic adverts or job posts are weak signals, not proof of demand for consultancy.
- Prefer independent reporting over press releases; prefer the last 12 months.
- Respect exclusions given in the brief.
- You must not prepare or suggest any outreach message.
Finish with ONLY a JSON object: {"candidates":[...], "notes":"..."} matching the requested fields.
${UNTRUSTED_DATA_RULE}`;

export interface ResearchBrief {
  market: "UK" | "IN" | "BOTH";
  industries: string[];
  keywords: string[];
  excludedKeywords: string[];
  excludedIndustries: string[];
  negativeFit: string;
  icp?: string | null;
  limit: number;
  knownNames: string[];
}

export async function aiWebResearch(workspaceId: string, userId: string | null, brief: ResearchBrief) {
  const res = await runStructured({
    workspaceId, agent: "taftish", system: SYSTEM, schema: ResearchCandidatesSchema, userId, maxTokens: 12000,
    webSearch: { maxUses: Math.min(8, Math.max(2, Math.ceil(brief.limit / 3))) },
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}. Find up to ${brief.limit} candidate organisations.`,
      `Market: ${brief.market === "BOTH" ? "United Kingdom and India" : brief.market === "UK" ? "United Kingdom" : "India"}`,
      brief.industries.length ? `Industries: ${brief.industries.join(", ")}` : "",
      brief.keywords.length ? `Signals / keywords to look for: ${brief.keywords.join(", ")}` : "",
      brief.icp ? `Ideal client profile: ${brief.icp}` : "",
      brief.excludedKeywords.length ? `Exclude anything matching: ${brief.excludedKeywords.join(", ")}` : "",
      brief.excludedIndustries.length ? `Exclude industries: ${brief.excludedIndustries.join(", ")}` : "",
      brief.negativeFit ? `Negative fit (skip these): ${brief.negativeFit}` : "",
      brief.knownNames.length ? `Already known — do not return: ${brief.knownNames.slice(0, 200).join("; ")}` : "",
    ].filter(Boolean).join("\n"),
  });
  // Deterministic citation check: keep only candidates whose URL was actually returned by search.
  const seen = new Set(res.searchedUrls.map(normaliseUrlForCompare));
  const verified = res.data.candidates.filter((c) => seen.has(normaliseUrlForCompare(c.source_url)));
  return { candidates: verified, dropped: res.data.candidates.length - verified.length, costUsd: res.costUsd, executionId: res.executionId, notes: res.data.notes };
}

