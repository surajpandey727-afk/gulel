"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, RefreshCw, Table2 } from "lucide-react";
import { cn } from "@/components/neo/cn";

const TABS = [
  { href: "/central", label: "Dashboard", icon: LayoutDashboard },
  { href: "/central/board", label: "Board", icon: Table2 },
  { href: "/central/sync", label: "Sync & access", icon: RefreshCw },
] as const;

export function CentralNav() {
  const path = usePathname();
  return (
    <nav aria-label="Central Repository" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/central" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-150",
              active ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:text-ink",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-oxblood" : "text-ink-3")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
