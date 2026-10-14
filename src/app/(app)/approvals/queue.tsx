"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, ChevronDown, PenLine, Stamp, X } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Segmented } from "@/components/neo/segmented";
import { Badge, MarketBadge, StatusBadge } from "@/components/neo/badge";
import { EmptyState } from "@/components/neo/surface";
import { cn } from "@/components/neo/cn";
import { approveBatchAction, decideApprovalAction } from "../outreach/actions";

export interface QueueItem {
  id: string; status: string; channel: "gmail" | "linkedin"; recipient: string; subject: string | null; createdAt: string; approvedAt: string | null; expiresAt: string | null;
  draftId: string; organisationId: string; organisation: string; market: string; contact: string | null; body: string; version: number; angle: string | null;
  tone: number | null; score: number | null; warnings: string[]; blockers: string[]; fingerprint: string; reason: string | null;
}

export function ApprovalQueue({ items, status, focus, canApprove }: { items: QueueItem[]; status: string; focus: string | null; canApprove: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(focus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [channel, setChannel] = useState<"all" | "gmail" | "linkedin">("all");

  const visible = items.filter((i) => channel === "all" || i.channel === channel);
  const sel = visible.filter((i) => selected.has(i.id));
  const eligible = sel.filter((i) => i.blockers.length === 0);
  const blocked = sel.filter((i) => i.blockers.length > 0);

  const decide = (id: string, d: "approve" | "reject" | "snooze") =>
    start(async () => {
      setMsg(null);
      const r = await decideApprovalAction(id, d);
      setMsg(r.ok ? `${d === "approve" ? "Approved" : d === "reject" ? "Rejected" : "Snoozed"}.` : `⚠ ${r.error}`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Approval state" value={status as "pending"} onChange={(v) => { const n = new URLSearchParams(params); n.set("status", v); router.replace(`${path}?${n}`); }}
          options={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "done", label: "Sent / closed" }]} />
        <Segmented label="Channel" size="sm" value={channel} onChange={setChannel} options={[{ value: "all", label: "All" }, { value: "gmail", label: "Gmail" }, { value: "linkedin", label: "LinkedIn" }]} />
        <span className="flex-1" />
        {status === "pending" && canApprove && sel.length > 0 && (
          <Button variant="primary" onClick={() => setConfirm(true)}><Stamp className="h-4 w-4" /> Approve selected ({eligible.length} eligible)</Button>
        )}
      </div>
      {msg && <p role="status" className="text-sm text-ink-2">{msg}</p>}

      {visible.length === 0 ? (
        <EmptyState icon={<Stamp className="h-5 w-5" />} title={status === "pending" ? "Nothing awaiting approval" : "Nothing here"} body="Request approval from a draft in Outreach Studio." />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((i) => {
            const isOpen = open === i.id;
            return (
              <li key={i.id} className={cn("rounded-neo-lg transition-shadow", isOpen ? "neo-raised" : "neo-raised-sm")}>
                <div className="flex items-center gap-3 p-3 md:p-4">
                  {status === "pending" && canApprove && (
                    <input type="checkbox" aria-label={`Select ${i.organisation}`} checked={selected.has(i.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })}
                      className="h-4 w-4 shrink-0 accent-[var(--brand-oxblood)]" />
                  )}
                  <button type="button" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="tabular hidden h-10 w-10 shrink-0 place-items-center rounded-full neo-inset-sm text-sm font-semibold text-oxblood sm:grid">{i.score ?? "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{i.organisation}</span><MarketBadge market={i.market} /><Badge icon={false}>{i.channel === "gmail" ? "Gmail" : "LinkedIn · manual"}</Badge></span>
                      <span className="block truncate text-xs text-ink-3">{i.contact ?? "—"} · {i.recipient} · {i.subject ?? "LinkedIn message"} · v{i.version}</span>
                    </span>
                    {i.blockers.length > 0 ? <Badge tone="critical">{i.blockers.length} blocker{i.blockers.length > 1 ? "s" : ""}</Badge> : i.warnings.length > 0 ? <Badge tone="warning">{i.warnings.length} warning{i.warnings.length > 1 ? "s" : ""}</Badge> : <Badge tone="positive">clear</Badge>}
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {status === "pending" && canApprove && (
                    <span className="hidden shrink-0 gap-1.5 md:flex">
                      <IconButton label={`Approve ${i.organisation}`} size="iconSm" variant="primary" disabled={pending} onClick={() => decide(i.id, "approve")}><Check className="h-4 w-4" /></IconButton>
                      <IconButton label={`Reject ${i.organisation}`} size="iconSm" disabled={pending} onClick={() => decide(i.id, "reject")}><X className="h-4 w-4" /></IconButton>
                    </span>
                  )}
                </div>
                {isOpen && (
                  <div className="grid gap-4 border-t border-hairline/60 p-4 lg:grid-cols-[1fr_300px]">
                    <div className="rounded-neo neo-inset-sm p-4">
                      {i.subject && <p className="mb-2 font-medium">{i.subject}</p>}
                      <p className="whitespace-pre-wrap text-[0.92rem] leading-relaxed text-ink-2">{i.body}</p>
                    </div>
                    <div className="flex flex-col gap-3 text-sm">
                      {i.angle && <div><p className="eyebrow">Strategic angle</p><p className="text-ink-2">{i.angle}</p></div>}
                      <div className="flex gap-4 text-xs"><span>Tone match <strong className="tabular">{i.tone ?? "—"}</strong></span><span>Score <strong className="tabular">{i.score ?? "—"}</strong></span></div>
                      {i.blockers.map((b) => <p key={b} className="flex gap-2 text-xs text-oxblood"><X className="mt-0.5 h-3.5 w-3.5 shrink-0" />{b}</p>)}
                      {i.warnings.map((w) => <p key={w} className="flex gap-2 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>)}
                      <p className="font-mono text-[0.65rem] text-ink-3">fingerprint {i.fingerprint.slice(0, 16)}…</p>
                      {i.status !== "pending" && <StatusBadge status={i.status} />}
                      {i.reason && <p className="text-xs text-ink-3">Note: {i.reason}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/outreach/${i.draftId}`} className="inline-flex h-8 items-center gap-1.5 rounded-full neo-raised-sm px-3.5 text-xs font-medium"><PenLine className="h-3.5 w-3.5" /> {i.status === "approved" ? (i.channel === "gmail" ? "Open to send" : "Open handoff") : "Edit / regenerate"}</Link>
                        {status === "pending" && canApprove && (<>
                          <Button size="sm" variant="primary" disabled={pending} onClick={() => decide(i.id, "approve")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" disabled={pending} onClick={() => decide(i.id, "reject")}>Reject</Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(i.id, "snooze")}>Snooze</Button>
                          <Link href={`/organisations/${i.organisationId}?tab=evidence`} className="inline-flex h-8 items-center rounded-full px-3 text-xs text-ink-2 hover:underline">Request more research</Link>
                        </>)}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={confirm} onOpenChange={setConfirm} title="Approve selected" description="Only eligible, individually reviewable messages are approved. Approval does not send — each send is still triggered and re-checked by the gateway."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={!eligible.length} loading={pending} onClick={() => start(async () => {
          const r = await approveBatchAction(eligible.map((e) => e.id));
          setMsg(r.ok ? `Approved ${r.data!.approved.length}. ${r.data!.blocked.length ? `${r.data!.blocked.length} refused by the database (changed since review).` : ""}` : `⚠ ${r.error}`);
          setSelected(new Set()); setConfirm(false); router.refresh();
        })}>Approve {eligible.length}</Button></>}>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-neo neo-inset-sm p-3"><dt className="text-xs text-ink-3">Selected</dt><dd className="tabular text-xl font-semibold">{sel.length}</dd></div>
          <div className="rounded-neo neo-inset-sm p-3"><dt className="text-xs text-ink-3">Eligible</dt><dd className="tabular text-xl font-semibold text-positive">{eligible.length}</dd></div>
          <div className="rounded-neo neo-inset-sm p-3"><dt className="text-xs text-ink-3">Blocked</dt><dd className="tabular text-xl font-semibold text-oxblood">{blocked.length}</dd></div>
        </dl>
        {blocked.length > 0 && <ul className="mt-4 flex flex-col gap-1.5 text-xs">{blocked.map((b) => <li key={b.id}><strong>{b.organisation}</strong>: <span className="text-oxblood">{b.blockers.join(" ")}</span></li>)}</ul>}
        <p className="mt-4 text-xs text-ink-3">Daily send cap and pacing are enforced at send time.</p>
      </Modal>
    </div>
  );
}
