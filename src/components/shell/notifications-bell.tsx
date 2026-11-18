"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AtSign, Bell, CheckCheck } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { markNotificationsReadAction, notificationsAction, type NotificationRow } from "@/app/(app)/organisations/records-actions";

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Mentions inbox: unread count on the bell; opening an item marks it read and goes to the note. */
export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { void notificationsAction().then((r) => { if (r.ok) { setItems(r.data.items); setUnread(r.data.unread); } }); }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const focus = () => load();
    window.addEventListener("focus", focus);
    return () => { clearInterval(t); window.removeEventListener("focus", focus); };
  }, [load]);
  const go = (n: NotificationRow) => {
    setOpen(false);
    if (!n.read_at) { setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))); setUnread((u) => Math.max(0, u - 1)); void markNotificationsReadAction([n.id]); }
    if (n.link) router.push(n.link);
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={unread ? `Mentions, ${unread} unread` : "Mentions"}
          className="flex h-9 w-full items-center gap-2.5 rounded-full px-3 text-sm text-ink-2 transition-colors hover:bg-raised/80 hover:text-ink data-[state=open]:neo-raised-sm data-[state=open]:text-oxblood">
          <Bell className="h-4 w-4" aria-hidden />Mentions
          {unread > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent-fill px-1.5 text-[0.625rem] font-semibold tabular text-ivory">{unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" align="start" sideOffset={10} className="z-50 flex max-h-[70dvh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-neo bg-canvas neo-raised">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
            <span className="flex-1 text-sm font-semibold text-ink">Mentions</span>
            {unread > 0 && (
              <button type="button" onClick={() => { void markNotificationsReadAction("all").then(load); setUnread(0); }} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6875rem] text-ink-2 hover:bg-sunken/70 hover:text-oxblood">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read
              </button>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-ink-3">When a teammate @mentions you in a note, it shows up here.</li>
            ) : items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => go(n)} className={cn("flex w-full gap-2.5 rounded-neo-sm px-3 py-2 text-left hover:bg-sunken/60", !n.read_at && "bg-oxblood/[0.04]")}>
                  <AtSign className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", n.read_at ? "text-ink-3" : "text-oxblood")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-xs", n.read_at ? "text-ink-2" : "font-semibold text-ink")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-[0.6875rem] text-ink-3">{n.body}</span>}
                    <span className="mt-0.5 block text-[0.625rem] text-ink-3">{ago(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
