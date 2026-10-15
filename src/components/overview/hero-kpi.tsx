import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/components/neo/cn";

type Delta = { value: string; direction: "up" | "down" | "flat" };

export function HeroKpi({ label, value, delta, className }: { label: string; value: React.ReactNode; delta?: Delta; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-[20px] p-[18px] neo-raised cursor-pointer", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[0.76rem] font-medium text-ink-3">{label}</span>
        {delta && (
          <span className={cn("inline-flex items-center gap-1 text-[0.72rem] font-semibold", delta.direction === "up" ? "text-positive" : delta.direction === "down" ? "text-danger" : "text-ink-3")}>
            {delta.direction === "up" ? <TrendingUp className="h-[13px] w-[13px]" /> : delta.direction === "down" ? <TrendingDown className="h-[13px] w-[13px]" /> : <Minus className="h-[13px] w-[13px]" />}
            {delta.value}
          </span>
        )}
      </div>
      <div className="tabular text-[1.8rem] font-semibold leading-none tracking-tight text-ink">{value}</div>
    </div>
  );
}
