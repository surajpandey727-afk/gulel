"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Check, ExternalLink, RefreshCw, StickyNote } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { EmptyState, Surface } from "@/components/neo/surface";
import { cn } from "@/components/neo/cn";
import { REPLY_CATEGORIES, REPLY_LABEL } from "@/lib/ai/agents/classifier";
import { addNoteAction, draftConversationAction, logManualReplyAction, reviewClassificationAction, setConversationStatusAction, syncNowAction } from "./actions";

export interface ConvRow { id: string; channel: string; status: string; subject: string | null; market: string | null; latest_classification: string | null; needs_review: boolean; last_outbound_at: string | null; last_inbound_at: string | null; updated_at: string; organisations: { id: string; trading_name: string; primary_market: string } | null; contacts: { id: string; full_name: string } | null }
export interface Thread {
  conv: ConvRow & { contacts: { id: string; full_name: string; linkedin_url: string | null; opted_out_at: string | null; contact_organisations: Array<{ title: string | null }> } | null };
  messages: Array<{ id: string; direction: "inbound" | "outbound"; source: string; from_value: string | null; to_value: string | null; subject: string | null; body_text: string | null; snippet: string | null; occurred_at: string; conversation_classifications: Array<{ id: string; proposed: string; final: string | null; confidence: number | null; rationale: string | null }> }>;
  notes: Array<{ id: string; body: string; created_at: string }>;
  events: Array<{ id: number; from_status: string | null; to_status: string; actor_type: string; created_at: string }>;
}

