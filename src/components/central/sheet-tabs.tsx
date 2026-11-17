import Link from "next/link";
import { cn } from "@/components/neo/cn";

export const TAB_GROUPS: { label: string; sheets: { name: string; label: string }[] }[] = [
  { label: "Pipeline", sheets: [{ name: "Pipeline_India", label: "India" }, { name: "Pipeline_Global", label: "Global" }] },
  { label: "Partners", sheets: [{ name: "Partners_India", label: "India" }, { name: "Partners_Global", label: "Global" }] },
  { label: "Delivery", sheets: [{ name: "Projects", label: "Projects" }, { name: "ProjectServices", label: "Services" }, { name: "Finances", label: "Finances" }, { name: "Credentials", label: "Credentials" }] },
  { label: "People", sheets: [{ name: "Organisations", label: "Organisations" }, { name: "Contacts", label: "Contacts" }, { name: "Freelancers", label: "Freelancers" }] },
  { label: "Activity", sheets: [{ name: "Interactions", label: "Interactions" }, { name: "Tasks", label: "Tasks" }] },
];

/** The sheet switcher above a board (Pipeline, Partners, Delivery, People, Activity). */
export function SheetTabs({ sheet, counts }: { sheet: string; counts: Record<string, number> }) {
  return (
    <nav aria-label="Sheets" className="flex gap-x-5 gap-y-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {TAB_GROUPS.map((g) => (
        <div key={g.label} className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3">{g.label}</span>
          {g.sheets.map((t) => {
            const active = t.name === sheet;
            return (
              <Link key={t.name} href={`/central/board/${t.name}`} aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all", active ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:text-ink")}>
                {t.label}<span className={cn("tabular text-[0.625rem]", active ? "text-oxblood/70" : "text-ink-3")}>{counts[t.name] ?? 0}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
