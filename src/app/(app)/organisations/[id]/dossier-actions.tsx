"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, FilePlus2, PenLine, RefreshCcw, ShieldOff, UserPlus, X } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Modal, Slider, Switch } from "@/components/neo/controls";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Badge } from "@/components/neo/badge";
import { CLAIM_FIELDS } from "@/lib/orgs/constants";
import { addContactAction, addEvidenceAction, overrideQualificationAction, reviewRiskFlagAction, runQualificationAction, suppressAction } from "../actions";
import { prepareOutreachAction } from "../../outreach/actions";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return { pending, error, setError, router, start };
}

export function RunQualificationButton({ organisationId, hasQualification }: { organisationId: string; hasQualification: boolean }) {
  const { pending, error, start, router, setError } = useAction();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button loading={pending} onClick={() => start(async () => { setError(null); const r = await runQualificationAction(organisationId); if (!r.ok) setError(r.error); else router.refresh(); })}>
        <RefreshCcw className="h-4 w-4" /> {hasQualification ? "Re-qualify" : "Qualify"}
      </Button>
      {error && <span role="alert" className="max-w-xs text-right text-xs text-oxblood">⚠ {error}</span>}
    </span>
  );
}

export function PrepareOutreachButton({ organisationId, disabled }: { organisationId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"auto" | "gmail" | "linkedin">("auto");
  const [result, setResult] = useState<{ decision: string; rationale: string; draftId: string | null } | null>(null);
  const { pending, error, start, router, setError } = useAction();
  return (
    <>
      <Button variant="primary" disabled={disabled} onClick={() => { setResult(null); setError(null); setOpen(true); }}><PenLine className="h-4 w-4" /> Prepare outreach</Button>
      <Modal open={open} onOpenChange={setOpen} title="Prepare outreach" description="Governance AI first decides whether an approach is commercially justified. A draft is only written if it is."
        footer={result?.draftId ? <Button variant="primary" onClick={() => router.push(`/outreach/${result.draftId}`)}>Open in Outreach Studio</Button>
          : <><Button onClick={() => setOpen(false)}>Close</Button><Button variant="primary" loading={pending} onClick={() => start(async () => {
            setError(null);
            const r = await prepareOutreachAction(organisationId, channel === "auto" ? null : channel);
            if (!r.ok) return setError(r.error);
            setResult(r.data!);
            router.refresh();
          })}>Run governance review</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Channel preference"><Segmented label="Channel" value={channel} onChange={setChannel} options={[{ value: "auto", label: "Let governance choose" }, { value: "gmail", label: "Gmail" }, { value: "linkedin", label: "LinkedIn" }]} /></Field>
          {pending && <p className="text-sm text-ink-3">Reviewing evidence, recipients, prior outreach and suppression… this can take up to a minute.</p>}
          {error && <p role="alert" className="text-sm text-oxblood">⚠ {error}</p>}
          {result && (
            <div className="rounded-neo neo-inset-sm p-4 text-sm">
              <Badge tone={result.draftId ? "positive" : "warning"}>{result.decision.replace(/_/g, " ")}</Badge>
              <p className="mt-2 text-ink-2">{result.rationale}</p>
              {!result.draftId && <p className="mt-2 text-xs text-ink-3">No draft was forced. The decision is saved on the dossier’s Outreach tab.</p>}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export function AddEvidenceButton({ organisationId, currency, small }: { organisationId: string; currency: "GBP" | "INR"; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confidence, setConfidence] = useState(70);
  const [field, setField] = useState("signal.expansion");
  const { pending, error, start, router, setError } = useAction();
  const isMoney = field.startsWith("financials.") && field !== "financials.revenue_growth_pct";
  const groups = Array.from(new Set(CLAIM_FIELDS.map((c) => c.group)));
  return (
    <>
      <Button size={small ? "sm" : "md"} onClick={() => setOpen(true)}><FilePlus2 className="h-4 w-4" /> Add evidence</Button>
      <Modal open={open} onOpenChange={setOpen} wide title="Add evidence" description="Every claim needs provenance. Facts need a source; inferences are labelled as inferences."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="ev-form" loading={pending}>Save evidence</Button></>}>
        <form id="ev-form" className="grid gap-4 sm:grid-cols-2" action={(fd) => start(async () => {
          setError(null);
          const num = String(fd.get("value_numeric") ?? "").replace(/[,\s]/g, "");
          const r = await addEvidenceAction({
            organisation_id: organisationId, claim_field: field, claim_text: String(fd.get("claim_text") ?? ""),
            fact_type: String(fd.get("fact_type")) as "reported_fact", source_name: String(fd.get("source_name") ?? ""),
            source_url: String(fd.get("source_url") ?? ""), published_at: String(fd.get("published_at") ?? ""), excerpt: String(fd.get("excerpt") ?? ""),
            confidence: confidence / 100, value_numeric: num ? Number(num) : null, value_currency: isMoney && num ? currency : null, value_as_of: String(fd.get("value_as_of") ?? ""),
          });
          if (!r.ok) return setError(r.error);
          setOpen(false); router.refresh();
        })}>
          <Field label="What is this about?" htmlFor="ev-f"><Select id="ev-f" value={field} onChange={(e) => setField(e.target.value)}>
            {groups.map((g) => <optgroup key={g} label={g}>{CLAIM_FIELDS.filter((c) => c.group === g).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>)}
          </Select></Field>
          <Field label="Fact type" htmlFor="ev-t"><Select id="ev-t" name="fact_type" defaultValue="reported_fact">
            <option value="reported_fact">Reported fact</option><option value="dated_filing">Dated filing</option><option value="third_party_estimate">Third-party estimate</option><option value="inference">Inference (my judgement)</option><option value="unknown">Unknown</option>
          </Select></Field>
          <Field label={field.startsWith("news.") ? "Headline" : "Claim"} htmlFor="ev-c" className="sm:col-span-2"><Textarea id="ev-c" name="claim_text" required className="min-h-20" placeholder="e.g. Announced entry into the UK premium snacks category in Q3" /></Field>
          <Field label="Source name" htmlFor="ev-s"><Input id="ev-s" name="source_name" required placeholder="Economic Times / Company website / Founder knowledge" /></Field>
          <Field label="Source URL" htmlFor="ev-u"><Input id="ev-u" name="source_url" type="url" placeholder="https://" /></Field>
          <Field label="Published date" htmlFor="ev-p"><Input id="ev-p" name="published_at" type="date" /></Field>
          {field.startsWith("financials.") ? (
            <Field label={isMoney ? `Amount (${currency})` : "Value"} htmlFor="ev-v"><Input id="ev-v" name="value_numeric" inputMode="decimal" /></Field>
          ) : <span className="hidden sm:block" />}
          {field.startsWith("financials.") && <Field label="Period end / as of" htmlFor="ev-a"><Input id="ev-a" name="value_as_of" type="date" /></Field>}
          <Field label="Excerpt (short, permitted quote)" htmlFor="ev-x" className="sm:col-span-2"><Textarea id="ev-x" name="excerpt" className="min-h-16" /></Field>
          <div className="sm:col-span-2"><Slider label="Confidence" value={confidence} onValueChange={setConfidence} step={5} format={(v) => `${v}%`} /></div>
          {error && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function AddContactButton({ organisationId, market }: { organisationId: string; market: "UK" | "IN" }) {
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [sub, setSub] = useState<"corporate" | "individual" | "unknown">("corporate");
  const { pending, error, start, router, setError } = useAction();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add person</Button>
      <Modal open={open} onOpenChange={setOpen} title="Add person" description="Never guess an email pattern and mark it verified. Unverified addresses need review before use."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="ct-form" loading={pending}>Add</Button></>}>
        <form id="ct-form" className="grid gap-4" action={(fd) => start(async () => {
          setError(null);
          const r = await addContactAction({ organisation_id: organisationId, full_name: String(fd.get("full_name") ?? ""), title: String(fd.get("title") ?? ""), email: String(fd.get("email") ?? ""), linkedin_url: String(fd.get("linkedin_url") ?? ""), market, subscriber_type: sub, email_verified: verified, verification_note: String(fd.get("verification_note") ?? "") });
          if (!r.ok) return setError(r.error);
          setOpen(false); router.refresh();
        })}>
          <Field label="Full name" htmlFor="ct-n"><Input id="ct-n" name="full_name" required /></Field>
          <Field label="Job title" htmlFor="ct-t"><Input id="ct-t" name="title" placeholder="Chief Marketing Officer" /></Field>
          <Field label="Business email" htmlFor="ct-e" hint="Named-person addresses rank above info@ / hello@ inboxes."><Input id="ct-e" name="email" type="email" /></Field>
          <Field label="LinkedIn profile URL" htmlFor="ct-l"><Input id="ct-l" name="linkedin_url" type="url" placeholder="https://www.linkedin.com/in/…" /></Field>
          <Field label="Recipient type (PECR)"><Segmented label="Subscriber type" value={sub} onChange={setSub} options={[{ value: "corporate", label: "Corporate" }, { value: "individual", label: "Sole trader / partnership" }, { value: "unknown", label: "Unknown" }]} /></Field>
          <div className="flex items-center justify-between gap-3 rounded-neo neo-inset-sm p-3"><span className="text-sm">I have verified this email from a credible source</span><Switch checked={verified} onCheckedChange={setVerified} label="Email verified" /></div>
          {verified && <Field label="How was it verified?" htmlFor="ct-v"><Input id="ct-v" name="verification_note" placeholder="Signature on their email to me, 12 Sept" required /></Field>}
          {error && <p role="alert" className="text-sm text-oxblood">⚠ {error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function OverrideButton({ organisationId, qualificationId, current }: { organisationId: string; qualificationId: string; current: number }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(Math.round(current));
  const { pending, error, start, router, setError } = useAction();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Override</Button>
      <Modal open={open} onOpenChange={setOpen} title="Override qualification" description="Overrides are audited and kept alongside the model score."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="ov-form" loading={pending}>Save override</Button></>}>
        <form id="ov-form" className="flex flex-col gap-4" action={(fd) => start(async () => {
          setError(null);
          const r = await overrideQualificationAction(organisationId, qualificationId, score, String(fd.get("reason") ?? ""));
          if (!r.ok) return setError(r.error);
          setOpen(false); router.refresh();
        })}>
          <Slider label="Score" value={score} onValueChange={setScore} />
          <Field label="Reason (required)" htmlFor="ov-r"><Textarea id="ov-r" name="reason" required minLength={5} /></Field>
          {error && <p role="alert" className="text-sm text-oxblood">⚠ {error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function RiskReview({ organisationId, flags }: { organisationId: string; flags: Array<{ id: string; kind: string; severity: string; summary: string; status: string; evidence: string | null }> }) {
  const { start, router } = useAction();
  return (
    <ul className="flex flex-col gap-2">
      {flags.map((f) => (
        <li key={f.id} className="rounded-neo neo-inset-sm p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={f.severity === "critical" ? "critical" : f.severity === "warning" ? "warning" : "neutral"}>{f.kind.replace(/_/g, " ")} · {f.status.replace(/_/g, " ")}</Badge>
            {f.status === "needs_review" && (
              <span className="flex gap-1">
                <IconButton size="iconSm" label="Confirm flag" onClick={() => start(async () => { await reviewRiskFlagAction(f.id, organisationId, "confirmed"); router.refresh(); })}><Check className="h-3.5 w-3.5" /></IconButton>
                <IconButton size="iconSm" label="Dismiss flag" onClick={() => start(async () => { await reviewRiskFlagAction(f.id, organisationId, "dismissed"); router.refresh(); })}><X className="h-3.5 w-3.5" /></IconButton>
              </span>
            )}
          </div>
          <p className="mt-1.5 text-ink-2">{f.summary}</p>
          {f.evidence && <p className="text-xs text-ink-3">Source: {f.evidence}</p>}
        </li>
      ))}
    </ul>
  );
}

export function SuppressButton({ kind, value, label, path, small }: { kind: "organisation" | "contact"; value: string; label: string; path: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, start, router } = useAction();
  return (
    <>
      <Button size="sm" variant="danger" className={small ? "h-7 px-2.5 text-[0.7rem]" : undefined} onClick={() => setOpen(true)}><ShieldOff className="h-3.5 w-3.5" /> {label}</Button>
      <Modal open={open} onOpenChange={setOpen} title={label} description="Adds a central suppression entry. Every outreach workflow checks it before drafting and again before sending."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => start(async () => { await suppressAction(kind, value, kind === "contact" ? "opt_out" : "do_not_contact", path); setOpen(false); router.refresh(); })}>Confirm</Button></>}>
        <p className="text-sm text-ink-2">This can be reversed only by an owner from Settings → Security &amp; data.</p>
      </Modal>
    </>
  );
}
