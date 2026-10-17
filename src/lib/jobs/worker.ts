import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGmailAccount } from "@/lib/channels/gmail-sync";
import { classifyReply } from "@/lib/inbox/classify";
import { redact } from "@/lib/crypto";
import { runCampaign } from "@/lib/discovery/service";
import { scanTriggers } from "@/lib/triggers/monitor";
import { enrichFromCompaniesHouse } from "@/lib/discovery/promote";
import { companiesHouseConfigured } from "@/lib/discovery/companies-house";
import { runQualification } from "@/lib/qualification/service";
import { lookupLinkedInOrg } from "@/lib/discovery/linkedin-lookup";
import { createOrganisation } from "@/lib/orgs/service";
import { discoverPeople } from "@/lib/discovery/people-discovery";

type Job = { id: string; workspace_id: string; type: string; payload: Record<string, unknown>; attempts: number; correlation_id: string };

const HANDLERS: Record<string, (j: Job) => Promise<unknown>> = {
  gmail_sync: (j) => syncGmailAccount(j.workspace_id, j.payload.account_id as string),
  classify_reply: (j) => classifyReply(j.workspace_id, j.payload.conversation_message_id as string),
  followup_scan: (j) => followupScan(j.workspace_id),
  trigger_scan: (j) => scanTriggers(createAdminClient(), j.workspace_id),
  discovery_run: (j) => runCampaign(createAdminClient(), j.workspace_id, j.payload.campaign_id as string, null, "schedule"),
  companies_house: (j) => enrichFromCompaniesHouse(j.workspace_id, j.payload.user_id as string ?? null, j.payload.organisation_id as string, j.payload.registration_number as string | undefined),
  qualification: (j) => runQualification(j.workspace_id, j.payload.user_id as string ?? null, j.payload.organisation_id as string),
  rediscovery: (j) => runRediscovery(j),
  linkedin_lookup: (j) => runLinkedInLookup(j),
  people_discovery: (j) => runPeopleDiscovery(j),
};

/** Schedules recurring work idempotently (one gmail_sync per account per 5-minute slot). */
async function schedule() {
  const admin = createAdminClient();
  const slot = Math.floor(Date.now() / 300_000);
  const { data: accounts } = await admin.from("channel_accounts").select("id, workspace_id").eq("channel", "gmail").eq("status", "connected");
  for (const a of accounts ?? []) {
    await admin.from("jobs").upsert({ workspace_id: a.workspace_id, type: "gmail_sync", payload: { account_id: a.id }, idempotency_key: `sync:${a.id}:${slot}`, timeout_seconds: 240 }, { onConflict: "workspace_id,type,idempotency_key", ignoreDuplicates: true });
  }
  const day = new Date().toISOString().slice(0, 10);
  const week = `${new Date().getUTCFullYear()}-w${Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / (7 * 86400_000))}`;
  const { data: camps } = await admin.from("discovery_campaigns").select("id, workspace_id, frequency").eq("status", "active").in("frequency", ["daily", "weekly"]);
  for (const c of camps ?? []) {
    await admin.from("jobs").upsert({ workspace_id: c.workspace_id, type: "discovery_run", payload: { campaign_id: c.id }, idempotency_key: `discovery:${c.id}:${c.frequency === "daily" ? day : week}`, timeout_seconds: 600, max_attempts: 2 }, { onConflict: "workspace_id,type,idempotency_key", ignoreDuplicates: true });
  }
  const { data: wss } = await admin.from("workspaces").select("id");
  for (const w of wss ?? []) {
    await admin.from("jobs").upsert({ workspace_id: w.id, type: "followup_scan", idempotency_key: `followups:${day}` }, { onConflict: "workspace_id,type,idempotency_key", ignoreDuplicates: true });
    await admin.from("jobs").upsert({ workspace_id: w.id, type: "trigger_scan", idempotency_key: `triggers:${week}`, timeout_seconds: 600, max_attempts: 3 }, { onConflict: "workspace_id,type,idempotency_key", ignoreDuplicates: true });
  }
}

