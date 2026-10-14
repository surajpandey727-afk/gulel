import Link from "next/link";
import { ArrowRight, Radio, Stamp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { money, pct, relTime, resolveFilters, type SearchParams } from "@/lib/filters";
import type { KpiSummary } from "@/lib/metrics";
import { BAND_LABEL } from "@/lib/scoring/model";
import { REPLY_LABEL } from "@/lib/ai/agents/classifier";
import { PageHeader, Panel, EmptyState } from "@/components/neo/surface";
import { ButtonLink } from "@/components/neo/button";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { GlobalFilters } from "@/components/shell/filters";
import { Kpi } from "@/components/overview/kpi";
import { Funnel } from "@/components/overview/funnel";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const f = await resolveFilters(searchParams);
  const session = await getSession();
  const supabase = await createClient();
  const ws = session.workspaceId;
  const args = { p_workspace_id: ws, p_from: f.from.toISOString(), p_to: f.to.toISOString(), p_market: f.market ?? undefined, p_include_demo: f.includeDemo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgFilter = <T,>(q: T): T => (f.market ? (q as any).eq("organisations.primary_market", f.market) : q);

  const [kpiRes, funnelRes, best, approvals, replies, followups, signals] = await Promise.all([
    supabase.rpc("kpi_summary", args),
    supabase.rpc("funnel_summary", args),
    orgFilter(supabase.from("lead_qualifications").select("organisation_id, score, override_score, band, coverage, explanation, organisations!inner(trading_name, primary_market, sector, is_demo)").eq("workspace_id", ws).eq("is_current", true)).order("score", { ascending: false }).limit(6),
    supabase.from("approval_requests").select("id, channel, recipient_value, subject, created_at, outreach_drafts!inner(organisation_id, organisations!inner(trading_name, primary_market))").eq("workspace_id", ws).eq("status", "pending").order("created_at").limit(5),
    supabase.from("conversations").select("id, status, latest_classification, last_inbound_at, needs_review, organisations(trading_name, primary_market), contacts(full_name)").eq("workspace_id", ws).not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: false }).limit(5),
    supabase.from("tasks").select("id, title, due_at, organisations(trading_name)").eq("workspace_id", ws).eq("status", "open").lte("due_at", new Date(Date.now() + 2 * 86400_000).toISOString()).order("due_at").limit(5),
    orgFilter(supabase.from("evidence_items").select("id, claim_text, source_name, source_url, published_at, retrieved_at, organisation_id, organisations!inner(trading_name, primary_market)").eq("workspace_id", ws).eq("status", "active").like("claim_field", "signal.%")).order("retrieved_at", { ascending: false }).limit(5),
  ]);
  const k = (kpiRes.data ?? {}) as KpiSummary;
  const funnel = (funnelRes.data ?? []) as Array<{ stage: string; count: number }>;
  const currencies = f.market === "UK" ? (["GBP"] as const) : f.market === "IN" ? (["INR"] as const) : (["GBP", "INR"] as const);
  const valueLine = (o: Partial<Record<"GBP" | "INR", number>> | undefined) => currencies.map((c) => money(o?.[c] ?? 0, c)).join(" · ");
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-GB");

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${f.rangeLabel} · ${f.market ?? "UK & India"} · cohort: records created in range`}
        actions={
          <>
            <GlobalFilters />
            <ButtonLink href="/qualification?band=priority_review" variant="primary">Review priority opportunities <ArrowRight className="h-4 w-4" /></ButtonLink>
          </>
        }
      />

      <section aria-label="Executive KPIs" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
        <Kpi k="awaiting_approval" value={n(k.awaiting_approval)} sub="decisions waiting on you" emphasis={(k.awaiting_approval ?? 0) > 0} />
        <Kpi k="qualified_leads" value={n(k.qualified_leads)} sub={`score ≥ ${k.qualified_threshold ?? 70}`} />
        <Kpi k="organisations_discovered" value={n(k.organisations_discovered)} />
        <Kpi k="unique_people_reached" value={n(k.unique_people_reached)} sub={`${n(k.messages_sent_confirmed)} Gmail · ${n(k.linkedin_manual_confirmed)} LinkedIn (manual)`} />
        <Kpi k="reply_rate" value={pct(k.reply_rate)} sub={`${n(k.people_responded)} of ${n(k.unique_people_reached)} people`} />
        <Kpi k="positive_reply_rate" value={pct(k.positive_reply_rate)} sub={`${n(k.positive_responders)} of ${n(k.unique_people_reached)} people`} />
        <Kpi k="meetings_booked" value={n(k.meetings_booked)} sub={`conversion ${pct(k.meeting_conversion)}`} />
        <Kpi k="followups_due" value={n(k.followups_due)} />
        <Kpi k="messages_sent_confirmed" value={n(k.messages_sent_confirmed)} sub="Gmail API-confirmed" />
        <Kpi k="people_responded" value={n(k.people_responded)} />
        <Kpi k="qualified_pipeline" value={n(k.qualified_pipeline)} sub="open opportunities" />
        <Kpi k="pipeline_value_by_currency" value={<span className="text-lg">{valueLine(k.pipeline_value_by_currency)}</span>} sub="evidence-supported values only" />
        <Kpi k="won_revenue_by_currency" value={<span className="text-lg">{valueLine(k.won_revenue_by_currency)}</span>} sub="recorded wins" />
      </section>
      {(k.sample_size_reached ?? 0) > 0 && (k.sample_size_reached ?? 0) < 30 && (
        <p className="mt-3 text-xs text-ink-3">Small sample: rates are based on {k.sample_size_reached} reached people and will move a lot with each reply.</p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Decisions waiting" eyebrow="Approvals" className="xl:col-span-1"
          actions={<ButtonLink href="/approvals" size="sm">Open queue</ButtonLink>}>
          {approvals.data?.length ? (
            <ul className="flex flex-col gap-2">
              {approvals.data.map((a) => {
                const org = (a.outreach_drafts as unknown as { organisations: { trading_name: string; primary_market: string } }).organisations;
                return (
                  <li key={a.id}>
                    <Link href={`/approvals?focus=${a.id}`} className="flex items-center gap-3 rounded-neo neo-inset-sm px-3 py-2.5 hover:shadow-none">
                      <Stamp className="h-4 w-4 shrink-0 text-oxblood" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{org.trading_name}</span>
                        <span className="block truncate text-xs text-ink-3">{a.channel === "gmail" ? a.subject ?? "(no subject)" : "LinkedIn message"} · {a.recipient_value}</span>
                      </span>
                      <span className="text-[0.7rem] text-ink-3">{relTime(a.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Nothing waiting" body="Drafts you request approval for appear here." />
          )}
        </Panel>

        <Panel title="Best opportunities" eyebrow="Current qualification" className="xl:col-span-1"
          actions={<ButtonLink href="/qualification" size="sm">All</ButtonLink>}>
          {best.data?.length ? (
            <ul className="flex flex-col gap-2">
              {best.data.map((q) => {
                const o = q.organisations as unknown as { trading_name: string; primary_market: string; sector: string | null };
                const s = Math.round(Number(q.override_score ?? q.score));
                const why = ((q.explanation as { why_now?: string })?.why_now ?? "").slice(0, 110);
                return (
                  <li key={q.organisation_id}>
                    <Link href={`/organisations/${q.organisation_id}`} className="flex items-center gap-3 rounded-neo px-2 py-2 hover:bg-raised/70">
                      <span className="tabular grid h-11 w-11 shrink-0 place-items-center rounded-full neo-raised-sm text-sm font-semibold text-oxblood">{s}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{o.trading_name}</span><MarketBadge market={o.primary_market} /></span>
                        <span className="block truncate text-xs text-ink-3">{why || BAND_LABEL[q.band]} · coverage {Math.round(Number(q.coverage) * 100)}%</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No qualified organisations yet" body="Import your workbook or add an organisation, then run qualification." action={<ButtonLink href="/data" size="sm" variant="primary">Import data</ButtonLink>} />
          )}
        </Panel>

        <Panel title="Funnel" eyebrow="Organisations created in range" className="xl:col-span-1">
          <Funnel stages={funnel} />
        </Panel>

        <Panel title="Recent replies" eyebrow="Inbox" actions={<ButtonLink href="/inbox" size="sm">Inbox</ButtonLink>}>
          {replies.data?.length ? (
            <ul className="flex flex-col gap-2">
              {replies.data.map((c) => {
                const org = c.organisations as unknown as { trading_name: string } | null;
                const ct = c.contacts as unknown as { full_name: string } | null;
                return (
                  <li key={c.id}>
                    <Link href={`/inbox?c=${c.id}`} className="flex items-center justify-between gap-3 rounded-neo px-2 py-2 hover:bg-raised/70">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{ct?.full_name ?? "Unknown contact"}</span><span className="block truncate text-xs text-ink-3">{org?.trading_name}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        {c.latest_classification ? <Badge tone={c.latest_classification === "positive" || c.latest_classification === "meeting_request" ? "positive" : "neutral"}>{REPLY_LABEL[c.latest_classification as keyof typeof REPLY_LABEL]}</Badge> : null}
                        {c.needs_review && <Badge tone="warning">review</Badge>}
                        <span className="text-[0.7rem] text-ink-3">{relTime(c.last_inbound_at)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No replies yet" body="Replies sync from Gmail once it is connected." />
          )}
        </Panel>

        <Panel title="Follow-ups due" eyebrow="Next 48 hours" actions={<ButtonLink href="/tasks" size="sm">Tasks</ButtonLink>}>
          {followups.data?.length ? (
            <ul className="flex flex-col gap-2">
              {followups.data.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-neo neo-inset-sm px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span className={`shrink-0 text-xs ${t.due_at && new Date(t.due_at) < new Date() ? "font-medium text-oxblood" : "text-ink-3"}`}>{t.due_at && new Date(t.due_at) < new Date() ? "overdue" : relTime(t.due_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing due" />
          )}
        </Panel>

        <Panel title="Latest buying signals" eyebrow="Evidence">
          {signals.data?.length ? (
            <ul className="flex flex-col gap-3">
              {signals.data.map((s) => (
                <li key={s.id} className="flex gap-3 text-sm">
                  <Radio className="mt-0.5 h-4 w-4 shrink-0 text-oxblood" aria-hidden />
                  <span className="min-w-0">
                    <Link href={`/organisations/${s.organisation_id}?tab=signals`} className="font-medium hover:underline">{(s.organisations as unknown as { trading_name: string }).trading_name}</Link>
                    <span className="block text-ink-2">{s.claim_text}</span>
                    <span className="block text-xs text-ink-3">{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{s.source_name}</a> : s.source_name} · {relTime(s.published_at ?? s.retrieved_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No signals recorded" body="Signals appear as evidence is added to dossiers. Automated discovery sources arrive in Phase 2." />
          )}
        </Panel>
      </div>
    </>
  );
}
