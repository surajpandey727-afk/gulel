"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ExternalLink, GitMerge, Play, Plus, Settings2, X } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Modal, Slider } from "@/components/neo/controls";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Badge, StatusBadge } from "@/components/neo/badge";
import { EmptyState, Panel } from "@/components/neo/surface";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { splitList } from "@/lib/discovery/filters";
import { dismissSignalAction, promoteSignalAction, runCampaignAction, saveCampaignAction, saveIcpAction } from "./actions";

type Campaign = { id: string; name: string; market: "UK" | "IN" | "BOTH"; icp_id: string | null; sources: string[]; frequency: "manual" | "daily" | "weekly"; max_leads_per_run: number; max_spend_usd: number; min_score: number; status: "draft" | "active" | "paused"; last_run_at: string | null; config: Record<string, unknown> };
type Icp = { id: string; name: string; version_no: number; market: "UK" | "IN" | "BOTH"; min_score: number; definition: Record<string, string> };
type Signal = { id: string; source: string; candidate_name: string; candidate_domain: string | null; market: string | null; signal_type: string; strength: string; claim_text: string; uncertainty: string | null; source_url: string | null; published_at: string | null; match_hint: { decision: string; matchId: string; signals: { nameSim: number; domain: boolean; regno: boolean } } | null; organisation_id: string | null; discovery_campaigns: { name: string } | null; organisations: { trading_name: string } | null };
type Run = { id: string; status: string; per_source: Record<string, { status: string; found?: number; kept?: number; error?: string; dropped_uncited?: number }>; candidates_found: number; new_signals: number; cost_usd: number; started_at: string; discovery_campaigns: { name: string } | null };

const SOURCES: Array<{ key: string; label: string; note: string }> = [
  { key: "companies_house", label: "Companies House (UK registry)", note: "Filters by SIC code, incorporation date, location, name keyword." },
  { key: "ai_web_research", label: "AI web research (cited)", note: "Claude web search; candidates without a retrieved source URL are dropped." },
  { key: "manual_urls", label: "Manual URLs", note: "You add sources as evidence on dossiers." },
];
const AVAIL_LABEL: Record<string, string> = { configured: "ready", not_configured: "needs API key", requires_ai_provider: "uses Claude provider", manual: "manual" };
const TEMPLATES = [
  "UK: Founder-Led Brands Preparing to Scale", "India: FMCG Brands Entering New Categories", "UK: Businesses Seeking Commercial Advisory",
  "India: Portfolio Consolidation Opportunities", "UK: Brands Entering International Markets", "Cross-Market: India to UK Expansion",
];

