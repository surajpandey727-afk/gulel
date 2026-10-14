import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { fmtDate } from "@/lib/filters";
import { EMAIL_QUALITY_LABEL, type EmailQuality } from "@/lib/contacts/email-quality";
import { Panel } from "@/components/neo/surface";
import { Badge, MarketBadge, StatusBadge } from "@/components/neo/badge";

export const metadata = { title: "Person" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("*, contact_organisations(title, role_category, buyer_relevance, organisations(id, trading_name)), contact_channels(id, channel, value, email_quality, verification_status, verification_method, verified_at, source, bounced_at)").eq("id", id).eq("workspace_id", s.workspaceId).maybeSingle();
  if (!c) notFound();
  const [{ data: drafts }, { data: convs }, { data: notes }, { data: manual }] = await Promise.all([
    supabase.from("outreach_drafts").select("id, channel, status, created_at, approval_requests(status, approved_at, created_at)").eq("contact_id", id),
    supabase.from("conversations").select("id, channel, status, conversation_messages(direction, source, occurred_at, snippet), conversation_events(to_status, created_at)").eq("contact_id", id),
    supabase.from("notes").select("body, created_at").eq("contact_id", id),
    supabase.from("manual_channel_events").select("channel, event, occurred_at").eq("contact_id", id),
  ]);
  type Ev = { at: string; label: string; origin: string };
  const ev: Ev[] = [{ at: c.created_at, label: "Discovered / added", origin: "record" }];
  for (const d of drafts ?? []) {
    ev.push({ at: d.created_at, label: `Draft prepared (${d.channel})`, origin: "outreach studio" });
    for (const a of (d.approval_requests as Array<{ status: string; approved_at: string | null; created_at: string }>)) { ev.push({ at: a.created_at, label: "Approval requested", origin: "approvals" }); if (a.approved_at) ev.push({ at: a.approved_at, label: `Approved`, origin: "approvals" }); }
  }
  for (const cv of convs ?? []) {
    for (const m of (cv.conversation_messages as Array<{ direction: string; source: string; occurred_at: string; snippet: string | null }>)) ev.push({ at: m.occurred_at, label: `${m.direction === "outbound" ? "Sent" : "Reply"}: ${(m.snippet ?? "").slice(0, 80)}`, origin: m.source === "manual_log" ? `${cv.channel} (manual)` : cv.channel });
    for (const e of (cv.conversation_events as Array<{ to_status: string; created_at: string }>)) ev.push({ at: e.created_at, label: `Stage → ${e.to_status.replace(/_/g, " ")}`, origin: "pipeline" });
  }
  for (const n of notes ?? []) ev.push({ at: n.created_at, label: `Note: ${n.body.slice(0, 80)}`, origin: "internal" });
  for (const m of manual ?? []) ev.push({ at: m.occurred_at, label: `${m.event.replace(/_/g, " ")}`, origin: `${m.channel} (manual)` });
  ev.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const orgs = c.contact_organisations as unknown as Array<{ title: string | null; buyer_relevance: number | null; organisations: { id: string; trading_name: string } }>;
  type Ch = { id: string; channel: string; value: string; email_quality: EmailQuality | null; verification_status: string; verification_method: string | null; verified_at: string | null; source: string | null; bounced_at: string | null };

  return (
    <>
      <Link href="/people" className="text-xs text-ink-3 hover:text-ink">← People</Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.full_name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <MarketBadge market={c.market} />
        {orgs.map((o) => <Link key={o.organisations.id} href={`/organisations/${o.organisations.id}`} className="hover:text-ink">{o.title ?? "—"} · {o.organisations.trading_name}</Link>)}
        {c.opted_out_at && <Badge tone="critical">opted out {fmtDate(c.opted_out_at)}</Badge>}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Interaction timeline" eyebrow="Merged across channels, origins preserved">
          <ol className="relative flex flex-col gap-3 border-l border-hairline pl-5">
            {ev.map((e, i) => <li key={i} className="relative text-sm"><span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-oxblood ring-4 ring-canvas" aria-hidden /><span className="text-ink-2">{e.label}</span><span className="block text-xs text-ink-3">{fmtDate(e.at)} · {e.origin}</span></li>)}
          </ol>
        </Panel>
        <Panel title="Contact channels & permissions">
          <ul className="flex flex-col gap-3">{(c.contact_channels as Ch[]).map((ch) => (
            <li key={ch.id} className="rounded-neo neo-inset-sm p-3 text-xs">
              <p className="break-all font-mono text-sm text-ink">{ch.value}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5"><StatusBadge status={ch.verification_status} />{ch.email_quality && <Badge icon={false}>{EMAIL_QUALITY_LABEL[ch.email_quality]}</Badge>}{ch.bounced_at && <Badge tone="critical">bounced</Badge>}</div>
              <p className="mt-1.5 text-ink-3">Source: {ch.source ?? "—"} · method: {ch.verification_method?.replace(/_/g, " ") ?? "—"}{ch.verified_at ? ` · ${fmtDate(ch.verified_at)}` : ""}</p>
            </li>))}</ul>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-ink-3">Recipient type</dt><dd className="capitalize">{c.subscriber_type}</dd></div>
            <div><dt className="text-ink-3">Lawful basis</dt><dd className="capitalize">{c.lawful_basis.replace(/_/g, " ")}</dd></div>
            <div><dt className="text-ink-3">Outreach status</dt><dd className="capitalize">{c.outreach_status.replace(/_/g, " ")}</dd></div>
            <div><dt className="text-ink-3">Last interaction</dt><dd>{fmtDate(c.last_interaction_at)}</dd></div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
