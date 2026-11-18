import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";
import { normaliseUrlForCompare } from "@/lib/discovery/filters";
import { normaliseUrl } from "@/lib/import/normalise";
import { richToText } from "@/lib/notes/rich";
import { CLAIM_FIELDS } from "@/lib/orgs/constants";

/**
 * Research one dossier section on its own (Financials, Brand, Commercial or Signals) without re-running qualification.
 * Order of work: the organisation's notes, documents, earlier research and repository record first; the web only for what
 * those don't cover. Results are added as cited evidence (never overwriting what is already on file), and every attempt
 * is logged with a plain-language outcome.
 */
export type Section = "financials" | "brand" | "commercial" | "signals";
export const SECTIONS: Section[] = ["financials", "brand", "commercial", "signals"];

const FIN_METRICS = ["revenue", "revenue_growth_pct", "operating_profit", "net_profit", "total_assets", "net_assets", "cash", "total_debt", "equity_raised", "funding_round", "capex_plan"] as const;

export const SECTION_META: Record<Section, { label: string; noun: [string, string]; prefix: string[]; brief: string }> = {
  financials: {
    label: "Financials", noun: ["financial indicator", "financial indicators"], prefix: ["financials."],
    brief: "Reported or filed financials: revenue, revenue growth %, operating profit, net profit, total/net assets, cash, debt, equity raised, funding rounds, capex plans. Give each figure its period end and currency. Mark estimates (e.g. Tracxn, Zauba, press estimates) as third_party_estimate.",
  },
  brand: {
    label: "Brand", noun: ["brand observation", "brand observations"], prefix: ["brand."],
    brief: "Brand positioning (how the company describes itself, its promise and audience), brand architecture / portfolio (sub-brands, product brands, house-of-brands vs branded house), and any prior branding agency or consultancy it has worked with.",
  },
  commercial: {
    label: "Commercial", noun: ["commercial observation", "commercial observations"], prefix: ["commercial."],
    brief: "Commercial model: channels and distribution (D2C, retail, marketplaces, B2B, export), customers and segments served, pricing and proposition, and competitive intensity (named competitors, category crowding).",
  },
  signals: {
    label: "Signals", noun: ["signal", "signals"], prefix: ["signal."],
    brief: "Recent buying signals (prefer the last 18 months): new funding, expansion or market entry, product or category launches, leadership changes, rebrands or repositioning, consolidation / M&A, brand or commercial hiring, RFPs. Each signal is evidence of change, not proof of demand; say what it does not prove.",
  },
};

const FIELDS: Record<Section, string[]> = {
  financials: FIN_METRICS.map((m) => `financials.${m}`),
  brand: ["brand.positioning", "brand.architecture", "brand.prior_agency"],
  commercial: ["commercial.channels", "commercial.customers", "commercial.pricing", "commercial.competition"],
  signals: ["signal.funding", "signal.expansion", "signal.launch", "signal.leadership_change", "signal.rebrand", "signal.consolidation", "signal.hiring", "signal.rfp"],
};

const ItemSchema = z.object({
  field: z.string(),
  claim: z.string().describe("One factual sentence. For figures include the amount, currency and period."),
  fact_type: z.enum(["reported_fact", "dated_filing", "third_party_estimate", "inference"]).catch("inference"),
  value_numeric: z.number().nullable().catch(null),
  value_currency: z.enum(["GBP", "INR", "USD"]).nullable().catch(null),
  period_end: z.string().nullable().catch(null).describe("YYYY-MM-DD for financial figures"),
  source_kind: z.enum(["internal", "web"]).catch("web"),
  internal_ref: z.string().nullable().catch(null).describe("For internal sources: the [ref] tag of the note/document/record used"),
  source_name: z.string().catch(""),
  source_url: z.string().nullable().catch(null),
  published_date: z.string().nullable().catch(null),
  excerpt: z.string().nullable().catch(null).describe("Short supporting quote from the source, under 240 characters"),
  confidence: z.number().min(0).max(1).catch(0.6),
});
const ResultSchema = z.object({
  items: z.array(ItemSchema).catch([]),
  searched_web: z.boolean().catch(false),
  summary: z.string().catch(""),
  unavailable_reason: z.string().nullable().catch(null).describe("When nothing verifiable was found: why (e.g. private company with no public filings)."),
});