export function DiscoveryCentre({ campaigns, icps, signals, runs, availability }: { campaigns: Campaign[]; icps: Icp[]; signals: Signal[]; runs: Run[]; availability: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null);
  const [icpEdit, setIcpEdit] = useState<Partial<Icp> | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? `✓ ${r.message ?? "Done."}` : `⚠ ${r.error}`); router.refresh(); });

  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className="rounded-neo neo-inset-sm px-4 py-2.5 text-sm">{msg}</p>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Campaigns" eyebrow="Named, persisted discovery searches" className="xl:col-span-2"
          actions={<Button size="sm" variant="primary" onClick={() => setEdit({ market: "UK", sources: ["companies_house"], frequency: "manual", max_leads_per_run: 25, max_spend_usd: 5, min_score: 60, status: "draft", config: {} })}><Plus className="h-4 w-4" /> New campaign</Button>}>
          {campaigns.length ? (
            <ul className="flex flex-col gap-3">{campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-neo neo-inset-sm p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-ink-3">{c.market === "BOTH" ? "UK + India" : c.market} · {c.sources.map((x) => SOURCES.find((s) => s.key === x)?.label.split(" (")[0]).join(", ")} · {c.frequency} · up to {c.max_leads_per_run} leads · ${Number(c.max_spend_usd).toFixed(2)} cap{c.last_run_at ? ` · last run ${new Date(c.last_run_at).toLocaleString("en-GB")}` : ""}</p>
                </div>
                <StatusBadge status={c.status === "active" ? "approved" : c.status === "paused" ? "snoozed" : "pending"} label={c.status} />
                <IconButton size="iconSm" label="Edit campaign" onClick={() => setEdit(c)}><Settings2 className="h-4 w-4" /></IconButton>
                <Button size="sm" loading={pending} onClick={() => start(async () => {
                  setMsg(null);
                  const r = await runCampaignAction(c.id);
                  if (!r.ok) setMsg(`⚠ ${r.error}`);
                  else setMsg(`Run ${r.data!.status}: ${r.data!.newSignals} new signal(s). ${Object.entries(r.data!.perSource).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.status}${v.error ? ` (${v.error})` : ""}`).join(" · ")}`);
                  router.refresh();
                })}><Play className="h-3.5 w-3.5" /> Run now</Button>
              </li>
            ))}</ul>
          ) : (
            <EmptyState title="No campaigns yet" body="Start from a template or build your own." action={
              <div className="flex flex-wrap justify-center gap-2">{TEMPLATES.slice(0, 3).map((t) => <Button key={t} size="sm" onClick={() => setEdit({ name: t, market: t.startsWith("India") ? "IN" : t.startsWith("Cross") ? "BOTH" : "UK", sources: t.startsWith("India") || t.startsWith("Cross") ? ["ai_web_research"] : ["companies_house", "ai_web_research"], frequency: "manual", max_leads_per_run: 25, max_spend_usd: 5, min_score: 60, status: "draft", config: {} })}>{t}</Button>)}</div>
            } />
          )}
        </Panel>

        <Panel title="Ideal client profiles" eyebrow="Versioned" actions={<IconButton size="iconSm" label="New ICP" onClick={() => setIcpEdit({ market: "UK", min_score: 70, definition: {} })}><Plus className="h-4 w-4" /></IconButton>}>
          {icps.length ? <ul className="flex flex-col gap-2">{icps.map((i) => (
            <li key={i.id}><button type="button" onClick={() => setIcpEdit(i)} className="w-full rounded-neo neo-inset-sm p-3 text-left">
              <p className="text-sm font-medium">{i.name} <span className="text-xs text-ink-3">v{i.version_no} · {i.market}</span></p>
              <p className="line-clamp-2 text-xs text-ink-3">{i.definition.strategic_problem || i.definition.industry || "—"}</p>
            </button></li>))}</ul> : <p className="text-sm text-ink-3">Define who you serve best: industry, stage, problem, triggers, decision-maker and exclusions.</p>}
          <div className="mt-4 border-t border-hairline/60 pt-3">
            <p className="eyebrow mb-2">Sources</p>
            <ul className="flex flex-col gap-1.5 text-xs">{SOURCES.map((s) => <li key={s.key} className="flex items-center justify-between gap-2"><span>{s.label}</span><Badge tone={availability[s.key] === "not_configured" ? "warning" : "neutral"} icon={false}>{AVAIL_LABEL[availability[s.key]]}</Badge></li>)}</ul>
            <p className="mt-2 text-[0.7rem] text-ink-3">India registry (MCA) needs a licensed vendor; tenders and ad libraries follow. No scraping of LinkedIn.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Signals to review" eyebrow={`${signals.length} new · strength and uncertainty shown — a signal is not proof of demand`}>
        {signals.length ? (
          <Table>
            <thead><tr><Th>Candidate</Th><Th>Signal</Th><Th>Strength</Th><Th>Source</Th><Th>Match</Th><Th /></tr></thead>
            <tbody>{signals.map((s) => (
              <Tr key={s.id}>
                <Td><span className="font-medium text-ink">{s.candidate_name}</span><span className="block text-xs text-ink-3">{s.candidate_domain ?? "no domain"} · {s.market ?? "?"} · {s.discovery_campaigns?.name}</span></Td>
                <Td className="max-w-md text-xs"><span className="text-ink-2">{s.claim_text}</span>{s.uncertainty && <span className="block text-ink-3">Uncertainty: {s.uncertainty}</span>}</Td>
                <Td><Badge tone={s.strength === "strong" ? "positive" : s.strength === "moderate" ? "neutral" : "muted"} icon={false}>{s.strength}</Badge></Td>
                <Td className="text-xs">{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">{s.source.replace(/_/g, " ")}<ExternalLink className="h-3 w-3" /></a> : s.source}{s.published_at && <span className="block text-ink-3">{new Date(s.published_at).toLocaleDateString("en-GB")}</span>}</Td>
                <Td className="text-xs">{s.organisation_id ? <span>Same as <strong>{s.organisations?.trading_name}</strong></span> : s.match_hint?.decision === "propose" ? <span className="text-warning">Possible match ({Math.round(s.match_hint.signals.nameSim * 100)}% name)</span> : <span className="text-ink-3">new</span>}</Td>
                <Td>
                  <span className="flex gap-1.5">
                    {s.match_hint?.decision === "propose" && !s.organisation_id
                      ? <><IconButton size="iconSm" label="Merge into the suggested organisation" onClick={() => run(() => promoteSignalAction(s.id, "merge"))}><GitMerge className="h-3.5 w-3.5" /></IconButton><IconButton size="iconSm" label="Create as a new organisation" variant="primary" onClick={() => run(() => promoteSignalAction(s.id, "new"))}><Plus className="h-3.5 w-3.5" /></IconButton></>
                      : <IconButton size="iconSm" variant="primary" label={s.organisation_id ? "Attach to existing organisation" : "Promote to organisation"} onClick={() => run(() => promoteSignalAction(s.id, "auto"))}><Check className="h-3.5 w-3.5" /></IconButton>}
                    <IconButton size="iconSm" label="Dismiss" onClick={() => run(() => dismissSignalAction(s.id))}><X className="h-3.5 w-3.5" /></IconButton>
                  </span>
                </Td>
              </Tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState title="No signals waiting" body="Run a campaign. Promoted signals become organisations with the signal saved as sourced evidence." />}
      </Panel>

      <Panel title="Run history" eyebrow="Per-source outcome — failures are never shown as success">
        {runs.length ? <ul className="flex flex-col gap-2 text-xs">{runs.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-neo neo-inset-sm px-3 py-2">
            <StatusBadge status={r.status === "succeeded" ? "approved" : r.status === "partial" ? "pending" : "failed"} label={r.status} />
            <span className="font-medium">{r.discovery_campaigns?.name}</span>
            <span className="text-ink-3">{new Date(r.started_at).toLocaleString("en-GB")} · found {r.candidates_found} · new {r.new_signals} · ${Number(r.cost_usd).toFixed(3)}</span>
            <span className="w-full text-ink-3">{Object.entries(r.per_source).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.status}${v.found != null ? ` (${v.kept ?? 0}/${v.found} kept${v.dropped_uncited ? `, ${v.dropped_uncited} uncited dropped` : ""})` : ""}${v.error ? ` — ${v.error}` : ""}`).join(" · ")}</span>
          </li>))}</ul> : <p className="text-sm text-ink-3">No runs yet.</p>}
      </Panel>

      {edit && <CampaignModal initial={edit} icps={icps} availability={availability} onClose={() => setEdit(null)} onSaved={(m) => { setMsg(m); setEdit(null); router.refresh(); }} />}
      {icpEdit && <IcpModal initial={icpEdit} onClose={() => setIcpEdit(null)} onSaved={(m) => { setMsg(m); setIcpEdit(null); router.refresh(); }} />}
      <p className="text-xs text-ink-3">Templates: {TEMPLATES.join(" · ")}. <Link href="/settings/providers" className="underline-offset-2 hover:underline">Discovery AI budget</Link> caps monthly spend; each campaign also caps per-run spend.</p>
    </div>
  );
}

