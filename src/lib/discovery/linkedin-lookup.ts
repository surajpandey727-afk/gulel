import "server-only";
import { z } from "zod";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";

const coerceNumber = z.union([z.number(), z.string().transform((s) => { const n = Number(s.replace(/[^0-9.-]/g, "")); return isNaN(n) ? null : n; })]).nullable().optional().default(null);

export function normalizeAiOutput(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const o = raw as Record<string, unknown>;
  // Flatten nested "organisation" object to top level (AI often nests there)
  const nested = (o.organisation ?? o.company ?? o.org) as Record<string, unknown> | undefined;
  if (typeof nested === "object" && nested !== null) {
    for (const [k, v] of Object.entries(nested)) { if (!(k in o) || o[k] === null || o[k] === undefined || o[k] === "Unknown") o[k] = v; }
  }
  // Map common alternative field names
  if (!o.trading_name || o.trading_name === "Unknown") o.trading_name = o.company_name ?? o.name ?? o.trading_name;
  if (!o.sector) o.sector = o.industry;
  if (!o.incorporation_year && o.founded_year) o.incorporation_year = String(o.founded_year);
  if (!o.linkedin_url && typeof nested?.linkedin_url === "string") o.linkedin_url = nested.linkedin_url;
  return o;
}

export const LinkedInOrgSchema = z.object({
  trading_name: z.string().catch("Unknown"),
  legal_name: z.string().nullable().optional().default(null),
  website: z.string().nullable().optional().default(null),
  headquarters: z.string().nullable().optional().default(null),
  sector: z.string().nullable().optional().default(null),
  sub_sector: z.string().nullable().optional().default(null),
  employee_count: coerceNumber,
  description: z.string().nullable().optional().default(null),
  primary_market: z.string().nullable().optional().default(null).transform((v) => (v === "UK" || v === "IN" ? v : null)),
  registration_number: z.string().nullable().optional().default(null),
  incorporation_year: z.union([z.string(), z.number().transform(String)]).nullable().optional().default(null),
  linkedin_url: z.string().catch(""),
  decision_makers: z.array(z.object({
    name: z.string(),
    title: z.string().catch("Unknown"),
    linkedin_url: z.string().nullable().optional().default(null),
  }).catchall(z.unknown())).optional().default([]).describe("Up to 5 senior decision-makers (founders, C-suite, directors)"),
  needs: z.array(z.union([
    z.string(),
    z.record(z.string(), z.unknown()).transform((o) => {
      const v = (o as Record<string, unknown>);
      return String(v.need ?? v.name ?? v.title ?? v.description ?? Object.values(v).find((x) => typeof x === "string") ?? "");
    }),
  ])).optional().default([]).describe("Inferred strategic needs from Nishaan-a's service areas"),
  signals: z.array(z.object({
    type: z.enum(["funding", "expansion", "launch", "rebrand", "consolidation", "leadership_change", "hiring", "other"]).catch("other"),
    claim: z.string(),
    source_url: z.string().nullable().optional().default(null),
  }).catchall(z.unknown())).optional().default([]).describe("Recent signals indicating advisory need"),
}).catchall(z.unknown());

export type LinkedInOrgData = {
  trading_name: string;
  legal_name: string | null;
  website: string | null;
  headquarters: string | null;
  sector: string | null;
  sub_sector: string | null;
  employee_count: number | null;
  description: string | null;
  primary_market: "UK" | "IN" | null;
  registration_number: string | null;
  incorporation_year: string | null;
  linkedin_url: string;
  decision_makers: Array<{ name: string; title: string; linkedin_url: string | null }>;
  needs: string[];
  signals: Array<{ type: string; claim: string; source_url: string | null }>;
};

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
    preprocess: normalizeAiOutput,
    input: `Today is ${new Date().toISOString().slice(0, 10)}.\nResearch this organisation from their LinkedIn page and all available public sources:\n${linkedinUrl}`,
    cacheTtlMs: 3600_000,
  });
  return res.data;
}
