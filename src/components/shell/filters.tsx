"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/neo/segmented";

export type MarketFilter = "ALL" | "UK" | "IN";
export type RangeFilter = "1d" | "7d" | "30d" | "90d";

/** Global filter context lives in the URL so every module and every reload agree. */
export function GlobalFilters({ showRange = true }: { showRange?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const market = (params.get("m") ?? "ALL") as MarketFilter;
  const range = (params.get("r") ?? "30d") as RangeFilter;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    router.replace(`${path}?${next}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Market" size="sm" value={market} onChange={(v) => set("m", v)}
        options={[{ value: "ALL", label: "Both" }, { value: "UK", label: "UK" }, { value: "IN", label: "India" }]} />
      {showRange && (
        <Segmented label="Date range" size="sm" value={range} onChange={(v) => set("r", v)}
          options={[{ value: "1d", label: "Today" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" }]} />
      )}
    </div>
  );
}
