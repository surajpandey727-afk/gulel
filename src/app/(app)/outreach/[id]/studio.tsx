"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { diffWords } from "diff";
import { BookmarkPlus, Check, Copy, ExternalLink, History, Mail, Send, ShieldCheck, X } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Field, Input, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Badge, StatusBadge } from "@/components/neo/badge";
import { Gauge } from "@/components/neo/gauge";
import { Panel, Surface } from "@/components/neo/surface";
import { cn } from "@/components/neo/cn";
import type { ChannelCapabilities } from "@/lib/channels/registry";
import { REFINE_ACTIONS, type RefineAction } from "@/lib/ai/agents/governance";
import { SERVICE_LABEL } from "@/lib/ai/agents/shared";
import {
  confirmManualSendAction, decideApprovalAction, preflightAction, recordVoiceFeedbackAction, refineAction,
  requestApprovalAction, saveAsExampleAction, saveEditAction, sendApprovedAction, switchChannelAction,
} from "../actions";

type Quality = {
  tone_match?: number;
  factuality?: { status: string; unsupported_claims?: string[]; invalid_citations?: string[] };
  compliance?: { eligible: boolean; reasons: string[]; warnings: string[] } | null;
  brief?: { why_company: string; why_individual: string; business_issue: string; contribution: string; rationale: string; next_action: string };
  recipient_justification?: string;
  change_summary?: string;
  model?: string;
};
export interface StudioData {
  draft: { id: string; channel: "gmail" | "linkedin"; kind: string; status: string; provider_draft_id: string | null; synced: boolean; follow_up: string | null };
  org: { id: string; trading_name: string; primary_market: string; sector: string | null; website: string | null; needs: string[] };
  contact: { id: string; full_name: string; linkedin_url: string | null; subscriber_type: string; title: string | null } | null;
  strategy: { decision: string; strategic_problem: string | null; service_offering: string | null; timing_rationale: string | null; communication_objective: string | null; reasoning: { decision_rationale?: string } } | null;
  versions: Array<{ id: string; version_no: number; source: string; refine_action: string | null; subject: string | null; body: string; recipient_value: string; strategic_angle: string | null; supporting_evidence_ids: string[]; quality: Quality; created_at: string; fingerprint: string; sending_account_id: string | null }>;
  approvals: Array<{ id: string; status: string; draft_version_id: string; content_fingerprint: string; approved_at: string | null; expires_at: string | null; decision_reason: string | null; created_at: string }>;
  qualification: { score: number; override_score: number | null; band: string; coverage: number; explanation: { why_now?: string } } | null;
  evidence: Array<{ id: string; claim_text: string; source_name: string; source_url: string | null; published_at: string | null; fact_type: string }>;
  siblings: Array<{ id: string; channel: string }>;
  gmail: { email: string; status: string } | null;
  voice: { version_no: number; source: string } | null;
  capabilities: ChannelCapabilities;
  canApprove: boolean;
}

const LIMITS = { gmail: { words: 160, label: "~90–160 words" }, linkedin: { words: 120, label: "< 120 words" } };

