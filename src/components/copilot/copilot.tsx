"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, ListPlus, Sparkles, X, Search, FileText, MessageSquare, Shield, ClipboardList } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Drawer } from "@/components/neo/controls";
import { Textarea } from "@/components/neo/field";
import { Surface } from "@/components/neo/surface";
import { cn } from "@/components/neo/cn";
import type { AnalystOutput } from "@/lib/ai/agents/analyst";
import { ask, insightToTask, setInsightStatus } from "./actions";

const AGENTS = [
  { key: "sutradhar", label: "Sutradhar", icon: Sparkles, desc: "Orchestrate & answer" },
  { key: "taftish", label: "Taftish", icon: Search, desc: "Deep research" },
  { key: "chanakya", label: "Chanakya", icon: FileText, desc: "Strategic analysis" },
  { key: "doot", label: "Doot", icon: MessageSquare, desc: "Outreach drafting" },
  { key: "mariyada", label: "Mariyada", icon: Shield, desc: "Governance" },
  { key: "chitragupta", label: "Chitragupta", icon: ClipboardList, desc: "Audit log" },
] as const;

const SUGGESTIONS = [
  "Which five companies should I approach today?",
  "Which pending drafts are most commercially relevant?",
  "What is preventing conversion into meetings?",
  "What are the next three most useful decisions?",
];
const HREF: Record<string, string> = { organisation: "/organisations/", contact: "/people/", draft: "/outreach/", conversation: "/inbox?c=", opportunity: "/pipeline?o=" };

export function Copilot() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("sutradhar");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ id: string; a: AnalystOutput; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = (question: string) =>
    start(async () => {
      setError(null); setSaved(null);
      const r = await ask(question, agent);
      if (r.ok) setResult({ id: r.insightId, a: r.answer, model: r.model });
      else setError(r.error);
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ask Sutradhar"
        className="fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full neo-accent transition-transform hover:-translate-y-0.5 lg:bottom-6">
        <Sparkles className="h-5 w-5" />
      </button>
      <Drawer open={open} onOpenChange={setOpen} title="Sutradhar">
        <p className="mb-3 text-xs text-ink-3">Your AI orchestrator. Delegates to specialist agents and answers from live records — never acts without your approval.</p>

        {/* Agent specialist chips */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {AGENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAgent(a.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.72rem] font-medium transition-all",
                agent === a.key ? "neo-raised-sm text-oxblood" : "text-ink-3 hover:text-ink-2",
              )}
            >
              <a.icon className="h-3.5 w-3.5" aria-hidden />
              {a.label}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="flex flex-col gap-2">
          <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask ${AGENTS.find((a) => a.key === agent)?.label ?? "Sutradhar"}…`} className="min-h-20" aria-label="Question" />
          <Button type="submit" variant="primary" loading={pending} disabled={q.trim().length < 4}>Ask</Button>
        </form>
        {!result && !pending && (
          <div className="mt-4 flex flex-col gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => { setQ(s); submit(s); }} className="rounded-neo neo-raised-sm px-3 py-2 text-left text-sm text-ink-2 hover:text-ink">{s}</button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-danger">⚠ {error}</p>}
        {result && (
          <Surface elevation="sm" className="mt-5 flex flex-col gap-4 p-4 text-sm">
            <p className="font-medium leading-relaxed text-ink">{result.a.conclusion}</p>
            {result.a.numbers.length > 0 && (
              <dl className="grid grid-cols-2 gap-2">
                {result.a.numbers.map((n, i) => (
                  <div key={i} className="rounded-neo neo-inset-sm p-2.5">
                    <dt className="text-[0.7rem] text-ink-3">{n.label}</dt>
                    <dd className="tabular font-semibold">{n.value}</dd>
                    {n.denominator && <dd className="text-[0.65rem] text-ink-3">of {n.denominator}</dd>}
                  </div>
                ))}
              </dl>
            )}
            {result.a.records.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {result.a.records.map((r) => (
                  <li key={r.id}><Link href={`${HREF[r.type]}${r.id}`} className="font-medium text-oxblood underline-offset-2 hover:underline">{r.label}</Link> <span className="text-ink-3">— {r.why}</span></li>
                ))}
              </ul>
            )}
            {result.a.caveats.length > 0 && <details><summary className="cursor-pointer text-xs text-ink-3">Caveats ({result.a.caveats.length})</summary><ul className="mt-2 list-disc pl-5 text-xs text-ink-3">{result.a.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
            <p className="rounded-neo px-3 py-2 neo-inset-sm text-ink"><span className="eyebrow mr-2 text-oxblood">Next</span>{result.a.next_action}</p>
            <div className="flex items-center gap-2">
              <IconButton label="Save insight" size="iconSm" onClick={() => start(async () => { await setInsightStatus(result.id, "saved"); setSaved("Saved to Intelligence"); })}><Bookmark className="h-4 w-4" /></IconButton>
              <IconButton label="Convert to task" size="iconSm" onClick={() => start(async () => { await insightToTask(result.id); setSaved("Task created"); })}><ListPlus className="h-4 w-4" /></IconButton>
              <IconButton label="Dismiss" size="iconSm" onClick={() => start(async () => { await setInsightStatus(result.id, "dismissed"); setResult(null); })}><X className="h-4 w-4" /></IconButton>
              <span className="ml-auto text-[0.65rem] text-ink-3">{saved ?? `anthropic · ${result.model}`}</span>
            </div>
          </Surface>
        )}
      </Drawer>
    </>
  );
}
