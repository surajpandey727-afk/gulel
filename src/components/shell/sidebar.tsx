"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { GulelMark } from "@/components/brand/gulel-mark";
import { MOBILE_NAV, NAV } from "./nav";
import { SearchTrigger } from "./command-palette";

export function Sidebar({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-1 overflow-y-auto px-4 py-5 lg:flex">
      <Link href="/overview" className="mb-5 flex items-center gap-3 px-2" aria-label="gulel home">
        <GulelMark size={40} className="shrink-0 rounded-[8px]" />
        <span className="leading-tight">
          <span className="block text-[0.95rem] font-semibold tracking-tight">gulel</span>
          <span className="block text-[0.65rem] uppercase tracking-[0.14em] text-ink-3">for nishaan-a</span>
        </span>
      </Link>
      <div className="mb-3"><SearchTrigger /></div>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        const n = badges[href];
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-10 items-center gap-3 rounded-full px-3 text-sm transition-all duration-150",
              active ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", active ? "text-oxblood" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
            <span className="flex-1 truncate">{label}</span>
            {n ? <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-oxblood px-1.5 text-[0.65rem] font-semibold text-ivory" aria-label={`${n} pending`}>{n}</span> : null}
          </Link>
        );
      })}
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
            {badges[href] ? <span className="absolute right-2 top-0.5 h-2 w-2 rounded-full bg-oxblood" aria-label={`${badges[href]} pending`} /> : null}
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
