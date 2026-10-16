import "server-only";
import { z } from "zod";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";

export const LinkedInOrgSchema = z.object({
  trading_name: z.string(),
  legal_name: z.string().nullable().optional().default(null),
  website: z.string().nullable().optional().default(null),
  headquarters: z.string().nullable().optional().default(null),
  sector: z.string().nullable().optional().default(null),
  sub_sector: z.string().nullable().optional().default(null),
  employee_count: z.number().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
  primary_market: z.string().nullable().optional().default(null).transform((v) => (v === "UK" || v === "IN" ? v : null)),
  registration_number: z.string().nullable().optional().default(null),
  incorporation_year: z.string().nullable().optional().default(null),
  linkedin_url: z.string(),
  decision_makers: z.array(z.object({
    name: z.string(),
    title: z.string(),
    linkedin_url: z.string().nullable().optional().default(null),
  })).optional().default([]).describe("Up to 5 senior decision-makers (founders, C-suite, directors)"),
  needs: z.array(z.string()).optional().default([]).describe("Inferred strategic needs from Nishaan-a's service areas"),
  signals: z.array(z.object({
    type: z.enum(["funding", "expansion", "launch", "rebrand", "consolidation", "leadership_change", "hiring", "other"]).catch("other"),
    claim: z.string(),
    source_url: z.string().nullable().optional().default(null),
  })).optional().default([]).describe("Recent signals indicating advisory need"),
});

export type LinkedInOrgData = z.infer<typeof LinkedInOrgSchema>;

const SYSTEM = `You are Taftish, the discovery and research agent for Nishaan-a OS. ${NISHAANA_CONTEXT}

Your task: given a LinkedIn company page URL, use web search to research the organisation thoroughly and extract structured data.

Rules:
- Search for the company by name and domain found on the LinkedIn page.
- Cross-reference with the company website, Companies House (if UK), news articles, and Crunchbase.
- Extract factual information only. Never invent employees, funding amounts, or dates.
- For decision_makers: find founders, CEO, MD, CMO, CCO, and senior directors. Include LinkedIn URLs where available.
- For needs: infer which of Nishaan-a's services could be relevant based on the company's stage, industry, and recent activity.
- For primary_market: determine if the company primarily operates in the UK or India. Use null if neither or unclear.
- For registration_number: only include if found on Companies House or MCA (India) records.
- Prefer personal named emails from the company domain over generic info@/hello@ addresses.

Return ONLY the JSON object matching the schema.
${UNTRUSTED_DATA_RULE}`;

export async function lookupLinkedInOrg(workspaceId: string, userId: string | null, linkedinUrl: string): Promise<LinkedInOrgData> {
  const res = await runStructured({
    workspaceId,
    agent: "taftish",
    system: SYSTEM,
    schema: LinkedInOrgSchema,
    userId,
    maxTokens: 8000,
    webSearch: { maxUses: 6 },
    input: `Today is ${new Date().toISOString().slice(0, 10)}.\nResearch this organisation from their LinkedIn page and all available public sources:\n${linkedinUrl}`,
    cacheTtlMs: 3600_000,
  });
  return res.data;
}
