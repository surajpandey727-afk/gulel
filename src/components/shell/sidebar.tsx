"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Menu, Moon, Sun } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { GulelMark } from "@/components/brand/gulel-mark";
import { MOBILE_NAV, NAV, NAV_GROUPS, OVERVIEW, type NavGroup } from "./nav";
import { SearchTrigger } from "./command-palette";
import { useTheme } from "./theme-provider";

function AccordionGroup({ group, badges, path }: { group: NavGroup; badges: Record<string, number>; path: string }) {
  const hasActive = group.items.some((it) => path === it.href || path.startsWith(it.href + "/"));
  const [open, setOpen] = useState(hasActive);
  const groupBadge = group.items.reduce((s, it) => s + (badges[it.href] ?? 0), 0);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex h-9 items-center gap-2.5 rounded-full px-3 text-[0.78rem] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <group.icon className="h-4 w-4 text-ink-3" aria-hidden />
        <span className="flex-1 truncate text-left">{group.label}</span>
        {groupBadge > 0 && (
          <span className="tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-fill px-1 text-[0.6rem] font-semibold text-ivory">
            {groupBadge}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-3 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("flex flex-col gap-0.5 overflow-hidden transition-all duration-200", open ? "mt-0.5 max-h-[400px] opacity-100" : "max-h-0 opacity-0")}>
        {group.items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          const n = badges[href];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-9 items-center gap-2.5 rounded-full pl-7 pr-3 text-[0.8rem] transition-all duration-150",
                active ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
              )}
            >
              {active && <span className="absolute left-3 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-oxblood" />}
              <Icon className={cn("h-[15px] w-[15px]", active ? "text-oxblood" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
              <span className="flex-1 truncate">{label}</span>
              {n ? <span className="tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-fill px-1 text-[0.6rem] font-semibold text-ivory">{n}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  const { theme, toggle } = useTheme();
  const overviewActive = path === OVERVIEW.href || path.startsWith(OVERVIEW.href + "/");

  return (
    <nav aria-label="Primary" className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-1 overflow-y-auto px-4 py-5 lg:flex">
      <Link href="/overview" className="mb-5 flex items-center gap-3 px-2" aria-label="gulel home">
        <GulelMark size={40} className="shrink-0 rounded-[8px]" />
        <span className="leading-tight">
          <span className="block text-[0.95rem] font-semibold tracking-tight">gulel</span>
          <span className="block text-[0.65rem] tracking-[0.14em] text-ink-3">for nishaan-a</span>
        </span>
      </Link>

      <div className="mb-3"><SearchTrigger /></div>

      <Link
        href={OVERVIEW.href}
        aria-current={overviewActive ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-full px-3 text-sm transition-all duration-150",
          overviewActive ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
        )}
      >
        <OVERVIEW.icon className={cn("h-[18px] w-[18px]", overviewActive ? "text-oxblood" : "text-ink-3")} aria-hidden />
        <span className="flex-1 truncate">{OVERVIEW.label}</span>
      </Link>

      <div className="mx-1.5 my-2 h-px bg-hairline" />

      {NAV_GROUPS.map((g) => (
        <AccordionGroup key={g.key} group={g} badges={badges} path={path} />
      ))}

      <button
        type="button"
        onClick={toggle}
        className="mt-auto flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[0.82rem] text-ink-2 neo-inset-sm transition-colors hover:text-ink"
      >
        {theme === "dark" ? <Sun className="h-4 w-4 text-oxblood" aria-hidden /> : <Moon className="h-4 w-4 text-oxblood" aria-hidden />}
        <span className="flex-1 text-left">{theme === "dark" ? "Light" : "Dark"} mode</span>
      </button>

      <div className="flex items-center justify-center gap-1.5 pt-3.5 text-ink-3">
        <span className="text-[0.6rem] tracking-wide">powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/nishaan-a-mark.webp" alt="nishaan-a" className="h-[22px]" style={{ objectFit: "contain" }} />
      </div>
    </nav>
  );
}

export function MobileNav({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  const items = NAV.filter((n) => (MOBILE_NAV as readonly string[]).includes(n.href));
  const [more, setMore] = useState(false);
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 bg-[#14141433] lg:hidden" onClick={() => setMore(false)}>
          <nav aria-label="All sections" className="absolute inset-x-3 bottom-20 grid grid-cols-3 gap-2 rounded-neo-lg neo-raised-lg p-3" onClick={(e) => e.stopPropagation()}>
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setMore(false)} className={cn("flex flex-col items-center gap-1 rounded-neo px-2 py-3 text-[0.7rem]", path.startsWith(href) ? "neo-inset-sm text-oxblood" : "text-ink-2")}>
                <Icon className="h-5 w-5" aria-hidden />{label}
              </Link>
            ))}
          </nav>
        </div>
      )}
      <nav aria-label="Primary mobile" className="fixed inset-x-3 bottom-3 z-30 flex justify-between rounded-full neo-raised-lg px-2 py-1.5 lg:hidden">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={cn("relative flex min-w-14 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[0.62rem]", active ? "text-oxblood" : "text-ink-3")}>
              <Icon className="h-5 w-5" aria-hidden />
              {label.split(" ")[0]}
              {badges[href] ? <span className="absolute right-2 top-0.5 h-2 w-2 rounded-full bg-accent-fill" aria-label={`${badges[href]} pending`} /> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex min-w-14 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[0.62rem] text-ink-3">
          <Menu className="h-5 w-5" aria-hidden />More
        </button>
      </nav>
    </>
  );
}
