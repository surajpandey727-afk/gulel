"use client";
import Link from "next/link";
import { useState, useRef, useTransition } from "react";
import {
  Bookmark, ListPlus, Sparkles, X, Search, FileText, MessageSquare,
  Shield, ClipboardList, Mic, Tag, CheckCircle, TrendingUp, Bot,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button, IconButton } from "@/components/neo/button";
import { Drawer } from "@/components/neo/controls";
import { Textarea } from "@/components/neo/field";
import { Surface } from "@/components/neo/surface";
import { cn } from "@/components/neo/cn";
import type { AnalystOutput } from "@/lib/ai/agents/analyst";
import { ask, insightToTask, setInsightStatus } from "./actions";

const AGENTS = [
  { key: "sutradhar", label: "Sutradhar", icon: Bot, desc: "Orchestrate & answer", purpose: "Orchestrate agents and answer founder queries across the system", capabilities: ["Multi-agent delegation", "Cross-system queries", "Contextual answers"] },
  { key: "taftish", label: "Taftish", icon: Search, desc: "Deep research", purpose: "Find, validate and enrich opportunities via deep research", capabilities: ["Company research", "Contact validation", "Opportunity enrichment"] },
  { key: "chanakya", label: "Chanakya", icon: TrendingUp, desc: "Strategic analysis", purpose: "Evaluate intelligence, pipeline trends and strategic next actions", capabilities: ["Pipeline analysis", "Trend detection", "Action prioritisation"] },
  { key: "doot", label: "Doot", icon: MessageSquare, desc: "Outreach drafting", purpose: "Draft, refine and deliver outreach communications", capabilities: ["Email drafts", "Follow-up sequences", "Tone refinement"] },
  { key: "mariyada", label: "Mariyada", icon: Shield, desc: "Governance", purpose: "Enforce governance, compliance and approval policies", capabilities: ["Policy enforcement", "Approval gates", "Compliance checks"] },
  { key: "chitragupta", label: "Chitragupta", icon: ClipboardList, desc: "Audit log", purpose: "Audit trail, memory and system-wide accountability logging", capabilities: ["Activity tracking", "Decision logging", "Accountability trail"] },
  { key: "voice", label: "Voice DNA", icon: Mic, desc: "Writing profile", purpose: "Extract and maintain the founder's writing profile", capabilities: ["Style extraction", "Tone fingerprint", "Voice consistency"] },
  { key: "classifier", label: "Reply classifier", icon: Tag, desc: "Reply triage", purpose: "Propose reply categories for human review", capabilities: ["Category inference", "Priority scoring", "Routing suggestions"] },
  { key: "fidelity", label: "Voice Fidelity", icon: CheckCircle, desc: "Draft scoring", purpose: "Independently score drafts against the founder's voice profile", capabilities: ["Voice scoring", "Tone deviation flags", "Quality gates"] },
] as const;

const SUGGESTIONS = [
  "Which five companies should I approach today?",
  "Which pending drafts are most commercially relevant?",
  "What is preventing conversion into meetings?",
  "What are the next three most useful decisions?",
];
const HREF: Record<string, string> = { organisation: "/organisations/", contact: "/people/", draft: "/outreach/", conversation: "/inbox?c=", opportunity: "/pipeline?o=" };

function AgentTooltip({ agent: a, side = "bottom" }: { agent: typeof AGENTS[number]; side?: "top" | "bottom" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: side === "bottom" ? -4 : 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: side === "bottom" ? -4 : 4, scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        "pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-neo p-3 neo-raised-sm",
        "bg-surface-primary text-ink",
        side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-full neo-inset-sm">
          <a.icon className="h-3.5 w-3.5 text-oxblood" aria-hidden />
        </div>
        <span className="text-xs font-semibold text-ink">{a.label}</span>
      </div>
      <p className="mb-2 text-[0.68rem] leading-relaxed text-ink-2">{a.purpose}</p>
      <div className="flex flex-wrap gap-1">
        {a.capabilities.map((c) => (
          <span key={c} className="rounded-full neo-inset-sm px-2 py-0.5 text-[0.6rem] font-medium text-ink-3">{c}</span>
        ))}
      </div>
    </motion.div>
  );
}

export function Copilot() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("sutradhar");
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ id: string; a: AnalystOutput; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const showTooltip = (key: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredAgent(key), 300);
  };
  const hideTooltip = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredAgent(null);
  };

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
        className="fixed bottom-24 right-5 z-50 grid h-14 w-14 place-items-center rounded-full neo-accent transition-transform hover:-translate-y-0.5 lg:bottom-20">
        <Sparkles className="h-5 w-5" />
      </button>
      <Drawer open={open} onOpenChange={setOpen} title="Sutradhar">
        <p className="mb-3 text-xs text-ink-3">Your AI orchestrator. Delegates to specialist agents and answers from live records — never acts without your approval.</p>

        {/* Agent specialist chips */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {AGENTS.map((a) => (
            <div key={a.key} className="relative" onMouseEnter={() => showTooltip(a.key)} onMouseLeave={hideTooltip}>
              <motion.button
                type="button"
                onClick={() => { setAgent(a.key); hideTooltip(); }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.72rem] font-medium transition-colors",
                  agent === a.key ? "text-oxblood" : "text-ink-3 hover:text-ink-2",
                )}
              >
                {agent === a.key && (
                  <motion.span
                    layoutId="agent-chip-bg"
                    className="absolute inset-0 rounded-full neo-raised-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  />
                )}
                <span className="relative z-[1] flex items-center gap-1.5">
                  <a.icon className="h-3.5 w-3.5" aria-hidden />
                  {a.label}
                </span>
              </motion.button>
              <AnimatePresence>
                {hoveredAgent === a.key && (
                  <AgentTooltip agent={a} />
                )}
              </AnimatePresence>
            </div>
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
