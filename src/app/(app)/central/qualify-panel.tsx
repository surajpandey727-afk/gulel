"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { refreshSoon } from "@/components/orgs/refresh";
import { Button } from "@/components/neo/button";
import { Meter } from "@/components/neo/gauge";
import { Panel } from "@/components/neo/surface";
import { linkRepositoryAction, qualifyRepositoryAction } from "./actions";

export interface Progress { total: number; linked: number; withLinkedIn: number; qualified: number; queued: number; lastError: string | null }

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Board → gulel: every repository organisation linked, its LinkedIn found, and qualified. */
export function QualifyPanel({ p, canWrite }: { p: Progress; canWrite: boolean }) {
  const router = useRouter();
  const [linking, startLink] = useTransition();
  const [queueing, startQueue] = useTransition();
  const keyProblem = p.lastError && /x-api-key|authentication|api key|provider/i.test(p.lastError);

  const link = () => startLink(async () => {
    const r = await linkRepositoryAction();
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message);
    if (r.data.errors.length) toast.warning(`${r.data.errors.length} need attention: ${r.data.errors.slice(0, 2).join("; ")}`);
    refreshSoon(router);
  });
  const queue = (requalify: boolean) => startQueue(async () => {
    const r = await qualifyRepositoryAction(requalify);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message);
    refreshSoon(router);
  });

  return (
    <Panel title="Qualification" eyebrow="Board organisations in gulel" id="qualify"
      actions={canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={link} loading={linking}><Link2 className="h-3.5 w-3.5" aria-hidden />Link to gulel</Button>
          <Button size="sm" variant="primary" onClick={() => queue(false)} loading={queueing}><Sparkles className="h-3.5 w-3.5" aria-hidden />Find LinkedIn &amp; qualify all</Button>
          <Button size="sm" onClick={() => queue(true)} disabled={queueing}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Re-qualify</Button>
        </div>
      ) : null}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-3">Linked to a gulel organisation</span>
          <span className="text-lg font-semibold tabular text-ink">{p.linked}<span className="text-sm font-normal text-ink-3"> / {p.total}</span></span>
          <Meter value={pct(p.linked, p.total)} label="Linked" showValue={false} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-3">LinkedIn page found</span>
          <span className="text-lg font-semibold tabular text-ink">{p.withLinkedIn}<span className="text-sm font-normal text-ink-3"> / {p.linked}</span></span>
          <Meter value={pct(p.withLinkedIn, p.linked)} label="LinkedIn" showValue={false} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-3">Qualified</span>
          <span className="text-lg font-semibold tabular text-ink">{p.qualified}<span className="text-sm font-normal text-ink-3"> / {p.linked}</span></span>
          <Meter value={pct(p.qualified, p.linked)} label="Qualified" showValue={false} />
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        {p.queued ? `${p.queued} jobs running in the background. This page shows the latest when you refresh. ` : ""}
        Archived organisations are skipped. Scores and bands appear on each organisation, on the <Link href="/qualification" className="underline-offset-2 hover:underline">Qualification</Link> page and in the board&apos;s row panel.
      </p>
      {p.lastError && (
        <div className="mt-3 flex items-start gap-2 rounded-neo-sm bg-danger/10 px-3 py-2.5 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{keyProblem
            ? <>The AI provider rejected gulel&apos;s Anthropic key, so LinkedIn search and qualification can&apos;t run. Paste the current key in <Link href="/settings/providers" className="font-medium underline">Settings → Providers</Link>, then press Find LinkedIn &amp; qualify all again.</>
            : <>Last failure: {p.lastError.slice(0, 240)}</>}</span>
        </div>
      )}
    </Panel>
  );
}
