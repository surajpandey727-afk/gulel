import Link from "next/link";
import { ArrowRight, Radio, Stamp, CheckCircle, Clock, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { money, pct, relTime, resolveFilters, type SearchParams } from "@/lib/filters";
import type { KpiSummary } from "@/lib/metrics";
import { BAND_LABEL } from "@/lib/scoring/model";
import { REPLY_LABEL } from "@/lib/ai/agents/classifier";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { StaggerReveal } from "@/components/reactbits/stagger-reveal";
import { ButtonLink } from "@/components/neo/button";
import { EmptyState, Panel } from "@/components/neo/surface";
import { GlobalFilters } from "@/components/shell/filters";
import { HeroKpi } from "@/components/overview/hero-kpi";
import { Funnel } from "@/components/overview/funnel";

export const metadata = { title: "Overview" };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const f = await resolveFilters(searchParams);
  const session = await getSession();
  const supabase = await createClient();
  const ws = session.workspaceId;
  const args = { p_workspace_id: ws, p_from: f.from.toISOString(), p_to: f.to.toISOString(), p_market: f.market ?? undefined, p_include_demo: f.includeDemo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgFilter = <T,>(q: T): T => (f.market ? (q as any).eq("organisations.primary_market", f.market) : q);

  const [kpiRes, funnelRes, best, approvals, replies, followups, signals, recentOrgs] = await Promise.all([
    supabase.rpc("kpi_summary", args),
    supabase.rpc("funnel_summary", args),
    orgFilter(supabase.from("lead_qualifications").select("organisation_id, score, override_score, band, coverage, explanation, organisations!inner(trading_name, primary_market, sector, is_demo)").eq("workspace_id", ws).eq("is_current", true)).order("score", { ascending: false }).limit(6),
    supabase.from("approval_requests").select("id, channel, recipient_value, subject, created_at, outreach_drafts!inner(organisation_id, organisations!inner(trading_name, primary_market))").eq("workspace_id", ws).eq("status", "pending").order("created_at").limit(5),
    supabase.from("conversations").select("id, status, latest_classification, last_inbound_at, needs_review, organisations(trading_name, primary_market), contacts(full_name)").eq("workspace_id", ws).not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: false }).limit(5),
    supabase.from("tasks").select("id, title, due_at, organisations(trading_name)").eq("workspace_id", ws).eq("status", "open").lte("due_at", new Date(Date.now() + 2 * 86400_000).toISOString()).order("due_at").limit(5),
    orgFilter(supabase.from("evidence_items").select("id, claim_text, source_name, source_url, published_at, retrieved_at, organisation_id, organisations!inner(trading_name, primary_market)").eq("workspace_id", ws).eq("status", "active").like("claim_field", "signal.%")).order("retrieved_at", { ascending: false }).limit(5),
    orgFilter(supabase.from("organisations").select("id, trading_name, primary_market, sector, stage, created_at, lead_qualifications!inner(score, band, is_current)").eq("workspace_id", ws).eq("lead_qualifications.is_current", true)).order("created_at", { ascending: false }).limit(8),
  ]);

  const k = (kpiRes.data ?? {}) as KpiSummary;
  const funnel = (funnelRes.data ?? []) as Array<{ stage: string; count: number }>;
  const currencies = f.market === "UK" ? (["GBP"] as const) : f.market === "IN" ? (["INR"] as const) : (["GBP", "INR"] as const);
  const valueLine = (o: Partial<Record<"GBP" | "INR", number>> | undefined) => currencies.map((c) => money(o?.[c] ?? 0, c)).join(" · ");
  const pendingCount = k.awaiting_approval ?? 0;

  const digestParts: string[] = [];
  if (pendingCount > 0) digestParts.push(`${pendingCount} decision${pendingCount > 1 ? "s" : ""} need${pendingCount === 1 ? "s" : ""} you today`);
  if (k.reply_rate) digestParts.push(`reply rate ${pct(k.reply_rate)}`);
  if (k.pipeline_value_by_currency) digestParts.push(`pipeline ${valueLine(k.pipeline_value_by_currency)}`);

  return (
    <>
      {/* V2 Greeting header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">Command centre</p>
          <h1 className="text-[1.9rem] font-semibold tracking-tight text-ink">{greeting()}, {session.displayName}</h1>
          <p className="mt-1.5 max-w-[46rem] text-[0.9rem] text-ink-2">
            {digestParts.join(" · ") || `${f.rangeLabel} · ${f.market ?? "UK & India"}`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GlobalFilters />
          {pendingCount > 0 && (
            <ButtonLink href="/approvals" variant="primary">
              Review {pendingCount} approval{pendingCount > 1 ? "s" : ""} <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Hero KPI strip (V2 — 4 cards) */}
      <section aria-label="Executive KPIs" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroKpi label="Pipeline value" value={valueLine(k.pipeline_value_by_currency)} delta={k.qualified_pipeline ? { value: `${k.qualified_pipeline} open`, direction: "up" } : undefined} />
        <HeroKpi label="Reply rate" value={pct(k.reply_rate)} delta={k.people_responded ? { value: `${k.people_responded} replied`, direction: (k.reply_rate ?? 0) > 0.1 ? "up" : "flat" } : undefined} />
        <HeroKpi label="Meetings booked" value={String(k.meetings_booked ?? 0)} numeric={{ to: k.meetings_booked ?? 0, decimals: 0 }} delta={k.meeting_conversion ? { value: pct(k.meeting_conversion), direction: (k.meeting_conversion ?? 0) > 0 ? "up" : "flat" } : undefined} />
        <HeroKpi label="Qualified leads" value={String(k.qualified_leads ?? 0)} numeric={{ to: k.qualified_leads ?? 0, decimals: 0 }} delta={k.organisations_discovered ? { value: `${k.organisations_discovered} discovered`, direction: "up" } : undefined} />
      </section>

      {(k.sample_size_reached ?? 0) > 0 && (k.sample_size_reached ?? 0) < 30 && (
        <p className="-mt-3 mb-6 text-xs text-ink-3">Small sample: rates are based on {k.sample_size_reached} reached people and will move a lot with each reply.</p>
      )}

      {/* Main grid: 2-col layout */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left column — spans 2 */}
        <div className="flex flex-col gap-6 xl:col-span-2">
          {/* Chanakya executive summary */}
          <Panel title="Chanakya summary" eyebrow="Strategic intelligence" id="chanakya">
            <div className="flex flex-col gap-3 text-sm text-ink-2">
              {best.data?.length ? (
                <>
                  <p className="leading-relaxed text-ink">
                    <span className="font-medium">Top opportunity:</span> {(best.data[0].organisations as unknown as { trading_name: string }).trading_name} (score {Math.round(Number(best.data[0].override_score ?? best.data[0].score))}).
                    {digestParts.length > 0 && ` ${digestParts[0]}.`}
                  </p>
                  <p className="rounded-neo px-3 py-2 neo-inset-sm">
                    <span className="eyebrow mr-2 text-oxblood">Next</span>
                    {pendingCount > 0 ? "Clear the approval queue, then follow up on warm replies." : "Focus on qualification and evidence gathering for top prospects."}
                  </p>
                </>
              ) : (
                <p className="text-ink-3">Import data or discover organisations to get strategic recommendations from Chanakya.</p>
              )}
            </div>
          </Panel>

          {/* Funnel + Pipeline chart area */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Funnel" eyebrow="Organisations" id="funnel">
              <Funnel stages={funnel} />
            </Panel>
            <Panel title="Best opportunities" eyebrow="Qualification" id="best-opps" actions={<ButtonLink href="/qualification" size="sm">All</ButtonLink>}>
              {best.data?.length ? (
                <StaggerReveal className="flex flex-col gap-2" as="ul">
                  {best.data.slice(0, 4).map((q) => {
                    const o = q.organisations as unknown as { trading_name: string; primary_market: string };
                    const s = Math.round(Number(q.override_score ?? q.score));
                    return (
                      <li key={q.organisation_id}>
                        <Link href={`/organisations/${q.organisation_id}`} className="flex items-center gap-3 rounded-neo px-2 py-2 hover:bg-raised/70">
                          <span className="tabular grid h-10 w-10 shrink-0 place-items-center rounded-full neo-raised-sm text-sm font-semibold text-oxblood">{s}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{o.trading_name}</span><MarketBadge market={o.primary_market} /></span>
                            <span className="block truncate text-xs text-ink-3">{BAND_LABEL[q.band]} · coverage {Math.round(Number(q.coverage) * 100)}%</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </StaggerReveal>
              ) : (
                <EmptyState title="No qualified organisations yet" body="Import data or run qualification." action={<ButtonLink href="/data" size="sm" variant="primary">Import data</ButtonLink>} />
              )}
            </Panel>
          </div>

          {/* Active organisations table (V2) */}
          <Panel title="Active organisations" eyebrow="Recent" id="org-table" actions={<ButtonLink href="/organisations" size="sm">All</ButtonLink>}>
            {recentOrgs.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-ink-3">
                      <th className="pb-2 font-medium">Organisation</th>
                      <th className="pb-2 font-medium">Market</th>
                      <th className="pb-2 font-medium">Stage</th>
                      <th className="pb-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrgs.data.map((org) => {
                      const qual = (org.lead_qualifications as unknown as Array<{ score: number; band: string }>)?.[0];
                      return (
                        <tr key={org.id} className="border-b border-hairline/50 last:border-0">
                          <td className="py-2.5">
                            <Link href={`/organisations/${org.id}`} className="flex items-center gap-2 font-medium text-ink hover:text-oxblood">
                              <Building2 className="h-4 w-4 text-ink-3" aria-hidden />
                              {org.trading_name}
                            </Link>
                          </td>
                          <td className="py-2.5"><MarketBadge market={org.primary_market} /></td>
                          <td className="py-2.5 text-ink-2">{org.stage ?? "—"}</td>
                          <td className="py-2.5 text-right">
                            {qual ? <span className="tabular font-semibold text-oxblood">{Math.round(qual.score)}</span> : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No organisations yet" body="Import your workbook or use Discovery to find prospects." action={<ButtonLink href="/data" size="sm" variant="primary">Import data</ButtonLink>} />
            )}
          </Panel>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6 xl:col-span-1">
          {/* Mariyada approval queue (V2 — inline approve/reject) */}
          <Panel title="Mariyada queue" eyebrow="Approvals" id="approvals" actions={<ButtonLink href="/approvals" size="sm">Open queue</ButtonLink>}>
            {approvals.data?.length ? (
              <StaggerReveal className="flex flex-col gap-2" as="ul">
                {approvals.data.map((a) => {
                  const org = (a.outreach_drafts as unknown as { organisations: { trading_name: string; primary_market: string } }).organisations;
                  return (
                    <li key={a.id}>
                      <Link href={`/approvals?focus=${a.id}`} className="flex items-center gap-3 rounded-neo neo-inset-sm px-3 py-2.5 hover:shadow-none">
                        <Stamp className="h-4 w-4 shrink-0 text-oxblood" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{org.trading_name}</span>
                          <span className="block truncate text-xs text-ink-3">{a.channel === "gmail" ? a.subject ?? "(no subject)" : "LinkedIn message"}</span>
                        </span>
                        <span className="text-[0.7rem] text-ink-3">{relTime(a.created_at)}</span>
                      </Link>
                    </li>
                  );
                })}
              </StaggerReveal>
            ) : (
              <EmptyState title="Queue clear" body="Nothing awaiting your review." icon={<CheckCircle className="h-5 w-5" />} />
            )}
          </Panel>

          {/* Activity feed */}
          <Panel title="Recent replies" eyebrow="Activity" id="replies" actions={<ButtonLink href="/inbox" size="sm">Inbox</ButtonLink>}>
            {replies.data?.length ? (
              <StaggerReveal className="flex flex-col gap-2" as="ul">
                {replies.data.map((c) => {
                  const org = c.organisations as unknown as { trading_name: string } | null;
                  const ct = c.contacts as unknown as { full_name: string } | null;
                  return (
                    <li key={c.id}>
                      <Link href={`/inbox?c=${c.id}`} className="flex items-center justify-between gap-3 rounded-neo px-2 py-2 hover:bg-raised/70">
                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{ct?.full_name ?? "Unknown"}</span><span className="block truncate text-xs text-ink-3">{org?.trading_name}</span></span>
                        <span className="flex shrink-0 items-center gap-2">
                          {c.latest_classification ? <Badge tone={c.latest_classification === "positive" || c.latest_classification === "meeting_request" ? "positive" : "neutral"}>{REPLY_LABEL[c.latest_classification as keyof typeof REPLY_LABEL]}</Badge> : null}
                          <span className="text-[0.7rem] text-ink-3">{relTime(c.last_inbound_at)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </StaggerReveal>
            ) : (
              <EmptyState title="No replies yet" body="Replies sync from Gmail once connected." />
            )}
          </Panel>

          {/* Follow-ups due */}
          <Panel title="Follow-ups due" eyebrow="Next 48h" id="followups" actions={<ButtonLink href="/tasks" size="sm">Tasks</ButtonLink>}>
            {followups.data?.length ? (
              <ul className="flex flex-col gap-2">
                {followups.data.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-neo neo-inset-sm px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{t.title}</span>
                    <span className={`shrink-0 text-xs ${t.due_at && new Date(t.due_at) < new Date() ? "font-medium text-oxblood" : "text-ink-3"}`}>
                      {t.due_at && new Date(t.due_at) < new Date() ? "overdue" : relTime(t.due_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing due" icon={<Clock className="h-5 w-5" />} />
            )}
          </Panel>

          {/* Buying signals */}
          <Panel title="Buying signals" eyebrow="Evidence" id="signals">
            {signals.data?.length ? (
              <StaggerReveal className="flex flex-col gap-3" as="ul">
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
              </StaggerReveal>
            ) : (
              <EmptyState title="No signals" body="Signals appear as evidence is added." />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