const SEGS = [
  ["all", "All"], ["new", "New responses"], ["positive", "Positive"], ["neutral", "Neutral"], ["negative", "Negative"], ["meetings", "Meetings"],
  ["awaiting", "Awaiting reply"], ["followup", "Follow-up due"], ["no_response", "No response 7d+"], ["opted_out", "Opted out"], ["closed", "Closed"],
] as const;
const STATUSES = ["awaiting_response", "replied", "qualified_conversation", "meeting_requested", "meeting_booked", "opportunity", "proposal", "won", "lost", "nurture", "deferred", "opted_out", "do_not_contact", "archived"];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function InboxView({ rows, thread, seg, ch, market, gmail }: { rows: ConvRow[]; thread: Thread | null; seg: string; ch: string; market: string; gmail: { status: string; last_sync_at: string | null } | null }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState({ body: "", at: "" });
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); router.replace(`${path}?${n}`, { scroll: false }); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? r.message ?? "Saved." : `⚠ ${r.error}`); router.refresh(); });
  const showThreadMobile = !!params.get("c");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Channel" size="sm" value={ch as "all"} onChange={(v) => set("ch", v === "all" ? null : v)} options={[{ value: "all", label: "All" }, { value: "gmail", label: "Gmail" }, { value: "linkedin", label: "LinkedIn" }]} />
        <Segmented label="Market" size="sm" value={market as "ALL"} onChange={(v) => set("m", v === "ALL" ? null : v)} options={[{ value: "ALL", label: "Both" }, { value: "UK", label: "UK" }, { value: "IN", label: "India" }]} />
        <span className="flex-1" />
        <span className="text-xs text-ink-3">{gmail ? `Gmail ${gmail.status.replace(/_/g, " ")} · last sync ${fmt(gmail.last_sync_at)}` : "Gmail not connected"}</span>
        <Button size="sm" loading={pending} disabled={gmail?.status !== "connected"} onClick={() => act(syncNowAction)}><RefreshCw className="h-3.5 w-3.5" /> Sync now</Button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Inbox segments">
        {SEGS.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={seg === k} onClick={() => set("seg", k === "all" ? null : k)} className={cn("h-8 shrink-0 rounded-full px-3.5 text-xs font-medium", seg === k ? "neo-raised-sm text-oxblood" : "text-ink-3 hover:text-ink")}>{l}</button>)}
      </div>
      {msg && <p role="status" className="text-sm text-ink-2">{msg}</p>}

      <div className="grid min-h-[60dvh] gap-4 lg:grid-cols-[360px_minmax(0,1fr)_280px]">
        <Surface elevation="inset" className={cn("flex-col gap-1 overflow-y-auto p-2 lg:flex lg:max-h-[75dvh]", showThreadMobile ? "hidden" : "flex")}>
          {rows.length === 0 ? <div className="p-4"><EmptyState title="No conversations here" body="Conversations appear once a message has been sent or a manual LinkedIn send is confirmed." /></div> :
            rows.map((r) => (
              <button key={r.id} type="button" onClick={() => set("c", r.id)} className={cn("flex w-full flex-col gap-1 rounded-neo px-3 py-2.5 text-left transition-shadow", thread?.conv.id === r.id ? "neo-raised-sm" : "hover:bg-raised/60")}>
                <span className="flex items-center gap-2">
                  {r.needs_review && <span className="h-2 w-2 shrink-0 rounded-full bg-oxblood" aria-label="Needs review" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.contacts?.full_name ?? "Unknown"} <span className="font-normal text-ink-3">· {r.organisations?.trading_name}</span></span>
                  <span className="text-[0.65rem] text-ink-3">{fmt(r.last_inbound_at ?? r.last_outbound_at)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge icon={false}>{r.channel === "gmail" ? "Gmail" : "LinkedIn"}</Badge>
                  <Badge tone="muted" icon={false}>{r.status.replace(/_/g, " ")}</Badge>
                  {r.latest_classification && <Badge tone={["positive", "meeting_request"].includes(r.latest_classification) ? "positive" : ["negative", "opt_out", "bounce"].includes(r.latest_classification) ? "critical" : "neutral"} icon={false}>{REPLY_LABEL[r.latest_classification as keyof typeof REPLY_LABEL]}</Badge>}
                </span>
              </button>
            ))}
        </Surface>

        {thread ? (
          <>
            <Surface className={cn("min-w-0 flex-col gap-4 p-5 lg:flex", showThreadMobile ? "flex" : "hidden")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" className="mb-1 flex items-center gap-1 text-xs text-ink-3 lg:hidden" onClick={() => set("c", null)}><ArrowLeft className="h-3 w-3" /> Back</button>
                  <h2 className="truncate text-lg font-semibold">{thread.conv.subject ?? (thread.conv.channel === "linkedin" ? "LinkedIn conversation" : "(no subject)")}</h2>
                  <p className="text-xs text-ink-3">{thread.conv.contacts?.full_name} · {thread.conv.organisations?.trading_name} · {thread.conv.channel === "linkedin" ? "LinkedIn (manual log — not synced)" : "Gmail (synced)"}</p>
                </div>
                <MarketBadge market={thread.conv.market ?? thread.conv.organisations?.primary_market} />
              </div>
              <ol className="flex flex-col gap-3">
                {thread.messages.map((m) => {
                  const cls = m.conversation_classifications[0];
                  return (
                    <li key={m.id} className={cn("rounded-neo p-4", m.direction === "outbound" ? "ml-6 neo-inset-sm" : "mr-6 neo-raised-sm")}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                        <span>{m.direction === "outbound" ? "You" : m.from_value ?? thread.conv.contacts?.full_name} · {m.source === "manual_log" ? "logged manually" : m.source === "gateway" ? "sent via gateway" : "Gmail"}</span>
                        <span>{fmt(m.occurred_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{m.body_text ?? m.snippet}</p>
                      {m.direction === "inbound" && cls && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline/60 pt-3 text-xs">
                          <span className="text-ink-3">{cls.final ? "Reviewed:" : `Proposed (${Math.round(Number(cls.confidence ?? 0) * 100)}%):`}</span>
                          <Badge tone={cls.final ? "positive" : "warning"}>{REPLY_LABEL[(cls.final ?? cls.proposed) as keyof typeof REPLY_LABEL]}</Badge>
                          {cls.rationale && <span className="text-ink-3">{cls.rationale}</span>}
                          <span className="flex-1" />
                          {!cls.final && <Button size="sm" onClick={() => act(() => reviewClassificationAction(cls.id, thread.conv.id, cls.proposed as never))}><Check className="h-3.5 w-3.5" /> Accept</Button>}
                          <Select aria-label="Correct classification" className="h-8 w-40 text-xs" value="" onChange={(e) => e.target.value && act(() => reviewClassificationAction(cls.id, thread.conv.id, e.target.value as never))}>
                            <option value="">Correct to…</option>{REPLY_CATEGORIES.map((c) => <option key={c} value={c}>{REPLY_LABEL[c]}</option>)}
                          </Select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {thread.conv.channel === "linkedin" && (
                <form className="flex flex-col gap-2 rounded-neo neo-inset-sm p-4" onSubmit={(e) => { e.preventDefault(); act(() => logManualReplyAction(thread.conv.id, manual.body, manual.at)); setManual({ body: "", at: "" }); }}>
                  <p className="text-sm font-medium">Log a LinkedIn reply</p>
                  <Textarea aria-label="Reply text" value={manual.body} onChange={(e) => setManual((m) => ({ ...m, body: e.target.value }))} className="min-h-20" placeholder="Paste the reply you received on LinkedIn" />
                  <div className="flex items-end gap-2"><Field label="Received" className="flex-1"><Input type="datetime-local" value={manual.at} onChange={(e) => setManual((m) => ({ ...m, at: e.target.value }))} /></Field><Button type="submit" loading={pending}>Log reply</Button></div>
                </form>
              )}
            </Surface>

            <aside className={cn("flex-col gap-4 lg:flex", showThreadMobile ? "flex" : "hidden")}>
              <Surface className="flex flex-col gap-3 p-4">
                <p className="eyebrow">Contact</p>
                {thread.conv.contacts ? <Link href={`/people/${thread.conv.contacts.id}`} className="font-medium hover:text-oxblood">{thread.conv.contacts.full_name}</Link> : <span>—</span>}
                <p className="text-xs text-ink-3">{thread.conv.contacts?.contact_organisations[0]?.title ?? ""}</p>
                {thread.conv.organisations && <Link href={`/organisations/${thread.conv.organisations.id}`} className="text-sm text-ink-2 hover:underline">{thread.conv.organisations.trading_name}</Link>}
                {thread.conv.contacts?.linkedin_url && <a href={thread.conv.contacts.linkedin_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:underline">LinkedIn profile <ExternalLink className="h-3 w-3" /></a>}
                {thread.conv.contacts?.opted_out_at && <Badge tone="critical">opted out</Badge>}
              </Surface>
              <Surface className="flex flex-col gap-3 p-4">
                <Field label="Stage" htmlFor="stage"><Select id="stage" value={thread.conv.status} onChange={(e) => act(() => setConversationStatusAction(thread.conv.id, e.target.value as never))}>
                  {Array.from(new Set([thread.conv.status, ...STATUSES])).map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </Select></Field>
                <p className="text-[0.7rem] text-ink-3">A reply is not necessarily positive; a meeting is not a win. Moving to “opportunity” creates a pipeline record.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={pending} onClick={() => start(async () => { const r = await draftConversationAction(thread.conv.id, thread.conv.last_inbound_at ? "reply" : "follow_up"); if (!r.ok) setMsg(`⚠ ${r.error}`); else if (r.draftId) router.push(`/outreach/${r.draftId}`); else setMsg(r.message); })}>
                    {thread.conv.last_inbound_at ? "Draft reply" : "Draft follow-up"}
                  </Button>
                </div>
                <p className="text-[0.7rem] text-ink-3">Prepared as a new draft that needs its own approval.</p>
              </Surface>
              <Surface className="flex flex-col gap-3 p-4">
                <p className="eyebrow flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" /> Internal notes</p>
                <form onSubmit={(e) => { e.preventDefault(); act(() => addNoteAction(thread.conv.id, note)); setNote(""); }} className="flex flex-col gap-2">
                  <Textarea aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
                  <Button size="sm" type="submit" disabled={!note.trim()}>Add note</Button>
                </form>
                <ul className="flex flex-col gap-2 text-xs">{thread.notes.map((n) => <li key={n.id} className="rounded-neo neo-inset-sm p-2.5"><p className="text-ink-2">{n.body}</p><p className="mt-1 text-ink-3">{fmt(n.created_at)}</p></li>)}</ul>
              </Surface>
              <Surface className="p-4">
                <p className="eyebrow mb-2">Stage history</p>
                <ol className="flex flex-col gap-1.5 text-xs text-ink-2">{thread.events.map((e) => <li key={e.id}>{e.from_status ? `${e.from_status.replace(/_/g, " ")} → ` : ""}<strong>{e.to_status.replace(/_/g, " ")}</strong> <span className="text-ink-3">· {e.actor_type} · {fmt(e.created_at)}</span></li>)}</ol>
              </Surface>
            </aside>
          </>
        ) : <div className="hidden lg:col-span-2 lg:block"><EmptyState title="Select a conversation" /></div>}
      </div>
    </div>
  );
}
