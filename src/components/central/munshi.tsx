"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CircleHelp, Minus, Pencil, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Textarea } from "@/components/neo/field";
import { cn } from "@/components/neo/cn";
import { buildIndex, colByKey, displayValue, sheetDef, type Index } from "@/lib/central/compute";
import type { Op, Row, Store } from "@/lib/central/types";
import type { Proposal } from "@/lib/central/agent";
import { applyOpsAction, proposeAction, storeAction } from "@/app/(app)/central/actions";

const EXAMPLES = [
  "Move Paytm to In conversation and set next action: send deck, next date next Friday",
  "Add a task for Nihal to follow up with Sword Health by 25 Nov",
  "Log an interaction today with Ananya Iyer: call, sent by us, agreed to a 10-minute intro",
  "Mark finance F-001 as invoiced on 20 Nov 2026",
];

export function MunshiPanel({ open, onOpenChange, sheet, idx: givenIdx, onApplied, initialText = "" }: { open: boolean; onOpenChange: (o: boolean) => void; sheet?: string; idx?: Index; onApplied?: (rows: Row[]) => void; initialText?: string }) {
  const [text, setText] = useState(initialText);
  useEffect(() => { if (open && initialText) setText(initialText); }, [open, initialText]);
  const [loaded, setLoaded] = useState<Store | null>(null);
  useEffect(() => { if (open && !givenIdx && !loaded) void storeAction().then((r) => r.ok && setLoaded(r.data)); }, [open, givenIdx, loaded]);
  const idx = useMemo(() => givenIdx ?? buildIndex(loaded ?? { rows: [], refs: [] }), [givenIdx, loaded]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [thinking, startThinking] = useTransition();
  const [applying, startApplying] = useTransition();

  const [err, setErr] = useState<string | null>(null);
  const propose = () => startThinking(async () => {
    setProposal(null);
    setErr(null);
    const r = await proposeAction(sheet ? `${text}\n\n(The founder is looking at the ${sheet} sheet.)` : text);
    if (!r.ok) return void setErr(r.error);
    setProposal(r.data);
  });

  const apply = () => startApplying(async () => {
    if (!proposal) return;
    const r = await applyOpsAction(proposal.ops, { via: "agent", note: text.slice(0, 200) });
    if (!r.ok) return void toast.error(r.error);
    onApplied?.(r.data.rows);
    setLoaded(null);
    toast.success(`Munshi applied ${proposal.ops.length} change${proposal.ops.length > 1 ? "s" : ""}`);
    setProposal(null);
    setText("");
    onOpenChange(false);
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} wide title="Ask Munshi" description="Munshi updates the Central Repository from plain English. You review every change before it's applied; it then syncs to Google Sheets."
      footer={proposal ? (
        <>
          <Button size="sm" onClick={() => setProposal(null)}>Edit instruction</Button>
          <Button size="sm" variant="primary" onClick={apply} loading={applying} disabled={!proposal.valid || proposal.ops.length === 0}>
            Apply {proposal.ops.length} change{proposal.ops.length === 1 ? "" : "s"}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="primary" onClick={propose} loading={thinking} disabled={text.trim().length < 4}><Sparkles className="h-3.5 w-3.5" aria-hidden />Plan changes</Button>
      )}>
      {!proposal ? (
        <div className="flex flex-col gap-3">
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What should change? e.g. Move Paytm to In conversation…" aria-label="Instruction for Munshi"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim().length >= 4) { e.preventDefault(); propose(); } }} />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setText(x)} className="rounded-full neo-raised-sm px-3 py-1 text-left text-xs text-ink-2 hover:text-oxblood">{x}</button>)}
          </div>
          {thinking && <p className="text-xs text-ink-3">Munshi is reading the repository and planning the changes…</p>}
          {err && !thinking && (
            <div role="alert" className="flex items-start gap-1.5 rounded-neo-sm bg-danger/10 px-3 py-2.5 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{err}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink">{proposal.summary}</p>
          {proposal.questions.length > 0 && (
            <div className="rounded-neo-sm bg-buttercream/60 px-3 py-2.5 text-xs text-ink">
              <div className="mb-1 flex items-center gap-1.5 font-medium"><CircleHelp className="h-3.5 w-3.5" aria-hidden />Munshi needs to know</div>
              <ul className="list-disc pl-5">{proposal.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
          {!proposal.valid && proposal.error && (
            <div className="rounded-neo-sm bg-danger/10 px-3 py-2.5 text-xs text-danger">
              <div className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />These changes fail validation and can&apos;t be applied</div>
              <pre className="whitespace-pre-wrap font-sans">{proposal.error}</pre>
            </div>
          )}
          {proposal.ops.length === 0 && <p className="text-sm text-ink-3">No changes proposed.</p>}
          <ol className="flex flex-col gap-2">
            {proposal.ops.map((op, i) => <OpCard key={i} op={op} reason={proposal.reasons[i]} idx={idx} result={proposal.validation[i]} />)}
          </ol>
          <p className="text-[0.6875rem] text-ink-3">Planned by {proposal.model}. Applied changes are logged as Munshi in each row&apos;s history and can be undone.</p>
        </div>
      )}
    </Modal>
  );
}

function OpCard({ op, reason, idx, result }: { op: Op; reason: string; idx: Index; result?: { ok: boolean; error?: string; warnings?: string[]; key: string | null } }) {
  const def = sheetDef(op.sheet);
  const Icon = op.op === "insert" ? Plus : op.op === "delete" ? Minus : Pencil;
  const target = op.op !== "insert" && "key" in op ? idx.byKey.get(op.sheet)?.get(op.key) ?? null : null;
  const data = op.op === "insert" || op.op === "update" ? op.data : {};
  return (
    <li className={cn("rounded-neo-sm neo-inset-sm px-3 py-2.5 text-sm", result && !result.ok && "ring-1 ring-danger/40")}>
      <div className="flex items-center gap-2">
        <span className={cn("grid h-5 w-5 place-items-center rounded-full", op.op === "delete" ? "bg-danger/15 text-danger" : "bg-oxblood/15 text-oxblood")}><Icon className="h-3 w-3" aria-hidden /></span>
        <span className="font-medium capitalize text-ink">{op.op}</span>
        <span className="text-xs text-ink-3">{op.sheet.replace(/_/g, " ")}</span>
        <span className="font-mono text-xs text-ink-2">{op.op === "insert" ? result?.key ?? "new" : "key" in op ? op.key : ""}</span>
      </div>
      {Object.keys(data).length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 pl-7 text-xs">
          {Object.entries(data).map(([k, v]) => {
            const c = colByKey(def, k) ?? def.columns.find((x) => x.header.toLowerCase() === k.toLowerCase());
            const before = target && c ? displayValue(idx, c, target.data[c.key], target) : "";
            const after = c ? displayValue(idx, c, v, target ?? undefined) : String(v ?? "");
            return (
              <li key={k} className="truncate text-ink-3">
                <span className="text-ink-2">{c?.header.replace(/ ID$/, "") ?? k}:</span>{" "}
                {op.op === "update" && <><s>{before || "∅"}</s> → </>}<span className="text-ink">{after || "∅"}</span>
              </li>
            );
          })}
        </ul>
      )}
      {reason && <p className="mt-1.5 pl-7 text-xs text-ink-3">{reason}</p>}
      {result?.error && <p className="mt-1 pl-7 text-xs text-danger">{result.error}</p>}
      {result?.warnings?.length ? <p className="mt-1 pl-7 text-xs text-warning">{result.warnings.join("; ")}</p> : null}
    </li>
  );
}

