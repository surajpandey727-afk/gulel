import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advancedSearch, companiesHouseConfigured, CH_PUBLIC_URL } from "./companies-house";
import { aiWebResearch } from "./ai-research";
import { passesExclusions, type CampaignConfig } from "./filters";
import { normaliseCompanyName, normaliseDomain } from "@/lib/import/normalise";
import { resolveOrganisation, type ExistingOrg } from "@/lib/import/resolve";
import { GatewayError } from "@/lib/ai/gateway";

interface Candidate {
  source: string; external_id: string | null; name: string; domain: string | null; registration: string | null; market: "UK" | "IN" | null;
  signal_type: string; strength: "weak" | "moderate" | "strong"; claim_text: string; uncertainty: string | null; source_url: string | null; published_at: string | null; raw: Record<string, unknown>;
}

export const SOURCE_LABEL: Record<string, string> = { companies_house: "Companies House", ai_web_research: "AI web research (cited)", manual_urls: "Manual URLs" };

export function sourceAvailability() {
  return {
    companies_house: companiesHouseConfigured() ? "configured" : "not_configured",
    ai_web_research: "requires_ai_provider",
    manual_urls: "manual",
  } as Record<string, string>;
}

/** Runs one campaign across its sources. Never drafts or sends anything. */
export async function runCampaign(db: SupabaseClient, workspaceId: string, campaignId: string, userId: string | null, trigger: "manual" | "schedule" = "manual") {
  const { data: c } = await db.from("discovery_campaigns").select("*, icps(name, definition)").eq("id", campaignId).eq("workspace_id", workspaceId).single();
  if (!c) throw new Error("Campaign not found");
  if (c.status === "archived") throw new Error("Campaign is archived");
  const cfg = (c.config ?? {}) as CampaignConfig;
  const { data: run } = await db.from("discovery_runs").insert({ workspace_id: workspaceId, campaign_id: c.id, trigger, started_by: userId }).select("id").single();
  const perSource: Record<string, { status: string; found?: number; kept?: number; error?: string; dropped_uncited?: number }> = {};
  const candidates: Candidate[] = [];
  let cost = 0;

  const { data: orgs } = await db.from("organisations").select("id, trading_name, normalised_name, primary_domain, registration_number, primary_market").eq("workspace_id", workspaceId).is("deleted_at", null);
  const existing: ExistingOrg[] = (orgs ?? []).map((o) => ({ id: o.id, normalisedName: o.normalised_name, domain: o.primary_domain, registrationNumber: o.registration_number, market: o.primary_market }));

  for (const src of c.sources as string[]) {
    try {
      if (src === "companies_house") {
        if (c.market === "IN") { perSource[src] = { status: "skipped", error: "UK registry — campaign is India-only" }; continue; }
        if (!companiesHouseConfigured()) { perSource[src] = { status: "not_configured", error: "Add COMPANIES_HOUSE_API_KEY on the server" }; continue; }
        const items = await advancedSearch({ sicCodes: cfg.sic_codes, nameIncludes: cfg.keywords?.[0], incorporatedFrom: cfg.incorporated_from, location: cfg.location, size: c.max_leads_per_run });
        perSource[src] = { status: "ok", found: items.length };
        for (const it of items) {
          candidates.push({
            source: src, external_id: it.company_number, name: it.company_name, domain: null, registration: it.company_number, market: "UK",
            signal_type: "registry_match", strength: "weak",
            claim_text: `Active UK company matching campaign filters${it.sic_codes?.length ? ` (SIC ${it.sic_codes.join(", ")})` : ""}${it.date_of_creation ? `, incorporated ${it.date_of_creation}` : ""}${it.registered_office_address?.locality ? `, ${it.registered_office_address.locality}` : ""}.`,
            uncertainty: "A registry match shows the company exists and fits the filters — not that it needs advisory.",
            source_url: CH_PUBLIC_URL(it.company_number), published_at: it.date_of_creation ? new Date(it.date_of_creation).toISOString() : null, raw: it as unknown as Record<string, unknown>,
          });
        }
      } else if (src === "ai_web_research") {
        const icp = (c as { icps?: { name: string; definition: Record<string, unknown> } | null }).icps;
        const r = await aiWebResearch(workspaceId, userId, {
          market: c.market, industries: cfg.industries ?? [], keywords: cfg.keywords ?? [], excludedKeywords: cfg.excluded_keywords ?? [],
          excludedIndustries: cfg.excluded_industries ?? [], negativeFit: cfg.negative_fit ?? "", icp: icp ? `${icp.name}: ${JSON.stringify(icp.definition)}` : null,
          limit: c.max_leads_per_run, knownNames: (orgs ?? []).map((o) => o.trading_name),
        });
        cost += r.costUsd;
        perSource[src] = { status: "ok", found: r.candidates.length, dropped_uncited: r.dropped };
        for (const x of r.candidates) {
          const domain = normaliseDomain(x.domain);
          candidates.push({
            source: src, external_id: domain ?? normaliseCompanyName(x.name), name: x.name, domain, registration: null, market: x.market,
            signal_type: x.signal_type, strength: x.strength, claim_text: x.claim, uncertainty: x.uncertainty, source_url: x.source_url,
            published_at: x.published_date && !isNaN(Date.parse(x.published_date)) ? new Date(x.published_date).toISOString() : null, raw: x as unknown as Record<string, unknown>,
          });
        }
        if (cost > Number(c.max_spend_usd)) perSource[src].error = `Run cost $${cost.toFixed(2)} exceeded campaign cap $${c.max_spend_usd}`;
      } else {
        perSource[src] = { status: "manual", error: "Add URLs as evidence on dossiers" };
      }
    } catch (e) {
      perSource[src] = { status: "failed", error: e instanceof GatewayError || e instanceof Error ? e.message : String(e) };
    }
  }

  let inserted = 0;
  const minScore = (c as { min_score?: number }).min_score ?? 0;
  const kept = candidates.filter((x) => passesExclusions(x, cfg)).slice(0, c.max_leads_per_run);
  for (const x of kept) {
    const res = resolveOrganisation({ normalisedName: normaliseCompanyName(x.name), domain: x.domain, registrationNumber: x.registration, market: x.market }, existing);
    if (res.decision !== "auto_merge") {
      const strengthScore = x.strength === "strong" ? 80 : x.strength === "moderate" ? 55 : 30;
      if (strengthScore < minScore) continue;
    }
    await db.from("entity_resolution_matches").insert({
      workspace_id: workspaceId, entity_type: "organisation", candidate_ref: x.external_id ?? normaliseCompanyName(x.name),
      matched_id: res.matchId, score: res.score, signals: res.signals,
      decision: res.decision === "auto_merge" ? "auto_merged" : res.decision === "propose" ? "proposed" : "proposed",
    }).select("id").single();
    const { data, error } = await db.from("discovery_signals").upsert({
      workspace_id: workspaceId, campaign_id: c.id, run_id: run!.id, source: x.source, external_id: x.external_id, candidate_name: x.name,
      candidate_domain: x.domain, candidate_registration: x.registration, market: x.market, signal_type: x.signal_type, strength: x.strength,
      claim_text: x.claim_text, uncertainty: x.uncertainty, source_url: x.source_url, published_at: x.published_at, raw: x.raw,
      match_hint: res.decision === "new" ? null : res, organisation_id: res.decision === "auto_merge" ? res.matchId : null,
    }, { onConflict: "workspace_id,source,external_id,signal_type", ignoreDuplicates: true }).select("id");
    if (!error && data?.length) inserted++;
  }
  for (const k of Object.keys(perSource)) if (perSource[k].status === "ok") perSource[k].kept = kept.filter((x) => x.source === k).length;

  const statuses = Object.values(perSource).map((p) => p.status);
  const status = statuses.every((s) => s === "ok") ? "succeeded" : statuses.some((s) => s === "ok") ? "partial" : statuses.some((s) => s === "failed") ? "failed" : "blocked";
  await db.from("discovery_runs").update({ status, per_source: perSource, candidates_found: candidates.length, new_signals: inserted, cost_usd: cost, finished_at: new Date().toISOString() }).eq("id", run!.id);
  await db.from("discovery_campaigns").update({ last_run_at: new Date().toISOString() }).eq("id", c.id);
  return { runId: run!.id as string, status, perSource, found: candidates.length, newSignals: inserted };
}