export interface RunRow {
  id: string; section: Section; status: "running" | "populated" | "partial" | "nothing_new" | "not_found" | "failed";
  found: number; added: number; duplicates: number; from_internal: number; from_web: number; message: string | null; error: string | null;
  started_at: string; finished_at: string | null; sources_checked: Record<string, number>;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
const dateOk = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

/** Gather what gulel already knows, each piece tagged [ref] so a finding can cite it. */
async function internalContext(workspaceId: string, orgId: string, section: Section) {
  const db = createAdminClient();
  const [{ data: org }, { data: notes }, { data: files }, { data: evidence }, { data: news }, { data: fin }, { data: runs }] = await Promise.all([
    db.from("organisations").select("trading_name, legal_name, website, primary_market, sector, sub_sector, headquarters, description, cr_key, registration_number").eq("id", orgId).eq("workspace_id", workspaceId).single(),
    db.from("notes").select("id, body, created_at").eq("workspace_id", workspaceId).eq("organisation_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(40),
    db.from("organisation_files").select("id, name, notes, tags, created_at").eq("workspace_id", workspaceId).eq("organisation_id", orgId).is("deleted_at", null).limit(40),
    db.from("evidence_items").select("id, claim_field, claim_text, source_name, source_url, retrieved_at, value_numeric, value_currency, value_as_of").eq("workspace_id", workspaceId).eq("organisation_id", orgId).eq("status", "active").order("retrieved_at", { ascending: false }).limit(150),
    db.from("organisation_news").select("id, headline, publisher, published_at, summary, url").eq("workspace_id", workspaceId).eq("organisation_id", orgId).order("published_at", { ascending: false }).limit(15),
    db.from("organisation_financials").select("metric, period_end, amount, currency").eq("workspace_id", workspaceId).eq("organisation_id", orgId),
    db.from("organisation_research_runs").select("section, status, message, started_at").eq("workspace_id", workspaceId).eq("organisation_id", orgId).neq("status", "running").order("started_at", { ascending: false }).limit(8),
  ]);
  if (!org) throw new Error("Organisation not found.");
  let repo: { sheet: string; row_key: string | null; data: Record<string, unknown> }[] = [];
  if (org.cr_key) {
    const { data } = await db.from("cr_rows").select("sheet, row_key, data").eq("workspace_id", workspaceId).or(`and(sheet.eq.Organisations,row_key.eq.${org.cr_key}),data->>org_id.eq.${org.cr_key}`).is("deleted_at", null).limit(20);
    repo = (data ?? []) as typeof repo;
  }

  const refs = new Map<string, { name: string; at: string | null }>();
  const lines: string[] = [];
  const add = (ref: string, name: string, at: string | null, text: string) => { refs.set(ref, { name, at }); lines.push(`[${ref}] ${text}`); };
  (notes ?? []).forEach((n, i) => add(`note:${i + 1}`, "gulel note", n.created_at, `Note (${n.created_at.slice(0, 10)}): ${clip(richToText(n.body), 1500)}`));
  (files ?? []).forEach((f, i) => add(`doc:${i + 1}`, `Document “${f.name}”`, f.created_at, `Document “${f.name}”${(f.tags as string[] | null)?.length ? ` [${(f.tags as string[]).join(", ")}]` : ""}${f.notes ? `: ${clip(richToText(f.notes), 800)}` : ""}`));
  (news ?? []).forEach((n, i) => add(`news:${i + 1}`, n.publisher ?? "News", n.published_at, `News ${n.published_at ?? ""} ${n.publisher ?? ""}: ${n.headline}${n.summary ? ` — ${clip(n.summary, 400)}` : ""}`));
  repo.forEach((r, i) => {
    const d = Object.entries(r.data ?? {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}=${clip(String(v), 300)}`).join("; ");
    if (d) add(`repo:${i + 1}`, `Central Repository ${r.sheet.replace(/_/g, " ")} ${r.row_key ?? ""}`, null, `Repository ${r.sheet} ${r.row_key ?? ""}: ${clip(d, 1200)}`);
  });
  const own = (evidence ?? []).filter((e) => !SECTION_META[section].prefix.some((p) => e.claim_field.startsWith(p)));
  own.slice(0, 40).forEach((e, i) => add(`research:${i + 1}`, e.source_name, e.retrieved_at, `Earlier research (${e.claim_field}, ${e.source_name}): ${clip(e.claim_text, 300)}`));

  const existing = (evidence ?? []).filter((e) => SECTION_META[section].prefix.some((p) => e.claim_field.startsWith(p)));
  const profile = [
    `Organisation: ${org.trading_name}${org.legal_name && org.legal_name !== org.trading_name ? ` (legal name ${org.legal_name})` : ""}`,
    org.website ? `Website: ${org.website}` : "", `Market: ${org.primary_market === "IN" ? "India" : "United Kingdom"}`,
    org.sector ? `Sector: ${org.sector}${org.sub_sector ? ` / ${org.sub_sector}` : ""}` : "", org.headquarters ? `HQ: ${org.headquarters}` : "",
    org.registration_number ? `Registration: ${org.registration_number}` : "", org.description ? `Description: ${clip(org.description, 600)}` : "",
  ].filter(Boolean).join("\n");
  const counts = { notes: notes?.length ?? 0, documents: files?.length ?? 0, earlier_research: own.length, news: news?.length ?? 0, repository_rows: repo.length, already_on_file: existing.length };
  return { org, profile, lines, refs, existing, financials: fin ?? [], previousRuns: (runs ?? []).filter((r) => r.section === section), counts };
}

function system(section: Section) {
  const m = SECTION_META[section];
  return `You are Research AI for Nishaan-a OS, researching ONE section of a company dossier: ${m.label}. ${NISHAANA_CONTEXT}
What to find: ${m.brief}
Allowed "field" values (use exactly): ${FIELDS[section].join(", ")}.
Method:
1. Read the INTERNAL SOURCES first (notes, documents, earlier research, repository record). Anything they establish for this section becomes an item with source_kind "internal" and internal_ref set to the source's [ref] tag (without brackets).
2. Only if internal sources leave this section thin, use web search for what is missing. Web items use source_kind "web" and the exact URL you retrieved in source_url.
3. Do NOT repeat anything listed under ALREADY ON FILE, and do not restate the same fact twice.
Rules:
- Never invent figures, dates, names or URLs. If unsure, leave it out. Prefer filings, annual reports and reputable independent reporting.
- fact_type: reported_fact (company or independent report states it), dated_filing (statutory filing), third_party_estimate (data aggregators, estimates), inference (your reasoned reading of evidence; say so in the claim).
- Financial items need value_numeric in whole currency units (not lakhs/crores; convert), value_currency and period_end when known.
- Stay strictly within this section; ignore material for other sections.
- If you find nothing verifiable, return no items and set unavailable_reason to the specific reason.
Finish with ONLY a JSON object: {"items":[...],"searched_web":true|false,"summary":"one sentence","unavailable_reason":null|"..."}.
${UNTRUSTED_DATA_RULE}`;
}

const pl = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

export async function researchSection(workspaceId: string, userId: string | null, orgId: string, section: Section): Promise<RunRow> {
  if (!SECTIONS.includes(section)) throw new Error("Unknown section.");
  const db = createAdminClient();
  // One attempt at a time per section; an attempt older than 6 minutes is treated as interrupted.
  const { data: busy } = await db.from("organisation_research_runs").select("id, started_at").eq("organisation_id", orgId).eq("section", section).eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (busy && Date.now() - Date.parse(busy.started_at) < 6 * 60_000) throw new Error(`${SECTION_META[section].label} research is already running for this organisation.`);
  if (busy) await db.from("organisation_research_runs").update({ status: "failed", error: "Interrupted", message: "Research unsuccessful: the previous attempt was interrupted.", finished_at: new Date().toISOString() }).eq("id", busy.id);

  const { data: run, error: re } = await db.from("organisation_research_runs").insert({ workspace_id: workspaceId, organisation_id: orgId, section, created_by: userId }).select("id").single();
  if (re) throw new Error(re.message);
  const meta = SECTION_META[section];
  const finish = async (patch: Partial<RunRow> & { agent_execution_id?: string | null; cost_usd?: number | null }) => {
    const { data } = await db.from("organisation_research_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", run.id)
      .select("id, section, status, found, added, duplicates, from_internal, from_web, message, error, started_at, finished_at, sources_checked").single();
    return data as RunRow;
  };

  let ctx: Awaited<ReturnType<typeof internalContext>>;
  try { ctx = await internalContext(workspaceId, orgId, section); } catch (e) { return finish({ status: "failed", error: (e as Error).message, message: `Research unsuccessful: ${(e as Error).message}` }); }

  const onFile = ctx.existing.map((e) => `- ${e.claim_field}: ${clip(e.claim_text, 200)}${e.value_numeric != null ? ` (${e.value_numeric} ${e.value_currency ?? ""} ${e.value_as_of ?? ""})` : ""}`);
  const input = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    ctx.profile,
    ctx.previousRuns.length ? `Earlier attempts for this section: ${ctx.previousRuns.map((r) => `${r.started_at.slice(0, 10)}: ${r.message ?? r.status}`).join(" | ")}` : "",
    `ALREADY ON FILE for ${meta.label} (${onFile.length}):\n${onFile.join("\n") || "- nothing yet"}`,
    `<untrusted_evidence>\nINTERNAL SOURCES (${ctx.lines.length}):\n${ctx.lines.join("\n") || "- none"}\n</untrusted_evidence>`,
  ].filter(Boolean).join("\n\n");

  let res: Awaited<ReturnType<typeof runStructured<typeof ResultSchema>>>;
  try {
    res = await runStructured({ workspaceId, agent: "taftish", system: system(section), schema: ResultSchema, userId, maxTokens: 8000, webSearch: { maxUses: 4 }, entity: { type: "organisation", id: orgId }, input });
  } catch (e) {
    const msg = (e as Error).message || "the research service did not respond";
    return finish({ status: "failed", error: msg, sources_checked: ctx.counts, message: `Research unsuccessful: ${/budget/i.test(msg) ? "the monthly research budget is used up" : /timeout|timed out/i.test(msg) ? "the research service timed out" : "source unavailable"}.` });
  }

  // Verify every item: allowed field, a real internal reference or a URL the search actually returned, and not a duplicate.
  const seen = new Set(res.searchedUrls.map(normaliseUrlForCompare));
  const existingText = new Set(ctx.existing.map((e) => norm(e.claim_text)));
  const existingFin = new Set(ctx.financials.map((f) => `${f.metric}|${f.period_end ?? ""}`));
  let duplicates = 0, dropped = 0, fromInternal = 0, fromWeb = 0, added = 0;
  const batch = new Set<string>();
  for (const it of res.data.items) {
    if (!FIELDS[section].includes(it.field)) { dropped++; continue; }
    let sourceName = it.source_name || "Web source", sourceUrl: string | null = null, published: string | null = dateOk(it.published_date);
    if (it.source_kind === "internal") {
      const ref = it.internal_ref ? ctx.refs.get(it.internal_ref.replace(/^\[|\]$/g, "")) : undefined;
      if (!ref) { dropped++; continue; }
      sourceName = ref.name; published = published ?? (ref.at ? ref.at.slice(0, 10) : null);
    } else {
      if (!it.source_url || !seen.has(normaliseUrlForCompare(it.source_url))) { dropped++; continue; }
      sourceUrl = normaliseUrl(it.source_url) ?? it.source_url;
    }
    const key = norm(it.claim);
    const metric = section === "financials" ? it.field.split(".")[1] : null;
    const period = dateOk(it.period_end);
    if (!key || existingText.has(key) || batch.has(key) || (metric && it.value_numeric != null && period && existingFin.has(`${metric}|${period}`))) { duplicates++; continue; }
    batch.add(key);
    const { data: ev, error } = await db.from("evidence_items").insert({
      workspace_id: workspaceId, organisation_id: orgId, claim_field: it.field, claim_text: clip(it.claim.trim(), 1000), fact_type: it.fact_type,
      value_numeric: section === "financials" ? it.value_numeric : null, value_currency: section === "financials" ? it.value_currency : null, value_as_of: section === "financials" ? period : null,
      source_name: clip(sourceName, 200), source_url: sourceUrl, published_at: published, excerpt: it.excerpt ? clip(it.excerpt, 400) : null,
      confidence: Math.round(Math.min(1, Math.max(0.05, it.confidence)) * 100) / 100, created_by_type: "agent", agent_execution_id: res.executionId === "cached" ? null : res.executionId,
      licence_notes: it.source_kind === "internal" ? "From gulel's own notes / records" : null,
    }).select("id").single();
    if (error || !ev) { dropped++; continue; }
    if (metric && it.value_numeric != null && (FIN_METRICS as readonly string[]).includes(metric)) {
      await db.from("organisation_financials").insert({ workspace_id: workspaceId, organisation_id: orgId, market: ctx.org.primary_market ?? "UK", metric, amount: it.value_numeric, currency: it.value_currency, period_end: period, fact_type: it.fact_type, evidence_id: ev.id });
      if (period) existingFin.add(`${metric}|${period}`);
    }
    added++;
    if (it.source_kind === "internal") fromInternal++; else fromWeb++;
  }

  const found = res.data.items.length;
  const where = [fromInternal ? `${fromInternal} from your notes and records` : "", fromWeb ? `${fromWeb} from the web` : ""].filter(Boolean).join(", ");
  const reviewed = ctx.lines.length ? "Existing notes and records reviewed" : "No notes or records on file";
  let status: RunRow["status"], message: string;
  if (added && (dropped || duplicates)) { status = "partial"; message = `${pl(added, meta.noun)} retrieved and populated (${where}); ${duplicates ? `${duplicates} already on file` : ""}${duplicates && dropped ? ", " : ""}${dropped ? `${dropped} left out as unverified` : ""}.`; }
  else if (added) { status = "populated"; message = `${pl(added, meta.noun)} retrieved and populated (${where}).`; }
  else if (duplicates) { status = "nothing_new"; message = `${reviewed}${res.data.searched_web ? " and the web searched" : ""}; everything found (${duplicates}) is already on file.`; }
  else if (dropped) { status = "not_found"; message = `No verified ${meta.label.toLowerCase()} information found: ${dropped} possible item${dropped > 1 ? "s were" : " was"} left out because the source couldn't be verified.`; }
  else {
    status = "not_found";
    const why = res.data.unavailable_reason?.trim();
    message = res.data.searched_web || !ctx.lines.length
      ? `No verified ${meta.label.toLowerCase()} information found in available sources${why ? `: ${clip(why.replace(/\.$/, ""), 160)}` : ""}.`
      : `${reviewed}; no additional ${meta.label.toLowerCase()} information identified.`;
  }
  return finish({ status, found, added, duplicates, from_internal: fromInternal, from_web: fromWeb, message, sources_checked: { ...ctx.counts, web_searches: res.searchedUrls.length ? 1 : 0, web_results: res.searchedUrls.length }, agent_execution_id: res.executionId === "cached" ? null : res.executionId, cost_usd: res.costUsd });
}

/** Latest finished-or-running attempt per section, for the status lines. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function latestRuns(db: SupabaseClient<any>, workspaceId: string, orgId: string): Promise<Partial<Record<Section, RunRow>>> {
  const { data } = await db.from("organisation_research_runs").select("id, section, status, found, added, duplicates, from_internal, from_web, message, error, started_at, finished_at, sources_checked")
    .eq("workspace_id", workspaceId).eq("organisation_id", orgId).order("started_at", { ascending: false }).limit(40);
  const out: Partial<Record<Section, RunRow>> = {};
  for (const r of (data ?? []) as RunRow[]) if (!out[r.section]) out[r.section] = r;
  return out;
}

export const sectionFieldLabel = (f: string) => CLAIM_FIELDS.find((c) => c.value === f)?.label ?? f;
