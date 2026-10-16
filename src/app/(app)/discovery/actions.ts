"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { runCampaign } from "@/lib/discovery/service";
import { dismissSignal, enrichFromCompaniesHouse, promoteSignal } from "@/lib/discovery/promote";
import { enrichOrganisationNews } from "@/lib/discovery/news";

type R<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: (e as Error).message ?? String(e) });
const list = z.array(z.string().trim().min(1)).default([]);

const Campaign = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, "Name the campaign"),
  market: z.enum(["UK", "IN", "BOTH"]),
  icp_id: z.string().uuid().nullable(),
  sources: z.array(z.enum(["companies_house", "ai_web_research", "manual_urls"])).min(1, "Choose at least one source"),
  frequency: z.enum(["manual", "daily", "weekly"]),
  max_leads_per_run: z.number().int().min(1).max(200),
  max_spend_usd: z.number().min(0).max(500),
  min_score: z.number().int().min(0).max(100),
  status: z.enum(["draft", "active", "paused", "archived"]),
  config: z.object({
    industries: list, keywords: list, excluded_keywords: list, excluded_industries: list, sic_codes: z.array(z.string().regex(/^\d{4,5}$/, "SIC codes are 4–5 digits")).default([]),
    negative_fit: z.string().default(""), incorporated_from: z.string().optional(), location: z.string().optional(), company_size: z.string().optional(), revenue_band: z.string().optional(), services: list,
  }),
});

export async function saveCampaignAction(input: z.input<typeof Campaign>): Promise<R<string>> {
  const s = await getSession();
  const p = Campaign.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { id, ...row } = p.data;
  const q = id
    ? supabase.from("discovery_campaigns").update(row).eq("id", id).eq("workspace_id", s.workspaceId).select("id").single()
    : supabase.from("discovery_campaigns").insert({ ...row, workspace_id: s.workspaceId, created_by: s.userId }).select("id").single();
  const { data, error } = await q;
  if (error) return { ok: false, error: error.code === "23505" ? "A campaign with that name exists." : error.message };
  await supabase.from("audit_logs").insert({ workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId, action: id ? "campaign.updated" : "campaign.created", entity_type: "discovery_campaign", entity_id: data.id, after: row });
  revalidatePath("/discovery");
  return { ok: true, data: data.id, message: "Saved." };
}

export async function runCampaignAction(id: string): Promise<R<{ status: string; newSignals: number; perSource: Record<string, { status: string; error?: string }> }>> {
  const s = await getSession();
  try {
    const supabase = await createClient();
    const r = await runCampaign(supabase, s.workspaceId, id, s.userId, "manual");
    revalidatePath("/discovery");
    return { ok: true, data: { status: r.status, newSignals: r.newSignals, perSource: r.perSource } };
  } catch (e) { return fail(e); }
}

const Icp = z.object({
  name: z.string().trim().min(3), market: z.enum(["UK", "IN", "BOTH"]), min_score: z.number().int().min(0).max(100),
  definition: z.object({
    industry: z.string().default(""), location: z.string().default(""), size: z.string().default(""), growth_stage: z.string().default(""),
    strategic_problem: z.string().default(""), triggers: z.string().default(""), decision_maker: z.string().default(""), exclusions: z.string().default(""), service: z.string().default(""),
  }),
});

/** ICPs are versioned: editing creates a new version and retires the old one. */
export async function saveIcpAction(input: z.input<typeof Icp>, replacesId?: string): Promise<R> {
  const s = await getSession();
  const p = Icp.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  let version = 1;
  if (replacesId) {
    const { data: old } = await supabase.from("icps").select("version_no, name").eq("id", replacesId).single();
    version = (old?.version_no ?? 0) + 1;
    await supabase.from("icps").update({ is_active: false }).eq("id", replacesId);
  }
  const { error } = await supabase.from("icps").insert({ ...p.data, version_no: version, workspace_id: s.workspaceId, is_active: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/discovery");
  return { ok: true, message: replacesId ? `Saved as v${version}.` : "ICP created." };
}

export async function promoteSignalAction(id: string, mode: "auto" | "new" | "merge"): Promise<R<string>> {
  const s = await getSession();
  try {
    const r = await promoteSignal(s.workspaceId, s.userId, id, mode);
    revalidatePath("/discovery");
    revalidatePath("/organisations");
    return { ok: true, data: r.organisationId, message: r.created ? "Organisation created with the signal as evidence." : "Signal attached to the existing organisation." };
  } catch (e) { return fail(e); }
}

export async function dismissSignalAction(id: string): Promise<R> {
  const s = await getSession();
  await dismissSignal(s.workspaceId, s.userId, id);
  revalidatePath("/discovery");
  return { ok: true };
}

export async function enrichNewsAction(organisationId: string, orgName: string, orgWebsite?: string | null, orgMarket?: string | null) {
  const s = await getSession();
  try {
    const r = await enrichOrganisationNews(s.workspaceId, s.userId, organisationId, orgName, orgWebsite, orgMarket);
    revalidatePath(`/organisations/${organisationId}`);
    return { ok: true as const, data: r };
  } catch (e) { return fail(e); }
}

export async function enrichCompaniesHouseAction(organisationId: string, companyNumber?: string) {
  const s = await getSession();
  try {
    const r = await enrichFromCompaniesHouse(s.workspaceId, s.userId, organisationId, companyNumber);
    revalidatePath(`/organisations/${organisationId}`);
    return { ok: true as const, data: r };
  } catch (e) { return fail(e); }
}