export async function tick(worker = "web") {
  await schedule().catch(() => undefined);
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc("claim_jobs", { p_worker: worker, p_limit: 5 });
  if (error) throw new Error(error.message);
  const results: Array<{ id: string; type: string; ok: boolean; error?: string }> = [];
  for (const j of (jobs ?? []) as Job[]) {
    const handler = HANDLERS[j.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${j.type}`);
      const result = await handler(j);
      await admin.rpc("finish_job", { p_job_id: j.id, p_ok: true, p_result: (result ?? {}) as object, p_error: null, p_cost: 0 });
      results.push({ id: j.id, type: j.type, ok: true });
    } catch (e) {
      const msg = redact((e as Error).message ?? String(e)).slice(0, 2000);
      await admin.rpc("finish_job", { p_job_id: j.id, p_ok: false, p_result: null, p_error: msg, p_cost: 0 });
      results.push({ id: j.id, type: j.type, ok: false, error: msg });
    }
  }
  return results;
}

async function runLinkedInLookup(j: Job) {
  const url = j.payload.linkedin_url as string;
  const userId = (j.payload.user_id as string | null) ?? "system";
  const data = await lookupLinkedInOrg(j.workspace_id, userId, url);
  const orgId = await createOrganisation(j.workspace_id, userId, {
    trading_name: data.trading_name,
    legal_name: data.legal_name,
    website: data.website,
    registration_number: data.registration_number,
    primary_market: data.primary_market ?? "UK",
    sector: data.sector,
    headquarters: data.headquarters,
    description: data.description,
    relationship_status: "prospect",
  });

  if (data.primary_market === "UK" && companiesHouseConfigured()) {
    try { await enrichFromCompaniesHouse(j.workspace_id, userId, orgId, data.registration_number || undefined); } catch { /* non-fatal */ }
  }
  try { await runQualification(j.workspace_id, userId, orgId); } catch { /* non-fatal */ }

  return { organisation_id: orgId, trading_name: data.trading_name };
}

async function runRediscovery(j: Job) {
  const admin = createAdminClient();
  const orgId = j.payload.organisation_id as string;
  const userId = (j.payload.user_id as string | null) ?? "system";
  const { data: org } = await admin.from("organisations").select("primary_market, registration_number, trading_name, website").eq("id", orgId).single();
  if (!org) throw new Error("Organisation not found");
  const results: string[] = [];

  if (org.primary_market === "UK" && companiesHouseConfigured()) {
    try {
      await enrichFromCompaniesHouse(j.workspace_id, userId, orgId, org.registration_number || undefined);
      results.push("Companies House: enriched");
    } catch (e) { results.push(`Companies House: ${(e as Error).message}`); }
  }

  try {
    await runQualification(j.workspace_id, userId, orgId);
    results.push("Qualification: re-scored");
  } catch (e) { results.push(`Qualification: ${(e as Error).message}`); }

  return { results };
}

async function runPeopleDiscovery(j: Job) {
  const admin = createAdminClient();
  const orgId = j.payload.organisation_id as string;
  const userId = j.payload.user_id as string;
  const { data: org } = await admin.from("organisations").select("trading_name, website, primary_market, sector, linkedin_url").eq("id", orgId).single();
  if (!org) throw new Error("Organisation not found");
  return discoverPeople(j.workspace_id, userId, { id: orgId, ...org });
}

/** Internal reminders only — never sends. A previous approval does not authorise a follow-up. */
async function followupScan(workspaceId: string) {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: drafts } = await admin.from("outreach_drafts").select("id, organisation_id, contact_id, conversation_id, suggested_follow_up_on, organisations(trading_name), contacts(full_name)")
    .eq("workspace_id", workspaceId).eq("status", "sent").lte("suggested_follow_up_on", today);
  let created = 0;
  for (const d of drafts ?? []) {
    const { data: conv } = await admin.from("conversations").select("last_inbound_at, status").eq("id", d.conversation_id!).maybeSingle();
    if (!conv || conv.last_inbound_at || ["opted_out", "do_not_contact", "bounced"].includes(conv.status)) continue;
    const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("draft_id", d.id).eq("kind", "follow_up");
    if (count) continue;
    const org = (d.organisations as unknown as { trading_name: string } | null)?.trading_name ?? "organisation";
    const who = (d.contacts as unknown as { full_name: string } | null)?.full_name ?? "contact";
    await admin.from("tasks").insert({ workspace_id: workspaceId, title: `Decide on a follow-up to ${who} (${org}) — no reply yet`, kind: "follow_up", due_at: new Date().toISOString(), organisation_id: d.organisation_id, contact_id: d.contact_id, conversation_id: d.conversation_id, draft_id: d.id, source: "system" });
    await admin.from("conversations").update({ status: "awaiting_response" }).eq("id", d.conversation_id!);
    created++;
  }
  return { created };
}
