import "server-only";
import { z } from "zod";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseLinkedIn, normaliseUrl } from "@/lib/import/normalise";
import { pushOrgToCentral, reconcile } from "./bridge";
import { autoPush } from "./sync";

const FindSchema = z.object({
  linkedin_url: z.string().nullable().catch(null),
  website: z.string().nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0),
  reason: z.string().catch(""),
});

const SYSTEM = `You are Taftish, the research agent for Nishaan-a OS. ${NISHAANA_CONTEXT}

Task: find the official LinkedIn company page (linkedin.com/company/...) and the official website of ONE organisation.

Rules:
- Use web search. Match on the exact organisation: name, country, city and industry must fit. Many brands share names; never guess.
- Only return a linkedin.com/company/ URL (not /in/, /school/, /showcase/ unless it is clearly the brand's only page, not a post or job).
- confidence: 0.9+ when name, location and industry all match on the page; 0.6-0.9 when most match; below 0.6 when unsure. Use null URLs when unsure.
- reason: one short sentence on how you matched it.
Return ONLY the JSON object.
${UNTRUSTED_DATA_RULE}`;

const LI_COMPANY = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|showcase)\/[^/?#\s]+/i;

/** Finds an organisation's LinkedIn company page (and website if missing) and records it everywhere. */
export async function findOrgLinkedIn(workspaceId: string, orgId: string, userId: string | null) {
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("trading_name, legal_name, website, city, country, sector, cr_key").eq("id", orgId).single();
  if (!org) throw new Error("Organisation not found");
  const { data: have } = await admin.from("contact_channels").select("value").eq("organisation_id", orgId).eq("channel", "linkedin").is("contact_id", null).limit(1).maybeSingle();
  if (have?.value) return { linkedin_url: have.value, skipped: "already known" };

  const res = await runStructured({
    workspaceId, agent: "taftish", system: SYSTEM, schema: FindSchema, userId, maxTokens: 1500, webSearch: { maxUses: 5 }, cacheTtlMs: 7 * 86400_000,
    input: [
      `Organisation: ${org.trading_name}`,
      org.legal_name ? `Legal name: ${org.legal_name}` : null,
      org.country ? `Country: ${org.country}` : null,
      org.city ? `City: ${org.city}` : null,
      org.sector ? `Industry: ${org.sector}` : null,
      org.website ? `Website: ${org.website}` : null,
    ].filter(Boolean).join("\n"),
  });
  const d = res.data;
  const raw = d.linkedin_url && LI_COMPANY.test(d.linkedin_url) ? d.linkedin_url.match(LI_COMPANY)![0] : null;
  const linkedin = raw && d.confidence >= 0.6 ? normaliseLinkedIn(raw) : null;
  const website = !org.website && d.website && d.confidence >= 0.6 ? normaliseUrl(d.website) : null;
  if (!linkedin && !website) return { linkedin_url: null, confidence: d.confidence, reason: d.reason || "No confident match" };

  if (org.cr_key) {
    const r = await pushOrgToCentral(workspaceId, orgId, { ...(linkedin ? { linkedin_url: linkedin } : {}), ...(website ? { website } : {}) }, null, admin, "agent", `LinkedIn finder (${Math.round(d.confidence * 100)}%): ${d.reason}`.slice(0, 200));
    if (!r.ok) throw new Error(r.error);
    await reconcile(workspaceId, admin);
    await autoPush(workspaceId, null);
  } else {
    if (linkedin) await admin.from("contact_channels").upsert({ workspace_id: workspaceId, organisation_id: orgId, channel: "linkedin", value: linkedin, verification_status: "candidate", source: "linkedin_finder" }, { onConflict: "workspace_id,channel,value", ignoreDuplicates: true });
    if (website) await admin.from("organisations").update({ website }).eq("id", orgId);
  }
  await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "agent", action: "organisation.linkedin_found", entity_type: "organisation", entity_id: orgId, metadata: { linkedin, website, confidence: d.confidence, reason: d.reason } });
  return { linkedin_url: linkedin, website, confidence: d.confidence, reason: d.reason };
}