function CampaignModal({ initial, icps, availability, onClose, onSaved }: { initial: Partial<Campaign>; icps: Icp[]; availability: Record<string, string>; onClose: () => void; onSaved: (m: string) => void }) {
  const cfg = (initial.config ?? {}) as Record<string, string[] | string | undefined>;
  const j = (k: string) => (Array.isArray(cfg[k]) ? (cfg[k] as string[]).join(", ") : (cfg[k] as string) ?? "");
  const [market, setMarket] = useState(initial.market ?? "UK");
  const [freq, setFreq] = useState(initial.frequency ?? "manual");
  const [status, setStatus] = useState(initial.status ?? "draft");
  const [sources, setSources] = useState<string[]>(initial.sources ?? []);
  const [leads, setLeads] = useState(initial.max_leads_per_run ?? 25);
  const [spend, setSpend] = useState(Number(initial.max_spend_usd ?? 5));
  const [minScore, setMinScore] = useState(initial.min_score ?? 60);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} wide title={initial.id ? "Edit campaign" : "New discovery campaign"} description="Exclusions are enforced deterministically after every source."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="camp-form" loading={pending}>Save</Button></>}>
      <form id="camp-form" className="grid gap-4 sm:grid-cols-2" action={(fd) => start(async () => {
        setErr(null);
        const r = await saveCampaignAction({
          id: initial.id, name: String(fd.get("name") ?? ""), market, icp_id: String(fd.get("icp") ?? "") || null, sources: sources as never, frequency: freq,
          max_leads_per_run: leads, max_spend_usd: spend, min_score: minScore, status,
          config: {
            industries: splitList(String(fd.get("industries") ?? "")), keywords: splitList(String(fd.get("keywords") ?? "")), excluded_keywords: splitList(String(fd.get("excluded_keywords") ?? "")),
            excluded_industries: splitList(String(fd.get("excluded_industries") ?? "")), sic_codes: splitList(String(fd.get("sic_codes") ?? "")), negative_fit: String(fd.get("negative_fit") ?? ""),
            incorporated_from: String(fd.get("incorporated_from") ?? "") || undefined, location: String(fd.get("location") ?? "") || undefined,
            company_size: String(fd.get("company_size") ?? "") || undefined, revenue_band: String(fd.get("revenue_band") ?? "") || undefined, services: splitList(String(fd.get("services") ?? "")),
          },
        });
        if (!r.ok) return setErr(r.error);
        onSaved("✓ Campaign saved.");
      })}>
        <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={initial.name ?? ""} required /></Field>
        <Field label="Market"><Segmented label="Market" value={market} onChange={setMarket} options={[{ value: "UK", label: "UK" }, { value: "IN", label: "India" }, { value: "BOTH", label: "Both" }]} /></Field>
        <Field label="Ideal client profile"><Select name="icp" defaultValue={initial.icp_id ?? ""}><option value="">None</option>{icps.map((i) => <option key={i.id} value={i.id}>{i.name} v{i.version_no}</option>)}</Select></Field>
        <Field label="Industries" hint="Comma-separated"><Input name="industries" defaultValue={j("industries")} placeholder="FMCG, beverages, D2C apparel" /></Field>
        <Field label="Signals / keywords"><Input name="keywords" defaultValue={j("keywords")} placeholder="Series A, new category, rebrand, UK launch" /></Field>
        <Field label="Excluded keywords"><Input name="excluded_keywords" defaultValue={j("excluded_keywords")} placeholder="agency, recruiter" /></Field>
        <Field label="Excluded industries"><Input name="excluded_industries" defaultValue={j("excluded_industries")} placeholder="gambling, tobacco" /></Field>
        <Field label="Company size"><Input name="company_size" defaultValue={j("company_size")} placeholder="20–500 employees" /></Field>
        <Field label="Revenue / funding band"><Input name="revenue_band" defaultValue={j("revenue_band")} placeholder="£5m–£100m or ₹50–500 cr" /></Field>
        <Field label="Nishaan-a services" hint="Comma-separated"><Input name="services" defaultValue={j("services")} placeholder="GTM, brand architecture" /></Field>
        <Field label="Negative-fit criteria"><Input name="negative_fit" defaultValue={j("negative_fit")} placeholder="Pure execution briefs, sub-£1m revenue" /></Field>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-xs font-medium text-ink-2">Sources</legend>
          {SOURCES.map((s) => (
            <label key={s.key} className="flex items-start gap-3 rounded-neo neo-inset-sm p-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[var(--brand-oxblood)]" checked={sources.includes(s.key)} onChange={(e) => setSources((x) => e.target.checked ? [...x, s.key] : x.filter((y) => y !== s.key))} />
              <span className="flex-1"><span className="font-medium">{s.label}</span> <Badge icon={false} tone={availability[s.key] === "not_configured" ? "warning" : "neutral"}>{AVAIL_LABEL[availability[s.key]]}</Badge><span className="block text-xs text-ink-3">{s.note}</span></span>
            </label>
          ))}
        </fieldset>
        {sources.includes("companies_house") && (<>
          <Field label="SIC codes (Companies House)" hint="e.g. 10890, 11070, 47910"><Input name="sic_codes" defaultValue={j("sic_codes")} /></Field>
          <Field label="Incorporated from"><Input name="incorporated_from" type="date" defaultValue={j("incorporated_from")} /></Field>
          <Field label="Location" className="sm:col-span-2"><Input name="location" defaultValue={j("location")} placeholder="Manchester" /></Field>
        </>)}
        <div className="sm:col-span-2 grid gap-5 sm:grid-cols-3">
          <Slider label="Max leads per run" value={leads} min={5} max={100} step={5} onValueChange={setLeads} />
          <Slider label="Max AI spend per run" value={spend} min={0} max={50} step={0.5} onValueChange={setSpend} format={(v) => `$${v.toFixed(2)}`} />
          <Slider label="Minimum qualification score" value={minScore} min={40} max={95} onValueChange={setMinScore} />
        </div>
        <Field label="Frequency"><Segmented label="Frequency" value={freq} onChange={setFreq} options={[{ value: "manual", label: "Manual" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} /></Field>
        <Field label="Status" hint="Scheduled runs only happen when active"><Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} /></Field>
        {err && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {err}</p>}
      </form>
    </Modal>
  );
}

