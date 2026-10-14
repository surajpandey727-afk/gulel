"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KanbanSquare } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { EmptyState } from "@/components/neo/surface";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { money } from "@/lib/filters";
import { generateBriefAction, updateOpportunityAction } from "./actions";

export interface Opp { id: string; name: string; service: string | null; stage: string; market: "UK" | "IN"; currency: "GBP" | "INR"; value_amount: number | null; value_basis: string | null; probability_pct: number | null; expected_close_on: string | null; actual_value_amount: number | null; reason_lost: string | null; next_action: string | null; next_action_due: string | null; is_demo: boolean; prep_brief: unknown; proposal_status: string | null; organisation_id: string; organisations: { trading_name: string } | null; contacts: { full_name: string } | null }
const STAGES = ["discovery", "meeting", "scoping", "proposal", "negotiation", "won", "lost", "nurture"] as const;

export function PipelineBoard({ opps }: { opps: Opp[] }) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [edit, setEdit] = useState<Opp | null>(null);
  if (!opps.length) return <EmptyState icon={<KanbanSquare className="h-5 w-5" />} title="No opportunities yet" body="Move a conversation to “opportunity” in the Inbox when outreach becomes a genuine opportunity." />;
  const totals = (["GBP", "INR"] as const).map((c) => [c, opps.filter((o) => o.currency === c && !["won", "lost", "nurture"].includes(o.stage) && o.value_amount != null).reduce((a, o) => a + Number(o.value_amount), 0)] as const);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="View" size="sm" value={view} onChange={setView} options={[{ value: "kanban", label: "Kanban" }, { value: "table", label: "Table" }]} />
        <span className="text-xs text-ink-3">Open value (stated basis only): {totals.map(([c, v]) => money(v, c)).join(" · ")} — currencies never combined</span>
      </div>
      {view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {STAGES.map((st) => {
            const col = opps.filter((o) => o.stage === st);
            return (
              <section key={st} className="flex w-72 shrink-0 flex-col gap-3 rounded-neo-lg neo-inset-sm p-3" aria-label={st}>
                <h3 className="flex items-center justify-between px-1 text-sm font-medium capitalize">{st}<span className="tabular text-xs text-ink-3">{col.length}</span></h3>
                {col.map((o) => (
                  <button key={o.id} type="button" onClick={() => setEdit(o)} className="flex flex-col gap-1.5 rounded-neo neo-raised-sm p-3 text-left">
                    <span className="text-sm font-medium">{o.organisations?.trading_name}</span>
                    <span className="text-xs text-ink-3">{o.contacts?.full_name ?? "—"}</span>
                    <span className="flex flex-wrap items-center gap-1.5"><MarketBadge market={o.market} />{o.value_amount != null ? <Badge icon={false}>{money(Number(o.value_amount), o.currency)}</Badge> : <Badge tone="muted" icon={false}>value unknown</Badge>}{o.is_demo && <Badge tone="muted" icon={false}>demo</Badge>}</span>
                    {o.next_action && <span className="text-xs text-ink-2">Next: {o.next_action}</span>}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <Table>
          <thead><tr><Th>Opportunity</Th><Th>Stage</Th><Th>Market</Th><Th className="text-right">Value</Th><Th>Basis</Th><Th className="text-right">Prob.</Th><Th>Close</Th><Th>Next action</Th></tr></thead>
          <tbody>{opps.map((o) => (
            <Tr key={o.id} className="cursor-pointer" onClick={() => setEdit(o)}>
              <Td><span className="font-medium text-ink">{o.organisations?.trading_name}</span><span className="block text-xs text-ink-3">{o.name}</span></Td>
              <Td className="capitalize">{o.stage}</Td><Td><MarketBadge market={o.market} /></Td>
              <Td className="tabular text-right">{money(o.stage === "won" ? Number(o.actual_value_amount) : o.value_amount == null ? null : Number(o.value_amount), o.currency)}</Td>
              <Td className="text-xs">{o.value_basis?.replace(/_/g, " ") ?? "—"}</Td><Td className="tabular text-right">{o.probability_pct != null ? `${o.probability_pct}%` : "—"}</Td>
              <Td className="text-xs">{o.expected_close_on ?? "—"}</Td><Td className="text-xs">{o.next_action ?? "—"}</Td>
            </Tr>
          ))}</tbody>
        </Table>
      )}
      {edit && <EditOpp opp={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditOpp({ opp, onClose }: { opp: Opp; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState(opp.stage);
  const num = (v: FormDataEntryValue | null) => { const s = String(v ?? "").replace(/[^\d.]/g, ""); return s ? Number(s) : null; };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={opp.organisations?.trading_name ?? opp.name} description={`${opp.market} · values in ${opp.currency}`}
      footer={<><Link href={`/organisations/${opp.organisation_id}`} className="mr-auto self-center text-sm text-ink-2 hover:underline">Open dossier</Link><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="opp-form" loading={pending}>Save</Button></>}>
      <form id="opp-form" className="grid gap-4 sm:grid-cols-2" action={(fd) => start(async () => {
        const r = await updateOpportunityAction(opp.id, {
          stage: stage as "discovery", value_amount: num(fd.get("value")), value_basis: (String(fd.get("basis") ?? "") || null) as "proposal" | null,
          probability_pct: num(fd.get("prob")) as number | null, expected_close_on: String(fd.get("close") ?? "") || null, actual_value_amount: num(fd.get("actual")),
          reason_lost: String(fd.get("lost") ?? "") || null, next_action: String(fd.get("next") ?? "") || null, service: String(fd.get("service") ?? "") || null,
          proposal_status: (String(fd.get("proposal_status") ?? "") || null) as "sent" | null,
        });
        if (!r.ok) return setErr(r.error);
        onClose(); router.refresh();
      })}>
        <Field label="Stage"><Select value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Service"><Input name="service" defaultValue={opp.service ?? ""} /></Field>
        <Field label={`Estimated value (${opp.currency})`}><Input name="value" inputMode="numeric" defaultValue={opp.value_amount ?? ""} /></Field>
        <Field label="Value basis"><Select name="basis" defaultValue={opp.value_basis ?? ""}><option value="">— none —</option><option value="pricing_assumption">Pricing assumption</option><option value="client_stated">Client stated</option><option value="proposal">Proposal</option><option value="contract">Contract</option></Select></Field>
        <Field label="Probability % (your assumption)"><Input name="prob" inputMode="numeric" defaultValue={opp.probability_pct ?? ""} /></Field>
        <Field label="Expected close"><Input name="close" type="date" defaultValue={opp.expected_close_on ?? ""} /></Field>
        {stage === "won" && <Field label={`Actual won value (${opp.currency})`} className="sm:col-span-2"><Input name="actual" inputMode="numeric" required defaultValue={opp.actual_value_amount ?? ""} /></Field>}
        {stage === "lost" && <Field label="Reason lost" className="sm:col-span-2"><Textarea name="lost" required defaultValue={opp.reason_lost ?? ""} className="min-h-16" /></Field>}
        <Field label="Next action" className="sm:col-span-2"><Input name="next" defaultValue={opp.next_action ?? ""} /></Field>
        <Field label="Proposal status"><Select name="proposal_status" defaultValue={opp.proposal_status ?? ""}><option value="">—</option>{["not_started", "drafting", "sent", "accepted", "declined"].map((x) => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}</Select></Field>
        {err && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {err}</p>}
      </form>
      <BriefPanel opp={opp} />
    </Modal>
  );
}

type Brief = { business_problem: string; why_now: string; stakeholders: Array<{ name: string; role: string; what_we_know: string }>; hypotheses: string[]; questions_to_ask: string[]; commercial_assumptions: string[]; risks_and_unknowns: string[]; initial_scope_notes: string; generated_at: string; model: string };

function BriefPanel({ opp }: { opp: Opp }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const b = opp.prep_brief as Brief | null;
  const list = (t: string, xs: string[]) => xs.length ? <div><p className="eyebrow mb-1">{t}</p><ul className="list-disc space-y-0.5 pl-5">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;
  return (
    <div className="mt-6 rounded-neo neo-inset-sm p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Meeting preparation brief</p>
        <Button size="sm" loading={pending} onClick={() => start(async () => { setErr(null); const r = await generateBriefAction(opp.id); if (!r.ok) setErr(r.error); router.refresh(); })}>{b ? "Regenerate" : "Generate brief"}</Button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-oxblood">⚠ {err}</p>}
      {b ? (
        <div className="mt-3 flex flex-col gap-3 text-ink-2">
          <div><p className="eyebrow mb-1">Business problem (hypothesis)</p><p>{b.business_problem}</p></div>
          <div><p className="eyebrow mb-1">Why now</p><p>{b.why_now}</p></div>
          {b.stakeholders.length > 0 && <div><p className="eyebrow mb-1">Stakeholders</p><ul className="space-y-1">{b.stakeholders.map((s, i) => <li key={i}><strong>{s.name}</strong> · {s.role} — {s.what_we_know}</li>)}</ul></div>}
          {list("Hypotheses", b.hypotheses)}
          {list("Questions to ask", b.questions_to_ask)}
          {list("Commercial assumptions", b.commercial_assumptions)}
          {list("Risks & unknowns", b.risks_and_unknowns)}
          <div><p className="eyebrow mb-1">Initial scope notes</p><p>{b.initial_scope_notes}</p></div>
          <p className="text-[0.7rem] text-ink-3">Generated {new Date(b.generated_at).toLocaleString("en-GB")} · {b.model} · from dossier evidence only</p>
        </div>
      ) : <p className="mt-2 text-xs text-ink-3">Summarises the problem, stakeholders, hypotheses and questions from the dossier and conversation. No invented credentials or testimonials.</p>}
    </div>
  );
}
