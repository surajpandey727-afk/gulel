"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/neo/button";
import { Slider } from "@/components/neo/controls";
import { Field, Input } from "@/components/neo/field";
import { Badge } from "@/components/neo/badge";
import { Panel } from "@/components/neo/surface";
import { DIMENSIONS, validateWeights } from "@/lib/scoring/model";
import { saveScoringAction } from "../actions";

type Model = { id: string; version_no: number; weights: Record<string, number>; qualified_threshold: number; freshness_half_life_days: number; is_active: boolean; notes: string | null; created_at: string };

export function ScoringEditor({ active, history, isOwner }: { active: Model; history: Model[]; isOwner: boolean }) {
  const router = useRouter();
  const [w, setW] = useState<Record<string, number>>(active.weights);
  const [threshold, setThreshold] = useState(active.qualified_threshold);
  const [halfLife, setHalfLife] = useState(active.freshness_half_life_days);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const err = validateWeights(w);
  return (
    <div className="flex flex-col gap-6">
      <Panel title={`Weights · v${active.version_no}`} eyebrow="Published weighted rules · operating thresholds, not validated classifications"
        actions={<Badge tone={total === 100 ? "positive" : "critical"}>Total {total}/100</Badge>}>
        <div className="grid gap-5 md:grid-cols-2">
          {DIMENSIONS.map((d) => <Slider key={d.key} label={d.label} value={w[d.key] ?? 0} max={40} onValueChange={(v) => setW((x) => ({ ...x, [d.key]: v }))} />)}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Slider label="Qualified threshold" value={threshold} onValueChange={setThreshold} min={40} max={95} />
          <Slider label="Evidence freshness half-life (days)" value={halfLife} onValueChange={setHalfLife} min={30} max={720} step={15} />
          <Field label="Change note" className="md:col-span-2"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why are you changing the weights?" /></Field>
        </div>
        {err && <p className="mt-3 text-sm text-oxblood">⚠ {err}</p>}
        {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
        <div className="mt-4 flex gap-2">
          <Button variant="primary" disabled={!!err || !isOwner} loading={pending} onClick={() => start(async () => { const r = await saveScoringAction(w, threshold, halfLife, notes); setMsg(r.ok ? `✓ ${r.message}` : `⚠ ${r.error}`); router.refresh(); })}>Save as new version</Button>
          <Button variant="ghost" onClick={() => { setW(active.weights); setThreshold(active.qualified_threshold); setHalfLife(active.freshness_half_life_days); }}>Reset</Button>
        </div>
        <p className="mt-4 text-xs text-ink-3">Bands: 85–100 priority review · 70–84 qualified · 50–69 nurture/investigate · &lt;50 low priority. Unknown dimensions are excluded from the score and reduce coverage. Engagement propensity stays a heuristic until enough outcomes exist to calibrate it.</p>
      </Panel>
      <Panel title="Version history">
        <ul className="flex flex-col gap-2 text-sm">{history.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3"><span className="tabular font-medium">v{m.version_no}</span>{m.is_active && <Badge tone="positive">active</Badge>}<span className="text-xs text-ink-3">{new Date(m.created_at).toLocaleString("en-GB")} · threshold {m.qualified_threshold}</span><span className="text-xs text-ink-2">{m.notes}</span></li>
        ))}</ul>
      </Panel>
    </div>
  );
}