/**
 * Link every repository organisation into gulel, then queue: find LinkedIn (if missing) → qualification.
 * Idempotent: organisations that already have a queued/running job of that kind are skipped.
 */
export async function queueRepositoryQualification(workspaceId: string, userId: string | null, opts: { requalify?: boolean } = {}) {
  const admin = createAdminClient();
  const linked = await reconcile(workspaceId, admin);
  const { data: orgs } = await admin.from("organisations").select("id, cr_key, lead_qualifications(is_current)").eq("workspace_id", workspaceId).not("cr_key", "is", null).is("deleted_at", null).is("archived_at", null);
  const { data: channels } = await admin.from("contact_channels").select("organisation_id").eq("workspace_id", workspaceId).eq("channel", "linkedin").is("contact_id", null);
  const hasLi = new Set((channels ?? []).map((c) => c.organisation_id));
  const { data: open } = await admin.from("jobs").select("type, payload").eq("workspace_id", workspaceId).in("type", ["linkedin_find", "qualification", "news_enrich"]).in("status", ["queued", "running"]);
  const busy = new Set((open ?? []).map((j) => `${j.type}:${(j.payload as { organisation_id?: string }).organisation_id}`));
  let finding = 0, qualifying = 0, skipped = 0;
  for (const o of orgs ?? []) {
    const qualified = (o.lead_qualifications as Array<{ is_current: boolean }>).some((q) => q.is_current);
    if (qualified && !opts.requalify && hasLi.has(o.id)) { skipped++; continue; }
    if (!hasLi.has(o.id)) {
      if (busy.has(`linkedin_find:${o.id}`)) { skipped++; continue; }
      await admin.from("jobs").insert({ workspace_id: workspaceId, type: "linkedin_find", payload: { organisation_id: o.id, user_id: userId, then_qualify: !qualified || !!opts.requalify }, max_attempts: 2, timeout_seconds: 300 });
      finding++;
    } else {
      if (busy.has(`qualification:${o.id}`) || busy.has(`news_enrich:${o.id}`)) { skipped++; continue; }
      // Gather sourced evidence first; news enrichment hands over to qualification when it finishes.
      await admin.from("jobs").insert({ workspace_id: workspaceId, type: "news_enrich", payload: { organisation_id: o.id, user_id: userId, then_qualify: true }, max_attempts: 2, timeout_seconds: 300 });
      qualifying++;
    }
  }
  return { linked, total: orgs?.length ?? 0, finding, qualifying, skipped };
}

/** Progress for the dashboard: how many repository organisations are linked, have LinkedIn, are qualified, are queued. */
export async function repositoryProgress(workspaceId: string) {
  const admin = createAdminClient();
  const [{ data: orgs }, { data: channels }, { data: jobs }] = await Promise.all([
    admin.from("organisations").select("id, lead_qualifications(is_current, band)").eq("workspace_id", workspaceId).not("cr_key", "is", null).is("deleted_at", null).is("archived_at", null),
    admin.from("contact_channels").select("organisation_id").eq("workspace_id", workspaceId).eq("channel", "linkedin").is("contact_id", null),
    admin.from("jobs").select("type, status, last_error, payload, updated_at").eq("workspace_id", workspaceId).in("type", ["linkedin_find", "qualification"]).order("updated_at", { ascending: false }).limit(400),
  ]);
  const ids = new Set((orgs ?? []).map((o) => o.id));
  const li = new Set((channels ?? []).filter((c) => ids.has(c.organisation_id)).map((c) => c.organisation_id));
  const qualified = (orgs ?? []).filter((o) => (o.lead_qualifications as Array<{ is_current: boolean }>).some((q) => q.is_current)).length;
  const mine = (jobs ?? []).filter((j) => ids.has((j.payload as { organisation_id?: string }).organisation_id ?? ""));
  const queued = mine.filter((j) => j.status === "queued" || j.status === "running").length;
  const latestFail = mine.find((j) => j.status === "failed" || j.status === "dead_letter");
  return { linked: ids.size, withLinkedIn: li.size, qualified, queued, lastError: latestFail?.last_error ?? null };
}