export function Studio({ data }: { data: StudioData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = data.versions[0];
  const [viewId, setViewId] = useState<string | null>(null); // null = follow the current version
  const viewing = (viewId && data.versions.find((v) => v.id === viewId)) || current;
  const [subject, setSubject] = useState(current.subject ?? "");
  const [body, setBody] = useState(current.body);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [feedback, setFeedback] = useState<{ original: string; final: string; proposal: { preference: string; generalisable: boolean } | null } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [preflight, setPreflight] = useState<{ ok: boolean; reasons: string[]; warnings: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const dirty = subject !== (current.subject ?? "") || body !== current.body;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const q = current.quality ?? {};
  const openApproval = data.approvals.find((a) => ["pending", "approved", "snoozed"].includes(a.status));
  const approvedForCurrent = openApproval?.status === "approved" && openApproval.draft_version_id === current.id;
  const prev = data.versions[data.versions.indexOf(viewing) + 1];
  const diff = useMemo(() => (prev ? diffWords(prev.body, viewing.body) : null), [prev, viewing]);
  const isReadOnly = viewing.id !== current.id || ["sent"].includes(data.draft.status);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ tone: "err", text: r.error ?? "Failed" });
      else { if (r.message) setMsg({ tone: "ok", text: r.message }); after?.(); router.refresh(); }
    });

  const save = () =>
    start(async () => {
      setMsg(null);
      const original = current.body;
      const r = await saveEditAction(data.draft.id, data.draft.channel === "gmail" ? subject : null, body, original);
      if (!r.ok) return setMsg({ tone: "err", text: r.error });
      setMsg({ tone: "ok", text: `Saved as v${r.data!.versionNo}.${openApproval ? " The previous approval was revoked." : ""}` });
      setFeedback({ original, final: body, proposal: r.data!.proposal });
      setViewId(null);
      router.refresh();
    });

  // when a refresh brings a new current version, follow it and reset the editor
  useEffect(() => { setViewId(null); setSubject(current.subject ?? ""); setBody(current.body); }, [current.id, current.subject, current.body]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/outreach" className="text-xs text-ink-3 hover:text-ink">← Outreach Studio</Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{data.org.trading_name} <span className="text-ink-3">→ {data.contact?.full_name ?? current.recipient_value}</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Channel" value={data.draft.channel} onChange={(c) => {
            const sib = data.siblings.find((s) => s.channel === c);
            if (sib) return router.push(`/outreach/${sib.id}`);
            start(async () => { const r = await switchChannelAction(data.draft.id, c); if (r.ok) router.push(`/outreach/${r.data}`); else setMsg({ tone: "err", text: r.error }); });
          }} options={[{ value: "gmail", label: <><Mail className="h-3.5 w-3.5" /> Gmail</> }, { value: "linkedin", label: "LinkedIn" }]} />
          <StatusBadge status={data.draft.status === "awaiting_approval" ? "pending" : data.draft.status} label={data.draft.status.replace(/_/g, " ")} />
        </div>
      </header>

      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={cn("rounded-neo neo-inset-sm px-4 py-2.5 text-sm", msg.tone === "err" ? "text-oxblood" : "text-positive")}>{msg.tone === "err" ? "⚠ " : "✓ "}{msg.text}</p>}

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* LEFT — intelligence */}
        <div className="order-2 flex flex-col gap-5 xl:order-1">
          <Panel title="Organisation" eyebrow={data.org.primary_market === "UK" ? "United Kingdom · GBP" : "India · INR"}>
            <Link href={`/organisations/${data.org.id}`} className="font-medium text-oxblood hover:underline">{data.org.trading_name}</Link>
            <p className="text-xs text-ink-3">{data.org.sector ?? "Sector unknown"}</p>
            {data.qualification && (
              <div className="mt-3 flex items-center gap-3">
                <Gauge value={Number(data.qualification.override_score ?? data.qualification.score)} label="Score" size={72} />
                <p className="text-xs text-ink-2">{data.qualification.explanation?.why_now}</p>
              </div>
            )}
          </Panel>
          <Panel title="Recipient">
            <p className="font-medium">{data.contact?.full_name ?? "Organisation inbox"}</p>
            <p className="text-xs text-ink-3">{data.contact?.title ?? "—"} · {data.contact?.subscriber_type ?? "unknown"} subscriber</p>
            <p className="mt-2 break-all font-mono text-xs text-ink-2">{current.recipient_value}</p>
            {q.recipient_justification && <p className="mt-2 text-xs text-ink-3">{q.recipient_justification}</p>}
          </Panel>
          <Panel title="Supporting evidence" eyebrow={`${current.supporting_evidence_ids.length} cited`}>
            <ul className="flex flex-col gap-2.5">
              {data.evidence.filter((e) => current.supporting_evidence_ids.includes(e.id)).map((e) => (
                <li key={e.id} className="text-xs">
                  <p className="text-ink-2">{e.claim_text}</p>
                  <p className="text-ink-3">{e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{e.source_name}<ExternalLink className="h-3 w-3" /></a> : e.source_name} · {e.fact_type.replace(/_/g, " ")}</p>
                </li>
              ))}
              {!current.supporting_evidence_ids.length && <li className="text-xs text-oxblood">No evidence cited. Treat any factual claim in this draft as unsupported.</li>}
            </ul>
          </Panel>
        </div>

        {/* CENTRE — editor */}
        <Surface className="order-1 flex min-w-0 flex-col gap-4 p-5 xl:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">{viewing.id === current.id ? `Current version · v${current.version_no}` : `Viewing v${viewing.version_no} (read-only)`}</p>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full neo-raised-sm px-3 py-1.5 text-xs text-ink-2"><History className="h-3.5 w-3.5" /> {data.versions.length} versions</summary>
              <ul className="absolute right-0 z-20 mt-2 max-h-72 w-72 overflow-y-auto rounded-neo neo-raised-lg p-2">
                {data.versions.map((v) => (
                  <li key={v.id}><button type="button" onClick={() => setViewId(v.id === current.id ? null : v.id)} className={cn("w-full rounded-neo-sm px-3 py-2 text-left text-xs hover:bg-sunken", v.id === viewing.id && "neo-inset-sm")}>
                    <span className="font-medium">v{v.version_no}</span> · {v.refine_action?.replace(/_/g, " ") ?? v.source.replace(/_/g, " ")} <span className="block text-ink-3">{new Date(v.created_at).toLocaleString("en-GB")}</span>
                  </button></li>
                ))}
              </ul>
            </details>
          </div>

          {data.draft.channel === "gmail" && (
            <Field label="Subject" htmlFor="subj"><Input id="subj" value={isReadOnly ? viewing.subject ?? "" : subject} readOnly={isReadOnly} onChange={(e) => setSubject(e.target.value)} /></Field>
          )}
          {isReadOnly && diff ? (
            <div className="rounded-neo neo-inset-sm p-4 text-[0.95rem] leading-relaxed whitespace-pre-wrap" aria-label={`Changes from v${prev?.version_no} to v${viewing.version_no}`}>
              {diff.map((p, i) => <span key={i} className={p.added ? "bg-positive/15 text-positive" : p.removed ? "text-oxblood line-through decoration-oxblood/60" : ""}>{p.value}</span>)}
            </div>
          ) : (
            <Field label="Message" htmlFor="body" hint={`${words} words · ${LIMITS[data.draft.channel].label}${words > LIMITS[data.draft.channel].words ? " — consider shortening" : ""}`}>
              <Textarea id="body" value={isReadOnly ? viewing.body : body} readOnly={isReadOnly} onChange={(e) => setBody(e.target.value)} className="min-h-[360px] text-[0.95rem]" />
            </Field>
          )}

          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!dirty} loading={pending && dirty} onClick={save}>Save edit</Button>
              {dirty && <Button variant="ghost" onClick={() => { setSubject(current.subject ?? ""); setBody(current.body); }}>Discard</Button>}
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => run(() => saveAsExampleAction(data.draft.id))}><BookmarkPlus className="h-4 w-4" /> Save as reusable example</Button>
            </div>
          )}
          {viewing.id !== current.id && <Button size="sm" className="self-start" onClick={() => setViewId(null)}>Back to current version</Button>}

          {feedback && (
            <div className="rounded-neo neo-inset-sm p-4 text-sm">
              <p className="font-medium">Should this edit teach your Voice DNA?</p>
              {feedback.proposal?.generalisable ? <p className="mt-1 text-ink-2">Proposed preference: “{feedback.proposal.preference}”</p> : <p className="mt-1 text-ink-3">No generalisable preference detected — looks message-specific.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => run(() => recordVoiceFeedbackAction(data.draft.id, feedback.original, feedback.final, "one_off", null, null), () => setFeedback(null))}>One-off</Button>
                {feedback.proposal?.generalisable && <Button size="sm" variant="primary" onClick={() => run(() => recordVoiceFeedbackAction(data.draft.id, feedback.original, feedback.final, "preference", feedback.proposal!.preference, null), () => setFeedback(null))}>Save as writing preference</Button>}
              </div>
            </div>
          )}
        </Surface>

        {/* RIGHT — governance, quality, approval */}
        <div className="order-3 flex flex-col gap-5">
          <Panel title="Approval" eyebrow={data.capabilities.requiresHumanHandoff ? "Manual handoff channel" : `Sends via ${data.gmail?.email ?? "Gmail (not connected)"}`}>
            <ApprovalBox data={data} approvedForCurrent={approvedForCurrent} openApproval={openApproval} pending={pending} dirty={dirty}
              onRequest={() => run(() => requestApprovalAction(data.draft.id), () => undefined)}
              onDecide={(d) => run(() => decideApprovalAction(openApproval!.id, d))}
              onSendOpen={() => start(async () => { const r = await preflightAction(openApproval!.id); setPreflight(r.ok ? r.data! : { ok: false, reasons: [r.error], warnings: [] }); setSendOpen(true); })}
              onCopy={async () => { await navigator.clipboard.writeText(current.body); setCopied(true); setTimeout(() => setCopied(false), 2000); }} copied={copied}
              onConfirmManual={() => run(() => confirmManualSendAction(openApproval!.id))} recipient={current.recipient_value} />
          </Panel>

          <Panel title="Quality checks" eyebrow={`Voice DNA v${data.voice?.version_no ?? "?"}${data.voice?.source === "default" ? " (provisional)" : ""}`}>
            <div className="flex items-center gap-4">
              <Gauge value={q.tone_match ?? null} label="Tone match" size={84} />
              <ul className="flex flex-1 flex-col gap-1.5 text-xs">
                <li className="flex items-center gap-2">{q.factuality?.status === "pass" ? <Check className="h-3.5 w-3.5 text-positive" /> : <X className="h-3.5 w-3.5 text-oxblood" />} Factuality: {q.factuality?.status ?? "not checked"}</li>
                <li className="flex items-center gap-2">{q.compliance?.eligible ? <ShieldCheck className="h-3.5 w-3.5 text-positive" /> : <X className="h-3.5 w-3.5 text-oxblood" />} Compliance: {q.compliance ? (q.compliance.eligible ? "eligible" : "blocked") : "not checked"}</li>
                {data.draft.channel === "gmail" && <li className="text-ink-3">Gmail draft: {data.draft.synced ? "synced" : data.gmail?.status === "connected" ? "not yet synced" : "Gmail not connected"}</li>}
              </ul>
            </div>
            {!!q.factuality?.unsupported_claims?.length && <ul className="mt-3 list-disc pl-5 text-xs text-oxblood">{q.factuality.unsupported_claims.map((c, i) => <li key={i}>Unsupported: {c}</li>)}</ul>}
            {!!q.compliance?.reasons?.length && <ul className="mt-3 list-disc pl-5 text-xs text-oxblood">{q.compliance.reasons.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            {!!q.compliance?.warnings?.length && <ul className="mt-2 list-disc pl-5 text-xs text-warning">{q.compliance.warnings.map((c, i) => <li key={i}>{c}</li>)}</ul>}
          </Panel>

          <Panel title="Refine" eyebrow="Each refinement creates a new version">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(REFINE_ACTIONS) as RefineAction[]).map((a) => (
                <Button key={a} size="sm" disabled={pending || dirty || isReadOnly} onClick={() => run(() => refineAction(data.draft.id, a), () => setViewId(null))}>
                  {{ shorten: "Shorten", strengthen: "Strengthen argument", more_direct: "More direct", less_formal: "Less formal", more_specific: "More commercially specific", less_sales: "Reduce sales language", regenerate: "Regenerate" }[a]}
                </Button>
              ))}
            </div>
            {q.change_summary && <p className="mt-3 text-xs text-ink-3">Last change: {q.change_summary}</p>}
          </Panel>

          <Panel title="Strategic angle" eyebrow="Why this message exists">
            <dl className="flex flex-col gap-3 text-sm">
              {data.strategy?.service_offering && <div><dt className="eyebrow">Service</dt><dd>{SERVICE_LABEL[data.strategy.service_offering as keyof typeof SERVICE_LABEL]}</dd></div>}
              {current.strategic_angle && <div><dt className="eyebrow">Angle</dt><dd className="text-ink-2">{current.strategic_angle}</dd></div>}
              {q.brief && (<>
                <div><dt className="eyebrow">Business issue</dt><dd className="text-ink-2">{q.brief.business_issue}</dd></div>
                <div><dt className="eyebrow">Why this person</dt><dd className="text-ink-2">{q.brief.why_individual}</dd></div>
                <div><dt className="eyebrow">What we contribute</dt><dd className="text-ink-2">{q.brief.contribution}</dd></div>
                <div><dt className="eyebrow">Single next action</dt><dd className="text-ink-2">{q.brief.next_action}</dd></div>
              </>)}
              {data.strategy?.timing_rationale && <div><dt className="eyebrow">Why now</dt><dd className="text-ink-2">{data.strategy.timing_rationale}</dd></div>}
              {data.draft.follow_up && <div><dt className="eyebrow">Suggested follow-up</dt><dd>{new Date(data.draft.follow_up).toLocaleDateString("en-GB")} (draft only — never auto-sent)</dd></div>}
            </dl>
          </Panel>
        </div>
      </div>

      <Modal open={sendOpen} onOpenChange={setSendOpen} title="Send this approved email?" description="The execution gateway re-checks approval, fingerprint, suppression, replies and caps before sending — exactly once."
        footer={<><Button onClick={() => setSendOpen(false)}>Cancel</Button><Button variant="primary" disabled={!preflight?.ok} loading={pending} onClick={() => run(() => sendApprovedAction(openApproval!.id), () => setSendOpen(false))}><Send className="h-4 w-4" /> Send now</Button></>}>
        <dl className="grid gap-2 text-sm">
          <div><dt className="eyebrow">To</dt><dd className="font-mono">{current.recipient_value}</dd></div>
          <div><dt className="eyebrow">From</dt><dd className="font-mono">{data.gmail?.email ?? "—"}</dd></div>
          <div><dt className="eyebrow">Subject</dt><dd>{current.subject}</dd></div>
          <div><dt className="eyebrow">Approved content fingerprint</dt><dd className="font-mono text-xs text-ink-3">{current.fingerprint.slice(0, 16)}…</dd></div>
        </dl>
        {preflight && !preflight.ok && <ul className="mt-4 list-disc pl-5 text-sm text-oxblood">{preflight.reasons.map((r) => <li key={r}>{r.replace(/_/g, " ")}</li>)}</ul>}
        {preflight && preflight.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-warning">{preflight.warnings.map((r) => <li key={r}>{r.replace(/_/g, " ")}</li>)}</ul>}
      </Modal>
    </div>
  );
}

