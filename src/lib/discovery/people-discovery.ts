import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";
import { addContact } from "@/lib/orgs/service";
import { createClient } from "@/lib/supabase/server";

const PhoneSchema = z.preprocess(
  (v: unknown) => {
    if (typeof v === "string") return { number: v };
    if (v && typeof v === "object" && !("number" in v) && "phone" in v) return { ...v, number: (v as Record<string, unknown>).phone };
    return v;
  },
  z.object({
    number: z.string().describe("Phone number with country code, e.g. +44 20 7123 4567"),
    type: z.enum(["mobile", "direct", "office", "unknown"]).catch("unknown"),
    source_url: z.string().nullable().optional().default(null),
  }),
);

const EmailSchema = z.preprocess(
  (v: unknown) => {
    if (typeof v === "string") return { address: v };
    if (v && typeof v === "object" && !("address" in v) && "email" in v) return { ...v, address: (v as Record<string, unknown>).email };
    return v;
  },
  z.object({
    address: z.string(),
    type: z.enum(["personal_named", "role_generic", "personal_free", "unknown"]).catch("unknown"),
    source_url: z.string().nullable().optional().default(null),
  }),
);

const PersonSchema = z.object({
  name: z.string(),
  title: z.string().catch("Unknown"),
  linkedin_url: z.string().nullable().optional().default(null),
  emails: z.array(EmailSchema).default([]).describe("All professional/personal emails found"),
  phones: z.array(PhoneSchema).default([]).describe("All phone numbers found (mobile, direct line, office)"),
  source_urls: z.array(z.string()).default([]).describe("All URLs where this person was found"),
  confidence: z.number().min(0).max(1).catch(0.5),
  notes: z.string().nullable().optional().default(null),
});

const PeopleDiscoverySchema = z.object({
  people: z.array(PersonSchema).describe("Decision-makers and key contacts discovered"),
  sources_checked: z.array(z.string()).default([]).describe("URLs or source names that were searched"),
  notes: z.string().nullable().optional(),
});

const SYSTEM = `You are Taftish, the discovery and research agent for Nishaan-a OS. ${NISHAANA_CONTEXT}

Your task: find decision-makers and key contacts for a specific organisation, including their DIRECT CONTACT DETAILS.

## Discovery strategy
1. Search the company website thoroughly: /about, /team, /people, /leadership, /contact, /our-team pages.
2. Search LinkedIn for the company page and its employees.
3. Search business directories (Crunchbase, ZoomInfo profiles, Apollo.io profiles, RocketReach, Clutch, Glassdoor).
4. Search press releases, news articles, conference speaker lists, podcast guest appearances.
5. Search Companies House / MCA registry for directors.
6. Search Google for "[person name] [company name] email" and "[person name] [company name] phone".
7. Check the company domain for email patterns (first.last@, f.last@, firstlast@) from any confirmed email.

## Contact detail rules
- Find ALL available contact information: professional emails, personal emails, mobile numbers, direct lines, office numbers.
- For emails: search company websites, press releases, conference bios, GitHub profiles, personal blogs, academic profiles, Crunchbase profiles.
- For phones: search company contact pages, LinkedIn profiles (sometimes visible), press releases with media contact numbers, conference speaker bios, business directories.
- Prefer personal named emails (firstname.lastname@company.com) over generic (info@, hello@, contact@).
- If you find one email pattern at the company (e.g. j.smith@acme.com), infer the pattern for other employees but mark confidence lower.
- Include country codes on all phone numbers (+44 for UK, +91 for India, +1 for US, etc.).
- NEVER fabricate contact details. Only report what you actually find. Leave arrays empty if nothing found.

## Priority roles
Founders, CEO, MD, Managing Director, CMO, Chief Marketing Officer, CCO, Chief Commercial Officer,
Head of Brand, Head of Marketing, Head of Strategy, Head of Growth, Head of Commercial,
Head of Partnerships, VP Marketing, VP Strategy, Director of Marketing, Director of Business Development.

## Output
- Return up to 20 people, ordered by buyer relevance to Nishaan-a's upstream advisory services.
- Cross-reference findings across sources. Confidence: 0.9+ = confirmed on company site with contact details; 0.7-0.89 = found on LinkedIn matching company; 0.5-0.69 = mentioned in news/press; <0.5 = uncertain.
- Include ALL source URLs where you found each person.

Return ONLY the JSON object matching the schema.
${UNTRUSTED_DATA_RULE}`;

