"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Building2, FileText, Search, User } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { NAV } from "./nav";
import { globalSearch, type SearchHit } from "./search-actions";

const ICON = { organisation: Building2, person: User, draft: FileText, conversation: FileText } as const;

/** ⌘K / Ctrl+K: jump to any section, organisation, person or draft. Keyboard-first. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const reqId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-command-palette", onOpen); };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = ++reqId.current;
    const t = setTimeout(() => start(async () => { const r = await globalSearch(q); if (id === reqId.current) { setHits(r); setActive(0); } }), 180);
    return () => clearTimeout(t);
  }, [q]);

  const sections = useMemo(() => NAV.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())).map((n) => ({ type: "section" as const, id: n.href, label: n.label, sub: n.purpose, href: n.href })), [q]);
  const items = [...hits, ...sections];
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#14141433] backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 rounded-neo-lg neo-raised-lg p-3" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organisations, people, drafts — or jump to a section"
              aria-label="Search" role="combobox" aria-expanded aria-controls="cmd-results" aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                if (e.key === "Enter" && items[active]) { e.preventDefault(); go(items[active].href); }
              }}
              className="h-12 w-full rounded-neo neo-inset-sm pl-11 pr-4 text-[0.95rem] outline-none placeholder:text-ink-3" />
          </label>
          <ul id="cmd-results" role="listbox" className="mt-2 max-h-[55vh] overflow-y-auto">
            {items.map((it, i) => {
              const Icon = it.type === "section" ? NAV.find((n) => n.href === it.href)!.icon : ICON[it.type];
              return (
                <li key={`${it.type}-${it.id}`} id={`cmd-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(it.href)}
                    className={cn("flex w-full items-center gap-3 rounded-neo px-3 py-2.5 text-left", i === active && "neo-inset-sm")}>
                    <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.label}</span><span className="block truncate text-xs text-ink-3">{it.sub}</span></span>
                    <span className="text-[0.65rem] uppercase tracking-wide text-ink-3">{it.type}</span>
                  </button>
                </li>
              );
            })}
            {q.trim().length >= 2 && !hits.length && <li className="px-3 py-2 text-xs text-ink-3">No matching records.</li>}
          </ul>
          <p className="mt-2 px-1 text-[0.65rem] text-ink-3">↑↓ to move · Enter to open · Esc to close · Ctrl/⌘ K anywhere</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SearchTrigger({ compact }: { compact?: boolean }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
      className={cn("flex items-center gap-2 rounded-full neo-inset-sm text-sm text-ink-3", compact ? "h-9 w-9 justify-center" : "h-10 w-full px-4")} aria-label="Search (Ctrl+K)">
      <Search className="h-4 w-4" aria-hidden />{!compact && <><span className="flex-1 text-left">Search</span><kbd className="rounded bg-raised px-1.5 text-[0.65rem]">Ctrl K</kbd></>}
    </button>
  );
}