function IcpModal({ initial, onClose, onSaved }: { initial: Partial<Icp>; onClose: () => void; onSaved: (m: string) => void }) {
  const d = initial.definition ?? {};
  const [market, setMarket] = useState(initial.market ?? "UK");
  const [min, setMin] = useState(initial.min_score ?? 70);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fields: Array<[string, string, string]> = [
    ["industry", "Industry", "Premium FMCG, D2C"], ["location", "Location", "UK cities / Indian metros"], ["size", "Revenue / business size", "£5–50m"],
    ["growth_stage", "Growth stage", "Post-Series A, scaling"], ["strategic_problem", "Strategic problem", "Portfolio sprawl after rapid launches"],
    ["triggers", "Trigger conditions", "New category, funding, new market"], ["decision_maker", "Typical decision-maker", "Founder, CMO, CCO"],
    ["exclusions", "Exclusion criteria", "Agencies, sub-£1m"], ["service", "Relevant Nishaan-a service", "Brand architecture & portfolio consolidation"],
  ];
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} wide title={initial.id ? `Edit ICP (creates v${(initial.version_no ?? 1) + 1})` : "New ideal client profile"}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="icp-form" loading={pending}>Save</Button></>}>
      <form id="icp-form" className="grid gap-4 sm:grid-cols-2" action={(fd) => start(async () => {
        setErr(null);
        const r = await saveIcpAction({ name: String(fd.get("name") ?? ""), market, min_score: min, definition: Object.fromEntries(fields.map(([k]) => [k, String(fd.get(k) ?? "")])) as never }, initial.id);
        if (!r.ok) return setErr(r.error);
        onSaved(`✓ ${r.message}`);
      })}>
        <Field label="Name"><Input name="name" defaultValue={initial.name ?? ""} required /></Field>
        <Field label="Market"><Segmented label="ICP market" value={market} onChange={setMarket} options={[{ value: "UK", label: "UK" }, { value: "IN", label: "India" }, { value: "BOTH", label: "Both" }]} /></Field>
        {fields.map(([k, l, ph]) => <Field key={k} label={l} className={k === "strategic_problem" || k === "triggers" ? "sm:col-span-2" : undefined}>{k === "strategic_problem" || k === "triggers" ? <Textarea name={k} defaultValue={d[k] ?? ""} placeholder={ph} className="min-h-16" /> : <Input name={k} defaultValue={d[k] ?? ""} placeholder={ph} />}</Field>)}
        <div className="sm:col-span-2"><Slider label="Minimum qualification threshold" value={min} min={40} max={95} onValueChange={setMin} /></div>
        {err && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {err}</p>}
      </form>
    </Modal>
  );
}
