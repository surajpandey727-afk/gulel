"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Select, Textarea } from "@/components/neo/field";
import { Surface } from "@/components/neo/surface";
import { continueWithProvisionalVoice, submitVoiceSamples } from "./actions";

const KINDS = [
  ["email", "Email I wrote"],
  ["linkedin", "LinkedIn message"],
  ["introduction", "Professional introduction"],
  ["observation", "Strategic observation"],
  ["proposal", "Commercial proposal"],
  ["principles", "Messaging principles"],
  ["dislike", "Writing I dislike"],
  ["other", "Other"],
] as const;
type Kind = (typeof KINDS)[number][0];

export function VoiceOnboarding({ existingSamples }: { existingSamples: number }) {
  const router = useRouter();
  const [main, setMain] = useState("");
  const [extra, setExtra] = useState<Array<{ kind: Kind; body: string }>>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string | null; versionNo?: number; notes?: string } | null>(null);
  const [pending, start] = useTransition();
  const totalChars = main.length + extra.reduce((s, e) => s + e.body.length, 0);

  const submit = () =>
    start(async () => {
      const samples = [
        ...(main.trim() ? [{ kind: "email" as Kind, body: main }] : []),
        ...extra.filter((e) => e.body.trim()),
      ];
      const r = await submitVoiceSamples(samples);
      setResult(r);
      if (r.ok) setTimeout(() => router.push("/overview"), 2200);
    });

  return (
    <div className="mt-8 flex flex-col gap-5">
      <Surface elevation="lg" className="p-2">
        <label htmlFor="voice-main" className="sr-only">Your writing samples</label>
        <Textarea
          id="voice-main"
          value={main}
          onChange={(e) => setMain(e.target.value)}
          placeholder={"Paste several pieces of your own writing here. Separate pieces with a blank line.\n\nThe more representative, the better: a cold email you were proud of, a reply to a founder, a note on a brand's positioning…"}
          className="min-h-[340px] rounded-[18px] text-[0.95rem]"
        />
      </Surface>

      {extra.map((e, i) => (
        <Surface key={i} elevation="sm" className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <Select aria-label="Sample type" value={e.kind} onChange={(ev) => setExtra((x) => x.map((s, j) => (j === i ? { ...s, kind: ev.target.value as Kind } : s)))} className="max-w-xs">
              {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <span className="flex-1" />
            <IconButton label="Remove sample" size="iconSm" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconButton>
          </div>
          <Textarea aria-label={`Sample ${i + 2}`} value={e.body} onChange={(ev) => setExtra((x) => x.map((s, j) => (j === i ? { ...s, body: ev.target.value } : s)))}
            placeholder={e.kind === "dislike" ? "Paste writing you dislike: generic agency pitches, AI-sounding emails…" : "Paste the sample…"} />
        </Surface>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="neutral" size="sm" onClick={() => setExtra((x) => [...x, { kind: "linkedin", body: "" }])}><Plus className="h-4 w-4" /> Add a categorised sample</Button>
        <Button variant="neutral" size="sm" onClick={() => setExtra((x) => [...x, { kind: "dislike", body: "" }])}><Plus className="h-4 w-4" /> Add writing I dislike</Button>
        <span className="ml-auto text-xs text-ink-3 tabular">{totalChars.toLocaleString()} characters{existingSamples ? ` · ${existingSamples} saved earlier` : ""}</span>
      </div>

      {result && (
        <Surface elevation="inset" className="p-4 text-sm" role="status">
          {result.ok ? (
            <p className="text-positive">✓ Voice DNA v{result.versionNo} saved and active. {result.notes ? <span className="text-ink-3"> Note: {result.notes}</span> : null} Taking you to the overview…</p>
          ) : (
            <p className="text-oxblood">⚠ {result.message}</p>
          )}
        </Surface>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button type="button" className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
          onClick={() => start(async () => { await continueWithProvisionalVoice(); router.push("/overview"); })}>
          Continue with the provisional voice for now
        </button>
        <Button variant="primary" size="lg" loading={pending} disabled={totalChars < 80} onClick={submit}>
          Analyse my writing
        </Button>
      </div>
    </div>
  );
}
