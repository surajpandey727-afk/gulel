"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Select, Textarea, Input } from "@/components/neo/field";
import { Badge } from "@/components/neo/badge";
import { EmptyState, Panel } from "@/components/neo/surface";
import { addPreferenceAction, addSampleAction, deleteSampleAction, reExtractVoiceAction, rollbackVoiceAction } from "../actions";

type Version = { id: string; version_no: number; source: string; dna: Record<string, unknown>; generation_prompt: string; examples: Array<{ excerpt: string; why: string }>; preferences: string[]; created_at: string };

export function VoiceSettings({ activeId, versions, samples, feedback }: { activeId: string | null; versions: Version[]; samples: Array<{ id: string; kind: string; title: string | null; body: string; created_at: string }>; feedback: Array<{ id: string; disposition: string; preference_text: string | null; created_at: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pref, setPref] = useState("");
  const [sample, setSample] = useState({ kind: "email", body: "" });
  const active = versions.find((v) => v.id === activeId) ?? versions[0];
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? `✓ ${r.message ?? "Done."}` : `⚠ ${r.error}`); router.refresh(); });
  const dna = (active?.dna ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className="rounded-neo neo-inset-sm px-4 py-2.5 text-sm">{msg}</p>}
      <Panel title={`Active Voice DNA · v${active?.version_no}`} eyebrow={active?.source === "default" ? "Provisional default — add your samples" : `${active?.source} · ${new Date(active?.created_at ?? "").toLocaleDateString("en-GB")}`}
        actions={<Button size="sm" variant="primary" loading={pending} disabled={!samples.length} onClick={() => run(reExtractVoiceAction)}><Sparkles className="h-4 w-4" /> Re-extract from samples</Button>}>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Compact generation prompt</p>
            <p className="rounded-neo neo-inset-sm p-4 text-sm leading-relaxed text-ink-2">{active?.generation_prompt}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            {Object.entries(dna).filter(([, v]) => typeof v === "string").slice(0, 10).map(([k, v]) => (
              <div key={k}><dt className="eyebrow">{k.replace(/_/g, " ")}</dt><dd className="mt-0.5 text-ink-2">{v as string}</dd></div>
            ))}
          </dl>
          {Object.entries(dna).filter(([, v]) => Array.isArray(v) && (v as string[]).length).map(([k, v]) => (
            <div key={k}><p className="eyebrow mb-1.5">{k.replace(/_/g, " ")}</p><ul className="flex flex-wrap gap-1.5">{(v as string[]).map((x, i) => <li key={i}><Badge tone={/reject|avoid/.test(k) ? "warning" : "neutral"} icon={false}>{x}</Badge></li>)}</ul></div>
          ))}
          {!!active?.examples?.length && <div className="md:col-span-2"><p className="eyebrow mb-1.5">Representative excerpts</p><ul className="flex flex-col gap-2">{active.examples.map((e, i) => <li key={i} className="border-l-2 border-oxblood/40 pl-3 text-sm italic text-ink-2">“{e.excerpt}” <span className="not-italic text-xs text-ink-3">— {e.why}</span></li>)}</ul></div>}
        </div>
      </Panel>

      <Panel title="Writing preferences" eyebrow="Explicit corrections override the extracted profile">
        <ul className="mb-3 flex flex-col gap-2">{(active?.preferences ?? []).map((p, i) => <li key={i} className="rounded-neo neo-inset-sm px-3 py-2 text-sm">{p}</li>)}</ul>
        {!active?.preferences?.length && <p className="mb-3 text-sm text-ink-3">None yet. Edits you choose to “save as writing preference” appear here.</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addPreferenceAction(pref)); setPref(""); }}>
          <Input aria-label="New preference" value={pref} onChange={(e) => setPref(e.target.value)} placeholder="e.g. Never open with “I hope you’re well”." />
          <Button type="submit" disabled={pref.trim().length < 5}>Add</Button>
        </form>
        {!!feedback.length && <details className="mt-4 text-xs text-ink-3"><summary className="cursor-pointer">Edit feedback history ({feedback.length})</summary><ul className="mt-2 space-y-1">{feedback.map((f) => <li key={f.id}>{new Date(f.created_at).toLocaleDateString("en-GB")} · {f.disposition.replace(/_/g, " ")}{f.preference_text ? ` — “${f.preference_text}”` : ""}</li>)}</ul></details>}
      </Panel>

      <Panel title="Writing samples" eyebrow="Private and editable">
        <form className="mb-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addSampleAction(sample.kind, sample.body)); setSample({ kind: sample.kind, body: "" }); }}>
          <div className="flex gap-2"><Select aria-label="Sample type" value={sample.kind} onChange={(e) => setSample((s) => ({ ...s, kind: e.target.value }))} className="max-w-xs">
            {["email", "linkedin", "introduction", "observation", "proposal", "principles", "dislike", "other"].map((k) => <option key={k} value={k}>{k === "dislike" ? "Writing I dislike" : k}</option>)}
          </Select><Button type="submit" disabled={sample.body.trim().length < 20}>Add sample</Button></div>
          <Textarea aria-label="Sample text" value={sample.body} onChange={(e) => setSample((s) => ({ ...s, body: e.target.value }))} placeholder="Paste a piece of your writing…" />
        </form>
        {samples.length ? <ul className="flex flex-col gap-2">{samples.map((s) => (
          <li key={s.id} className="flex items-start gap-3 rounded-neo neo-inset-sm p-3 text-sm">
            <Badge tone={s.kind === "dislike" ? "warning" : "neutral"} icon={false}>{s.kind}</Badge>
            <p className="line-clamp-3 flex-1 text-ink-2">{s.body}</p>
            <IconButton label="Delete sample" size="iconSm" onClick={() => run(() => deleteSampleAction(s.id))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
          </li>))}</ul> : <EmptyState title="No samples" />}
      </Panel>

      <Panel title="Version history" eyebrow="Rollback creates a new version — history is immutable">
        <ul className="flex flex-col gap-2">{versions.map((v) => (
          <li key={v.id} className="flex items-center gap-3 rounded-neo px-3 py-2 text-sm hover:bg-raised/60">
            <span className="tabular font-medium">v{v.version_no}</span><span className="text-ink-3">{v.source}</span><span className="text-xs text-ink-3">{new Date(v.created_at).toLocaleString("en-GB")}</span>
            <span className="flex-1" />{v.id === activeId ? <Badge tone="positive">active</Badge> : <Button size="sm" variant="ghost" onClick={() => run(() => rollbackVoiceAction(v.id))}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button>}
          </li>))}</ul>
      </Panel>
    </div>
  );
}
