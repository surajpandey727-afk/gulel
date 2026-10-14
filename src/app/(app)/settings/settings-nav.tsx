"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/neo/cn";

const ITEMS = [
  ["/settings/voice", "Brand & Voice DNA"],
  ["/settings/providers", "Claude & AI providers"],
  ["/settings/integrations", "Gmail & LinkedIn"],
  ["/settings/scoring", "Scoring model"],
  ["/settings/policies", "Approval & pricing"],
  ["/settings/operations", "Operations & costs"],
  ["/settings/security", "Security & data"],
] as const;

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col [scrollbar-width:none]">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
          className={cn("shrink-0 rounded-full px-4 py-2 text-sm", path === href ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:text-ink")}>{label}</Link>
      ))}
    </nav>
  );
}
