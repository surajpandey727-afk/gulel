import { Info } from "lucide-react";
import { Tip } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import { KPI_DEFINITIONS, type KpiKey } from "@/lib/metrics";

export function Kpi({ k, value, sub, emphasis = false }: { k: KpiKey; value: React.ReactNode; sub?: React.ReactNode; emphasis?: boolean }) {
  const d = KPI_DEFINITIONS[k];
  return (
    <div className={cn("flex min-w-0 flex-col justify-between gap-2 rounded-neo-lg p-4", emphasis ? "neo-accent" : "neo-raised")}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-xs font-medium leading-snug", emphasis ? "text-ivory/85" : "text-ink-3")}>{d.label}</span>
        <Tip content={<><strong className="block">{d.label}</strong>{d.def}<span className="mt-1 block opacity-70">Level: {d.level}</span></>}>
          <button type="button" aria-label={`Definition of ${d.label}`} className={cn("rounded-full", emphasis ? "text-ivory/70" : "text-ink-3 hover:text-ink")}>
            <Info className="h-3.5 w-3.5" />
          </button>
        </Tip>
      </div>
      <div className={cn("tabular text-[1.65rem] font-semibold leading-none tracking-tight", emphasis ? "text-ivory" : "text-ink")}>{value}</div>
      {sub && <div className={cn("text-[0.7rem] leading-snug", emphasis ? "text-ivory/75" : "text-ink-3")}>{sub}</div>}
    </div>
  );
}
