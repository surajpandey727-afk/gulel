"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Tip } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import type { RunRow, Section } from "@/lib/research/section";
import { researchSectionAction } from "./research-actions";

const LABEL: Record<Section, string> = { financials: "Financials", brand: "Brand", commercial: "Commercial", signals: "Signals" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const TONE: Record<RunRow["status"], { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  populated: { icon: CheckCircle2, cls: "text-positive" },
  partial: { icon: AlertTriangle, cls: "text-warning" },
  nothing_new: { icon: Info, cls: "text-ink-2" },
  not_found: { icon: CircleDashed, cls: "text-ink-3" },
  failed: { icon: AlertTriangle, cls: "text-oxblood" },
  running: { icon: Loader2, cls: "text-ink-2" },
};

/** The section's research control: one button, and one line saying when it was last tried and what actually happened. */
export function SectionResearch({ organisationId, section, last, canWrite }: { organisationId: string; section: Section; last: RunRow | null; canWrite: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState(last);
  useEffect(() => setRun(last), [last]);
  const [pending, start] = useTransition();
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!pending) return setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const elsewhere = run?.status === "running" && Date.now() - Date.parse(run.started_at) < 6 * 60_000;
  const go = () => start(async () => {
    const r = await researchSectionAction(organisationId, section);
    if (!r.ok) { toast.error(r.error); return; }
    setRun(r.data);
    if (r.data.status === "failed") toast.error(r.data.message ?? "Research unsuccessful");
    else toast.success(r.data.message ?? `${LABEL[section]} checked`);
    router.refresh();
  });

  const tone = run ? TONE[run.status] : null;
  const checked = run?.sources_checked ?? {};
  const detail = run && run.status !== "running"
    ? [`Checked ${checked.notes ?? 0} notes, ${checked.documents ?? 0} documents, ${checked.earlier_research ?? 0} earlier research items, ${checked.news ?? 0} news items and ${checked.repository_rows ?? 0} repository rows`,
       checked.web_results ? `searched the web (${checked.web_results} results)` : "no web search needed",
       `at ${time(run.finished_at ?? run.started_at)}`].join("; ")
    : null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-neo neo-inset-sm px-3.5 py-2.5">
      <p role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2 text-xs">
        {pending ? (
          <><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-oxblood" aria-hidden /><span className="text-ink-2">Researching {LABEL[section].toLowerCase()}: notes, documents and earlier research first, then the web if needed… <span className="tabular text-ink-3">{secs}s</span></span></>
        ) : elsewhere ? (
          <><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-3" aria-hidden /><span className="text-ink-2">Research in progress (started {time(run!.started_at)}). Refresh in a minute to see the result.</span></>
        ) : run && tone ? (
          <Tip content={detail ?? ""}>
            <span className="flex min-w-0 cursor-help items-start gap-2">
              <tone.icon className={cn("mt-px h-3.5 w-3.5 shrink-0", tone.cls)} aria-hidden />
              <span className="min-w-0 text-ink-2"><span className="font-medium text-ink">Last checked: {day(run.started_at)}</span><span className="mx-1.5 text-ink-3">|</span>{run.message ?? run.status}</span>
            </span>
          </Tip>
        ) : (
          <><Search className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden /><span className="text-ink-3">Not researched on its own yet. Research checks this organisation&apos;s notes, documents and earlier research first, then the web only for what&apos;s missing.</span></>
        )}
      </p>
      {canWrite && (
        <Tip content={`Research ${LABEL[section]} only. Doesn't touch other sections or re-run qualification.`}>
          <Button size="sm" onClick={go} loading={pending} disabled={elsewhere}>
            {!pending && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}{run ? "Retry research" : `Research ${LABEL[section].toLowerCase()}`}
          </Button>
        </Tip>
      )}
    </div>
  );
}

/**
 * Research coverage on the Summary tab: each section's item count and last outcome, plus one button that researches every
 * empty section in turn (each section still runs on its own; nothing triggers requalification).
 */
export function ResearchCoverage({ organisationId, counts, runs, canWrite }: { organisationId: string; counts: Record<Section, number>; runs: Partial<Record<Section, RunRow>>; canWrite: boolean }) {
  const router = useRouter();
  const sections: Section[] = ["financials", "brand", "commercial", "signals"];
  const empty = sections.filter((s) => counts[s] === 0);
  const [state, setState] = useState<Partial<Record<Section, RunRow | "running" | "error">>>({});
  const [busy, setBusy] = useState(false);
  const runAll = async () => {
    setBusy(true);
    let added = 0;
    for (const s of empty) {
      setState((x) => ({ ...x, [s]: "running" }));
      const r = await researchSectionAction(organisationId, s);
      if (r.ok) { added += r.data.added; setState((x) => ({ ...x, [s]: r.data })); }
      else { setState((x) => ({ ...x, [s]: "error" })); toast.error(`${LABEL[s]}: ${r.error}`); }
    }
    setBusy(false);
    toast.success(added ? `${added} item${added === 1 ? "" : "s"} added across ${empty.length} section${empty.length === 1 ? "" : "s"}` : "Research finished: nothing new found");
    router.refresh();
  };
  const go = (s: Section) => { window.location.hash = s; };
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {sections.map((s) => {
          const live = state[s];
          const run = typeof live === "object" ? live : runs[s] ?? null;
          const tone = run ? TONE[run.status] : null;
          return (
            <li key={s}>
              <button type="button" onClick={() => go(s)} className="flex w-full flex-col gap-1 rounded-neo neo-inset-sm px-3.5 py-2.5 text-left hover:text-ink">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{LABEL[s]}</span>
                  <span className={cn("tabular rounded-full px-2 text-[0.6875rem]", counts[s] ? "bg-oxblood/10 text-oxblood" : "bg-ink-3/10 text-ink-3")}>{counts[s] ? `${counts[s]} item${counts[s] === 1 ? "" : "s"}` : "empty"}</span>
                </span>
                <span className="flex items-start gap-1.5 text-[0.6875rem] text-ink-3">
                  {live === "running" ? <><Loader2 className="mt-px h-3 w-3 shrink-0 animate-spin text-oxblood" aria-hidden />Researching…</>
                    : live === "error" ? <><AlertTriangle className="mt-px h-3 w-3 shrink-0 text-oxblood" aria-hidden />Research unsuccessful</>
                    : run && tone ? <><tone.icon className={cn("mt-px h-3 w-3 shrink-0", tone.cls)} aria-hidden /><span className="line-clamp-2">{day(run.started_at)}: {run.message}</span></>
                    : "Not researched on its own yet"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.6875rem] text-ink-3">{empty.length ? `${empty.length} empty section${empty.length === 1 ? "" : "s"}. Each is researched on its own: notes and records first, then the web.` : "Every section has findings. Use Retry research on a section's tab to look again."}</span>
          <Button size="sm" variant="primary" onClick={() => void runAll()} loading={busy} disabled={!empty.length}>
            {!busy && <Search className="h-3.5 w-3.5" aria-hidden />}Research all empty sections{empty.length ? ` (${empty.length})` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