function ApprovalBox({ data, approvedForCurrent, openApproval, pending, dirty, onRequest, onDecide, onSendOpen, onCopy, copied, onConfirmManual, recipient }: {
  data: StudioData; approvedForCurrent: boolean; openApproval?: StudioData["approvals"][number]; pending: boolean; dirty: boolean;
  onRequest: () => void; onDecide: (d: "approve" | "reject" | "snooze") => void; onSendOpen: () => void; onCopy: () => void; copied: boolean; onConfirmManual: () => void; recipient: string;
}) {
  if (data.draft.status === "sent") return <p className="text-sm text-positive">✓ Sent. See the conversation in the Inbox.</p>;
  if (dirty) return <p className="text-sm text-ink-3">Save your edit first — approval binds to an exact saved version.</p>;
  if (!openApproval) return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2">Not yet submitted. Nothing is sent without your explicit approval.</p>
      <Button variant="primary" loading={pending} onClick={onRequest}>Request approval</Button>
    </div>
  );
  if (openApproval.status === "pending" || openApproval.status === "snoozed") return (
    <div className="flex flex-col gap-3">
      <StatusBadge status={openApproval.status} label={`Awaiting approval${openApproval.status === "snoozed" ? " (snoozed)" : ""}`} />
      {data.canApprove ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={pending} onClick={() => onDecide("approve")}><Check className="h-4 w-4" /> Approve</Button>
          <IconButton label="Reject" onClick={() => onDecide("reject")}><X className="h-4 w-4" /></IconButton>
          <Button size="sm" variant="ghost" onClick={() => onDecide("snooze")}>Snooze 1 day</Button>
        </div>
      ) : <p className="text-xs text-ink-3">An owner or reviewer must approve.</p>}
    </div>
  );
  if (approvedForCurrent && data.draft.channel === "gmail") return (
    <div className="flex flex-col gap-3">
      <StatusBadge status="approved" label={`Approved · expires ${openApproval.expires_at ? new Date(openApproval.expires_at).toLocaleString("en-GB") : "—"}`} />
      <Button variant="primary" loading={pending} disabled={data.gmail?.status !== "connected"} onClick={onSendOpen}><Send className="h-4 w-4" /> Review &amp; send</Button>
      {data.gmail?.status !== "connected" && <p className="text-xs text-oxblood">Connect Gmail in Settings to send.</p>}
    </div>
  );
  if (approvedForCurrent && data.draft.channel === "linkedin") return (
    <div className="flex flex-col gap-3">
      <StatusBadge status="approved" label="Approved for manual send" />
      <ol className="flex flex-col gap-2 text-sm">
        <li><Button size="sm" onClick={onCopy}><Copy className="h-4 w-4" /> {copied ? "Copied" : "1. Copy message"}</Button></li>
        <li><a href={recipient} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-2 rounded-full neo-raised-sm px-3.5 text-xs font-medium"><ExternalLink className="h-4 w-4" /> 2. Open LinkedIn profile</a></li>
        <li><Button size="sm" variant="primary" loading={pending} onClick={onConfirmManual}><Check className="h-4 w-4" /> 3. I sent it on LinkedIn</Button></li>
      </ol>
      <p className="text-xs text-ink-3">Nothing is sent automatically. Only your confirmation records it, and it is reported separately from API-confirmed sends.</p>
    </div>
  );
  return <StatusBadge status={openApproval.status} />;
}
