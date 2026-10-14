"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/neo/segmented";

export function BandFilter({ value }: { value: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <Segmented label="Band" size="sm" value={value as "all"} onChange={(v) => { const n = new URLSearchParams(params); if (v === "all") n.delete("band"); else n.set("band", v); router.replace(`${path}?${n}`); }}
      options={[{ value: "all", label: "All" }, { value: "priority_review", label: "85+" }, { value: "qualified", label: "70–84" }, { value: "nurture", label: "50–69" }, { value: "low_priority", label: "<50" }]} />
  );
}
