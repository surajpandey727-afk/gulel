"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { addContact, addEvidence, createOrganisation } from "@/lib/orgs/service";

/** Clearly-labelled FICTIONAL demo records (.test domains) for visual development. Excluded from KPIs. */
const DEMO = [
  {
    org: { trading_name: "[DEMO] Saffron Row Snacks", website: "https://saffronrow.test", primary_market: "UK" as const, sector: "FMCG · Premium snacks", headquarters: "Leeds" },
    contacts: [{ full_name: "Demo Person One", title: "Chief Marketing Officer", email: "demo.one@saffronrow.test" }, { full_name: "", title: "", email: "hello@saffronrow.test" }],
    evidence: [
      { claim_field: "signal.expansion", claim_text: "[Demo] Announced entry into two new snack categories", fact_type: "reported_fact" as const, source_name: "Demo Trade Journal", source_url: "https://example.test/demo-1", confidence: 0.7 },
      { claim_field: "brand.architecture", claim_text: "[Demo] Operates four sub-brands with overlapping positioning", fact_type: "inference" as const, source_name: "Founder knowledge", confidence: 0.5 },
    ],
  },
  {
    org: { trading_name: "[DEMO] Monsoon Mill Textiles", website: "https://monsoonmill.test", primary_market: "IN" as const, sector: "Apparel · D2C", headquarters: "Jaipur" },
    contacts: [{ full_name: "Demo Person Two", title: "Co-Founder", email: "two@monsoonmill.test" }],
    evidence: [{ claim_field: "signal.funding", claim_text: "[Demo] Raised a Series A to fund UK market entry", fact_type: "reported_fact" as const, source_name: "Demo Business Daily", source_url: "https://example.test/demo-2", confidence: 0.8 }],
  },
];

export async function seedDemoAction(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const s = await getSession();
  if (s.role !== "owner") return { ok: false, error: "Owner only" };
  try {
    for (const d of DEMO) {
      const id = await createOrganisation(s.workspaceId, s.userId, { ...d.org, is_demo: true });
      for (const c of d.contacts) if (c.full_name) await addContact(s.workspaceId, s.userId, id, { ...c, is_demo: true, subscriber_type: "corporate", source: "demo" });
      for (const e of d.evidence) await addEvidence(s.workspaceId, s.userId, { organisation_id: id, ...e });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: `Loaded ${DEMO.length} demo organisations.` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
