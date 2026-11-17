import Link from "next/link";
import { Briefcase, Handshake, MessagesSquare, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/components/neo/cn";

export const TAB_GROUPS: { label: string; icon: LucideIcon; sheets: { name: string; label: string }[] }[] = [
  { label: "Pipeline", icon: TrendingUp, sheets: [{ name: "Pipeline_India", label: "India" }, { name: "Pipeline_Global", label: "Global" }] },
  { label: "Partners", icon: Handshake, sheets: [{ name: "Partners_India", label: "India" }, { name: "Partners_Global", label: "Global" }] },
  { label: "Delivery", icon: Briefcase, sheets: [{ name: "Projects", label: "Projects" }, { name: "ProjectServices", label: "Services" }, { name: "Finances", label: "Finances" }, { name: "Credentials", label: "Credentials" }] },
  { label: "People", icon: Users, sheets: [{ name: "Organisations", label: "Organisations" }, { name: "Contacts", label: "Contacts" }, { name: "Freelancers", label: "Freelancers" }] },
  { label: "Activity", icon: MessagesSquare, sheets: [{ name: "Interactions", label: "Interactions" }, { name: "Tasks", label: "Tasks" }] },
];

/**
 * The sheet switcher above a board. Each family (Pipeline, Partners, Delivery, People, Activity) is its own
 * recessed segment with an icon, so the groups read apart at a glance; segments wrap instead of scrolling.
 */
export function SheetTabs({ sheet, counts }: { sheet: string; counts: Record<string, number> }) {
  return (
    <nav aria-label="Sheets" className="flex flex-wrap gap-2">
      {TAB_GROUPS.map((g) => {
        const current = g.sheets.some((t) => t.name === sheet);
        return (
          <div key={g.label} role="group" aria-label={g.label} className={cn("flex min-w-0 items-center gap-0.5 rounded-full p-1 neo-inset-sm", current && "ring-1 ring-oxblood/20")}>
            <span className={cn("flex items-center gap-1.5 pl-2 pr-1.5 text-[0.625rem] font-semibold uppercase tracking-wider", current ? "text-oxblood" : "text-ink-3")}>
              <g.icon className="h-3.5 w-3.5" aria-hidden />{g.label}
            </span>
            {g.sheets.map((t) => {
              const active = t.name === sheet;
              return (
                <Link key={t.name} href={`/central/board/${t.name}`} aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all", active ? "bg-canvas neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:bg-raised/80 hover:text-ink")}>
                  {t.label}
                  <span className={cn("rounded-full px-1.5 text-[0.625rem] tabular", active ? "bg-oxblood/10 text-oxblood" : "bg-ink-3/10 text-ink-3")}>{counts[t.name] ?? 0}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
