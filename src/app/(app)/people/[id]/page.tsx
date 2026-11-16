import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { fmtDate } from "@/lib/filters";
import { EMAIL_QUALITY_LABEL, type EmailQuality } from "@/lib/contacts/email-quality";
import { Panel } from "@/components/neo/surface";
import { Badge, MarketBadge, StatusBadge } from "@/components/neo/badge";
import { ExternalLink, Link2 } from "lucide-react";
import { OrgNotes } from "@/components/orgs/org-notes";
import { OrgFiles } from "@/components/orgs/org-files";
import { listFiles, listNotes, repoNotesFor } from "@/lib/orgs/records";

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
    supabase.from("notes").select("body, created_at").eq("contact_id", id).is("deleted_at", null),
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
  const orgIds = orgs.map((o) => o.organisations.id);
  const orgNames = Object.fromEntries(orgs.map((o) => [o.organisations.id, o.organisations.trading_name]));
  const [allNotes, files, { data: orgLinks }] = await Promise.all([
    listNotes(supabase, s.workspaceId, { orgIds, contactId: id }),
    listFiles(supabase, s.workspaceId, orgIds),
    orgIds.length ? supabase.from("contact_channels").select("organisation_id, value").in("organisation_id", orgIds).eq("channel", "linkedin").is("contact_id", null) : Promise.resolve({ data: [] as { organisation_id: string; value: string }[] }),
  ]);
  const { data: crOrgs } = orgIds.length ? await supabase.from("organisations").select("cr_key").in("id", orgIds).not("cr_key", "is", null) : { data: [] as { cr_key: string }[] };
  const repoNotes = (await Promise.all((crOrgs ?? []).map((o) => repoNotesFor(supabase, s.workspaceId, o.cr_key)))).flat()
    .filter((r) => r.sheet !== "Contacts" || r.key === c.cr_key);
  const orgLinkedIn = new Map((orgLinks ?? []).map((l) => [l.organisation_id, l.value]));
  const canWrite = s.role !== "viewer";
  const primaryOrg = orgIds[0] ?? null;
  type Ch = { id: string; channel: string; value: string; email_quality: EmailQuality | null; verification_status: string; verification_method: string | null; verified_at: string | null; source: string | null; bounced_at: string | null };

  return (
    <>
      <Link href="/people" className="text-xs text-ink-3 hover:text-ink">← People</Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.full_name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <MarketBadge market={c.market} />
        {orgs.map((o) => (
          <span key={o.organisations.id} className="inline-flex items-center gap-2">
            <Link href={`/organisations/${o.organisations.id}`} className="hover:text-ink">{o.title ?? "—"} · {o.organisations.trading_name}</Link>
            {orgLinkedIn.get(o.organisations.id) && <a href={orgLinkedIn.get(o.organisations.id)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-ink"><Link2 className="h-3.5 w-3.5" aria-hidden />LinkedIn<ExternalLink className="h-3 w-3" /></a>}
          </span>
        ))}
        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-ink"><Link2 className="h-3.5 w-3.5" aria-hidden />Profile<ExternalLink className="h-3 w-3" /></a>}
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
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Notes" eyebrow={orgIds.length ? `About ${c.full_name} and ${orgs.map((o) => o.organisations.trading_name).join(", ")}` : `About ${c.full_name}`}>
          <OrgNotes contactId={id} initial={allNotes} canWrite={canWrite} orgNames={orgNames} repoNotes={repoNotes} />
        </Panel>
        <Panel title="Files" eyebrow={primaryOrg ? `From ${orgs.map((o) => o.organisations.trading_name).join(", ")}` : "No organisation linked"}>
          {primaryOrg ? <OrgFiles organisationId={primaryOrg} initial={files} canWrite={canWrite} /> : <p className="text-sm text-ink-3">Link this person to an organisation to attach files.</p>}
        </Panel>
      </div>
    </>
  );
}
