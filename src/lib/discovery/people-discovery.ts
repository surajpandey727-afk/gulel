import "server-only";
import { z } from "zod";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";
import { addContact } from "@/lib/orgs/service";

const PersonSchema = z.object({
  name: z.string(),
  title: z.string().catch("Unknown"),
  linkedin_url: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
  source_url: z.string().nullable().optional().default(null),
  confidence: z.number().min(0).max(1).catch(0.5),
  notes: z.string().nullable().optional().default(null),
});

const PeopleDiscoverySchema = z.object({
  people: z.array(PersonSchema).describe("Decision-makers and key contacts discovered"),
  sources_checked: z.array(z.string()).describe("URLs or source names that were searched"),
  notes: z.string().nullable().optional(),
});

const SYSTEM = `You are Taftish, the discovery and research agent for Nishaan-a OS. ${NISHAANA_CONTEXT}

Your task: find decision-makers and key contacts for a specific organisation.

Rules:
- Search the company website (team/about pages), LinkedIn, business directories, press releases, conference speaker lists, and news.
- Prioritise: founders, CEO, MD, CMO, CCO, Head of Brand, Marketing, Strategy, Growth, Commercial, Partnerships.
- For each person, find: full name, job title, LinkedIn URL, professional email (from company domain).
- Cross-reference findings across sources. Assign confidence: 0.9+ = confirmed on company site; 0.7 = found on LinkedIn matching company; 0.5 = mentioned in news/press; <0.5 = uncertain.
- Never fabricate contact details. If an email is not publicly available, leave it null.
- Prefer personal named emails (firstname.lastname@domain) over generic (info@, hello@, contact@).
- Include the source URL where you found each person.
- Return up to 15 people, ordered by buyer relevance to Nishaan-a's advisory services.

Return ONLY the JSON object matching the schema.
${UNTRUSTED_DATA_RULE}`;

export async function discoverPeople(
  workspaceId: string,
  userId: string,
  org: { id: string; trading_name: string; website: string | null; primary_market: string; sector: string | null; linkedin_url?: string | null },
) {
  const res = await runStructured({
    workspaceId,
    agent: "taftish",
    system: SYSTEM,
    schema: PeopleDiscoverySchema,
    userId,
    maxTokens: 10000,
    webSearch: { maxUses: 8 },
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      `Find decision-makers and key contacts for:`,
      `Company: ${org.trading_name}`,
      org.website ? `Website: ${org.website}` : "",
      org.sector ? `Sector: ${org.sector}` : "",
      `Market: ${org.primary_market}`,
      org.linkedin_url ? `LinkedIn: ${org.linkedin_url}` : "",
      `Focus on people who would be relevant buyers for upstream strategic advisory services (brand strategy, market entry, commercial transformation).`,
    ].filter(Boolean).join("\n"),
    cacheTtlMs: 3600_000,
  });

  let added = 0;
  let skipped = 0;
  for (const p of res.data.people) {
    try {
      await addContact(workspaceId, userId, org.id, {
        full_name: p.name,
        title: p.title,
        linkedin_url: p.linkedin_url,
        email: p.email,
        subscriber_type: "corporate",
        source: p.source_url ? `taftish: ${p.source_url}` : "taftish",
      });
      added++;
    } catch {
      skipped++;
    }
  }

  return {
    discovered: res.data.people.length,
    added,
    skipped,
    sources_checked: res.data.sources_checked,
    notes: res.data.notes,
    costUsd: res.costUsd,
  };
}
