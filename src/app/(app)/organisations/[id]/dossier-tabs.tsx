"use client";
import { cn } from "@/components/neo/cn";
import { useTab } from "./dossier-shell";

export function DossierTabs({ tabs }: { tabs: Array<{ value: string; label: string; count?: number }> }) {
  const { active, set } = useTab();
  return (
    <div role="tablist" aria-label="Dossier sections" className="flex max-w-full gap-1 overflow-x-auto rounded-full neo-inset-sm p-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={t.value === active}
          onClick={() => set(t.value)}
          className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all", t.value === active ? "neo-raised-sm text-oxblood" : "text-ink-2 hover:text-ink")}>
          {t.label}
          {t.count ? <span className="tabular rounded-full bg-sunken px-1.5 text-[0.65rem] text-ink-3">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