export async function discoverPeople(
  workspaceId: string,
  userId: string,
  org: { id: string; trading_name: string; website: string | null; primary_market: string; sector: string | null; linkedin_url?: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: SupabaseClient<any>,
) {
  const res = await runStructured({
    workspaceId,
    agent: "taftish",
    system: SYSTEM,
    schema: PeopleDiscoverySchema,
    userId,
    maxTokens: 16000,
    webSearch: { maxUses: 20 },
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      `Find decision-makers and their DIRECT CONTACT DETAILS (emails, phone numbers, LinkedIn) for:`,
      `Company: ${org.trading_name}`,
      org.website ? `Website: ${org.website}` : "",
      org.sector ? `Sector: ${org.sector}` : "",
      `Market: ${org.primary_market}`,
      org.linkedin_url ? `LinkedIn: ${org.linkedin_url}` : "",
      ``,
      `IMPORTANT: Search deeply for contact information. Check the company website's team/about/contact pages, `,
      `search Google for "[name] [company] email", check business directories, conference bios, and press releases.`,
      `I need professional emails and phone numbers — not just names and titles.`,
      `Focus on people who would be relevant buyers for upstream strategic advisory services (brand strategy, market entry, commercial transformation).`,
    ].filter(Boolean).join("\n"),
    cacheTtlMs: 3600_000,
  });

  const supabase = client ?? await createClient();
  let added = 0;
  let skipped = 0;
  let phonesAdded = 0;
  let emailsAdded = 0;

  for (const p of res.data.people) {
    try {
      const primaryEmail = p.emails.find(e => e.type === "personal_named")?.address
        ?? p.emails[0]?.address
        ?? null;

      const contactId = await addContact(workspaceId, userId, org.id, {
        full_name: p.name,
        title: p.title,
        linkedin_url: p.linkedin_url,
        email: primaryEmail,
        subscriber_type: "corporate",
        source: p.source_urls[0] ? `taftish: ${p.source_urls[0]}` : "taftish",
      }, supabase);

      // Add additional emails beyond the primary
      for (const email of p.emails.slice(primaryEmail ? 1 : 0)) {
        if (email.address === primaryEmail) continue;
        try {
          await supabase.from("contact_channels").insert({
            workspace_id: workspaceId,
            contact_id: contactId,
            channel: "email",
            value: email.address.toLowerCase().trim(),
            email_quality: email.type === "personal_named" ? "personal_named" : email.type === "role_generic" ? "role_generic" : null,
            verification_status: "candidate",
            verification_method: "import_unverified",
            source: email.source_url ? `taftish: ${email.source_url}` : "taftish",
          });
          emailsAdded++;
        } catch { /* duplicate, skip */ }
      }

      // Add phone numbers
      for (const phone of p.phones) {
        try {
          await supabase.from("contact_channels").insert({
            workspace_id: workspaceId,
            contact_id: contactId,
            channel: "phone",
            value: phone.number.replace(/\s+/g, " ").trim(),
            verification_status: "candidate",
            verification_method: "import_unverified",
            source: phone.source_url ? `taftish: ${phone.source_url}` : "taftish",
          });
          phonesAdded++;
        } catch { /* duplicate, skip */ }
      }

      added++;
    } catch {
      skipped++;
    }
  }

  return {
    discovered: res.data.people.length,
    added,
    skipped,
    emailsAdded,
    phonesAdded,
    sources_checked: res.data.sources_checked,
    notes: res.data.notes,
    costUsd: res.costUsd,
  };
}
