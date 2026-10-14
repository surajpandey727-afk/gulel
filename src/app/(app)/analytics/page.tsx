import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { money, pct, resolveFilters, type SearchParams } from "@/lib/filters";
import type { KpiSummary } from "@/lib/metrics";
import { BAND_LABEL } from "@/lib/scoring/model";
import { PageHeader, Panel } from "@/components/neo/surface";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { GlobalFilters } from "@/components/shell/filters";
import { Funnel } from "@/components/overview/funnel";
import { CountryChart } from "./country-chart";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const f = await resolveFilters(searchParams);
  const s = await getSession();
  const supabase = await createClient();
  const ws = s.workspaceId;
  const range = { p_workspace_id: ws, p_from: f.from.toISOString(), p_to: f.to.toISOString(), p_include_demo: f.includeDemo };
  const [uk, ind, funnel, outbound, convs, quals, execs] = await Promise.all([
    supabase.rpc("kpi_summary", { ...range, p_market: "UK" }),
    supabase.rpc("kpi_summary", { ...range, p_market: "IN" }),
    supabase.rpc("funnel_summary", { ...range, p_market: f.market ?? undefined }),
    supabase.from("outbound_messages").select("channel, delivery_status, contact_id, recipient_value, organisation_id, conversation_id, market, is_demo").eq("workspace_id", ws).gte("sent_at", range.p_from).lte("sent_at", range.p_to),
    supabase.from("conversations").select("id, channel, last_inbound_at, latest_classification, status").eq("workspace_id", ws),
    supabase.from("lead_qualifications").select("organisation_id, band").eq("workspace_id", ws).eq("is_current", true),
    supabase.from("agent_executions").select("agent, cost_usd").eq("workspace_id", ws).gte("started_at", range.p_from),
  ]);
  const K = { UK: (uk.data ?? {}) as KpiSummary, IN: (ind.data ?? {}) as KpiSummary };
  const ob = (outbound.data ?? []).filter((o) => (f.includeDemo || !o.is_demo) && (!f.market || o.market === f.market));
  const convBy = new Map((convs.data ?? []).map((c) => [c.id, c]));
  const replied = (o: (typeof ob)[number]) => !!convBy.get(o.conversation_id ?? "")?.last_inbound_at;
  const positive = (o: (typeof ob)[number]) => ["positive", "meeting_request"].includes(convBy.get(o.conversation_id ?? "")?.latest_classification ?? "");
  const meeting = (o: (typeof ob)[number]) => ["meeting_requested", "meeting_booked", "opportunity", "proposal", "won"].includes(convBy.get(o.conversation_id ?? "")?.status ?? "");
  const uniq = <T,>(xs: T[]) => new Set(xs).size;
  const key = (o: (typeof ob)[number]) => o.contact_id ?? o.recipient_value;

  const channelRows = (["gmail", "linkedin"] as const).map((ch) => {
    const rows = ob.filter((o) => o.channel === ch);
    const people = uniq(rows.map(key));
    return { ch, people, sends: rows.length, confirmed: rows.filter((r) => r.delivery_status === "sent_confirmed").length, manual: rows.filter((r) => r.delivery_status === "manual_confirmed").length, responded: uniq(rows.filter(replied).map(key)), positive: uniq(rows.filter(positive).map(key)), meetings: uniq(rows.filter(meeting).map(key)) };
  });
  const bandOf = new Map((quals.data ?? []).map((q) => [q.organisation_id, q.band]));
  const bands = ["priority_review", "qualified", "nurture", "low_priority", "unscored"].map((b) => {
    const rows = ob.filter((o) => (bandOf.get(o.organisation_id ?? "") ?? "unscored") === b);
    const reached = uniq(rows.map(key));
    return { b, reached, replied: uniq(rows.filter(replied).map(key)), positive: uniq(rows.filter(positive).map(key)), meetings: uniq(rows.filter(meeting).map(key)) };
  });
  const cost = (execs.data ?? []).reduce((a, e) => a + Number(e.cost_usd), 0);
  const totalQualified = (K.UK.qualified_leads ?? 0) + (K.IN.qualified_leads ?? 0);
  const chart = [
    { metric: "Discovered", UK: K.UK.organisations_discovered ?? 0, IN: K.IN.organisations_discovered ?? 0 },
    { metric: "Qualified", UK: K.UK.qualified_leads ?? 0, IN: K.IN.qualified_leads ?? 0 },
    { metric: "Reached", UK: K.UK.unique_people_reached ?? 0, IN: K.IN.unique_people_reached ?? 0 },
    { metric: "Responded", UK: K.UK.people_responded ?? 0, IN: K.IN.people_responded ?? 0 },
    { metric: "Meetings", UK: K.UK.meetings_booked ?? 0, IN: K.IN.meetings_booked ?? 0 },
  ];

  return (
    <>
      <PageHeader title="Analytics" description={`${f.rangeLabel}. Person-level metrics count distinct people; message-level metrics count messages. Unconfirmed LinkedIn sends are never counted.`} actions={<GlobalFilters />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="UK vs India" eyebrow="People and organisations · counts">
          <CountryChart data={chart} />
          <Table className="mt-4">
            <thead><tr><Th>Metric</Th><Th className="text-right">UK</Th><Th className="text-right">India</Th></tr></thead>
            <tbody>
              {[["Reply rate", pct(K.UK.reply_rate), pct(K.IN.reply_rate)], ["Positive reply rate", pct(K.UK.positive_reply_rate), pct(K.IN.positive_reply_rate)], ["Meeting conversion", pct(K.UK.meeting_conversion), pct(K.IN.meeting_conversion)], ["Open opportunities", K.UK.qualified_pipeline ?? 0, K.IN.qualified_pipeline ?? 0],
                ["Pipeline value", money(K.UK.pipeline_value_by_currency?.GBP ?? 0, "GBP"), money(K.IN.pipeline_value_by_currency?.INR ?? 0, "INR")], ["Won revenue", money(K.UK.won_revenue_by_currency?.GBP ?? 0, "GBP"), money(K.IN.won_revenue_by_currency?.INR ?? 0, "INR")]].map(([l, a, b]) => (
                <Tr key={l as string}><Td>{l}</Td><Td className="tabular text-right">{a}</Td><Td className="tabular text-right">{b}</Td></Tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-ink-3">GBP and INR are shown separately. No converted totals are presented, so no exchange rate is applied.</p>
        </Panel>

        <Panel title="Funnel" eyebrow="Organisations created in range">
          <Funnel stages={(funnel.data ?? []) as Array<{ stage: string; count: number }>} />
        </Panel>

        <Panel title="Channel effectiveness" eyebrow="Unavailable metrics are marked, not estimated">
          <Table>
            <thead><tr><Th>Channel</Th><Th className="text-right">People</Th><Th className="text-right">Confirmed sends</Th><Th className="text-right">Responded</Th><Th className="text-right">Positive</Th><Th className="text-right">Meetings</Th><Th>Delivery tracking</Th></tr></thead>
            <tbody>{channelRows.map((c) => (
              <Tr key={c.ch}><Td className="capitalize">{c.ch}</Td><Td className="tabular text-right">{c.people}</Td>
                <Td className="tabular text-right">{c.ch === "gmail" ? c.confirmed : <span title="manually confirmed by you">{c.manual} manual</span>}</Td>
                <Td className="tabular text-right">{c.responded} <span className="text-ink-3">({c.people ? Math.round((c.responded / c.people) * 100) : 0}%)</span></Td><Td className="tabular text-right">{c.positive}</Td><Td className="tabular text-right">{c.meetings}</Td>
                <Td className="text-xs text-ink-3">{c.ch === "gmail" ? "accepted by Gmail; opens not tracked" : "unavailable (manual channel)"}</Td></Tr>
            ))}</tbody>
          </Table>
        </Panel>

        <Panel title="Does qualification predict response?" eyebrow="Score band at time of analysis vs outcomes">
          <Table>
            <thead><tr><Th>Band</Th><Th className="text-right">Reached</Th><Th className="text-right">Reply rate</Th><Th className="text-right">Positive</Th><Th className="text-right">Meetings</Th></tr></thead>
            <tbody>{bands.map((b) => (
              <Tr key={b.b}><Td>{BAND_LABEL[b.b] ?? "Not scored"}</Td><Td className="tabular text-right">{b.reached}</Td><Td className="tabular text-right">{b.reached ? `${Math.round((b.replied / b.reached) * 100)}%` : "—"}</Td><Td className="tabular text-right">{b.positive}</Td><Td className="tabular text-right">{b.meetings}</Td></Tr>
            ))}</tbody>
          </Table>
          <p className="mt-2 text-xs text-ink-3">{ob.length < 50 ? `Only ${uniq(ob.map(key))} people reached — far too few to judge whether the model works. Treat these as anecdotes.` : "Compare bands only where each has 30+ people reached."}</p>
        </Panel>

        <Panel title="AI cost efficiency" eyebrow="In range" className="xl:col-span-2">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><dt className="text-xs text-ink-3">LLM spend</dt><dd className="tabular text-xl font-semibold">${cost.toFixed(2)}</dd></div>
            <div><dt className="text-xs text-ink-3">Cost per qualified lead</dt><dd className="tabular text-xl font-semibold">{totalQualified ? `$${(cost / totalQualified).toFixed(2)}` : "—"}</dd></div>
            <div><dt className="text-xs text-ink-3">Cost per positive response</dt><dd className="tabular text-xl font-semibold">{(K.UK.positive_responders ?? 0) + (K.IN.positive_responders ?? 0) ? `$${(cost / ((K.UK.positive_responders ?? 0) + (K.IN.positive_responders ?? 0))).toFixed(2)}` : "—"}</dd></div>
            <div><dt className="text-xs text-ink-3">Cost per meeting</dt><dd className="tabular text-xl font-semibold">{(K.UK.meetings_booked ?? 0) + (K.IN.meetings_booked ?? 0) ? `$${(cost / ((K.UK.meetings_booked ?? 0) + (K.IN.meetings_booked ?? 0))).toFixed(2)}` : "—"}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-ink-3">Costs are attributed to the period they were incurred in, not back-allocated to outcomes. Messaging-performance analysis (subject lines, angles, voice versions) unlocks in Phase 3 once sample sizes support it.</p>
        </Panel>
      </div>
    </>
  );
}
