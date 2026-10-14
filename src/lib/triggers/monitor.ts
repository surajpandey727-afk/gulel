import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companiesHouseConfigured, getOfficers, getProfile, officerDisplayName, CH_PUBLIC_URL, type ChOfficer, type ChProfile } from "@/lib/discovery/companies-house";
import { diffRegistry, type RegistrySnapshot } from "./diff";

export function toSnapshot(p: ChProfile, officers: ChOfficer[]): RegistrySnapshot {
  return {
    status: p.company_status,
    insolvency: !!p.has_insolvency_history,
    accountsOverdue: !!p.accounts?.overdue,
    confirmationOverdue: !!p.confirmation_statement?.overdue,
    lastAccountsMadeUpTo: p.accounts?.last_accounts?.made_up_to ?? null,
    officers: officers.filter((o) => !o.resigned_on).map((o) => ({ name: officerDisplayName(o.name), role: o.officer_role })),
  };
}

export async function saveSnapshot(db: SupabaseClient, workspaceId: string, organisationId: string, snap: RegistrySnapshot) {
  await db.from("organisation_snapshots").upsert({ workspace_id: workspaceId, organisation_id: organisationId, source: "companies_house", data: snap, fetched_at: new Date().toISOString() }, { onConflict: "organisation_id,source" });
}

/**
 * Re-checks monitored UK organisations against Companies House. Material changes become trigger
 * events with evidence, an internal task and (for high materiality) a review flag. Never sends.
 * Monitored = current qualification at/above threshold, or an active relationship/conversation.
 */
export async function scanTriggers(db: SupabaseClient, workspaceId: string, limit = 40) {
  if (!companiesHouseConfigured()) return { skipped: "companies_house_not_configured" };
  const { data: model } = await db.from("scoring_models").select("qualified_threshold").eq("workspace_id", workspaceId).eq("is_active", true).maybeSingle();
  const threshold = model?.qualified_threshold ?? 70;
  const { data: orgs } = await db.from("organisations")
    .select("id, trading_name, registration_number, relationship_status, lead_qualifications(score, override_score, is_current), organisation_snapshots(data, fetched_at, source)")
    .eq("workspace_id", workspaceId).eq("primary_market", "UK").not("registration_number", "is", null).is("deleted_at", null).limit(500);
  const monitored = (orgs ?? []).filter((o) => {
    const q = (o.lead_qualifications as Array<{ score: number; override_score: number | null; is_current: boolean }>).find((x) => x.is_current);
    return (q && Number(q.override_score ?? q.score) >= threshold) || ["client", "in_conversation", "partner"].includes(o.relationship_status);
  }).sort((a, b) => {
    const t = (o: typeof a) => new Date((o.organisation_snapshots as Array<{ fetched_at: string }>)[0]?.fetched_at ?? 0).getTime();
    return t(a) - t(b); // stalest first
  }).slice(0, limit);

  let events = 0;
  for (const o of monitored) {
    const [profile, officers] = await Promise.all([getProfile(o.registration_number!), getOfficers(o.registration_number!)]);
    const next = toSnapshot(profile, officers);
    const prevRow = (o.organisation_snapshots as Array<{ data: RegistrySnapshot; source: string }>).find((s) => s.source === "companies_house");
    await saveSnapshot(db, workspaceId, o.id, next);
    if (!prevRow) continue; // first sighting establishes the baseline
    for (const ch of diffRegistry(prevRow.data, next)) {
      const { data: ev } = await db.from("evidence_items").insert({
        workspace_id: workspaceId, organisation_id: o.id, claim_field: ch.kind.startsWith("leadership") ? "signal.leadership_change" : "diligence.status",
        claim_text: ch.summary, fact_type: "dated_filing", source_name: "Companies House", source_url: CH_PUBLIC_URL(o.registration_number!), confidence: 0.95,
        is_adverse: ch.kind === "insolvency", created_by_type: "system",
      }).select("id").single();
      const { data: task } = await db.from("tasks").insert({ workspace_id: workspaceId, title: `Review trigger at ${o.trading_name}: ${ch.summary}`.slice(0, 280), kind: "review", due_at: new Date().toISOString(), organisation_id: o.id, source: "system" }).select("id").single();
      await db.from("trigger_events").insert({ workspace_id: workspaceId, organisation_id: o.id, source: "companies_house", kind: ch.kind, materiality: ch.materiality, summary: ch.summary, evidence_id: ev?.id, task_id: task?.id });
      if (ch.materiality === "high") {
        await db.from("organisation_risk_flags").insert({ workspace_id: workspaceId, organisation_id: o.id, kind: ch.kind === "insolvency" ? "insolvency" : "other", severity: "critical", summary: ch.summary, evidence_id: ev?.id, status: "needs_review" });
      }
      events++;
    }
  }
  return { checked: monitored.length, events };
}
