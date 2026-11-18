"use client";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, Check, Globe2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tip } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import { deleteViewAction, listViewsAction, saveViewAction, type SavedView } from "@/app/(app)/central/actions";

/**
 * Saved views for a board sheet: a named snapshot of columns, widths, freeze, grouping, sort, filters and mode.
 * Views are yours unless you share them with the team. Applying one also becomes your current layout.
 */
export function SavedViews({ sheet, view, activeId, canWrite, onApply, onReset, density, onDensity }: {
  sheet: string; view: object; activeId: string | null; canWrite: boolean;
  onApply: (v: Record<string, unknown>, id: string) => void; onReset: () => void;
  density: "comfortable" | "compact"; onDensity: (d: "comfortable" | "compact") => void;
}) {
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<{ name: string; shared: boolean } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  useEffect(() => { setViews(null); void listViewsAction(sheet).then((r) => { if (r.ok) setViews(r.data); }); }, [sheet]);
  const active = views?.find((v) => v.id === activeId) ?? null;
  const changed = !!active && JSON.stringify(active.view) !== JSON.stringify(view);

  const save = async (input: { id?: string; name: string; shared: boolean }) => {
    const r = await saveViewAction({ ...input, sheet, view: view as Record<string, unknown> });
    if (!r.ok) return void toast.error(r.error);
    setViews((vs) => [...(vs ?? []).filter((v) => v.id !== r.data.id), r.data].sort((a, b) => a.name.localeCompare(b.name)));
    onApply(r.data.view, r.data.id);
    setNaming(null);
    toast.success(input.id ? `Updated “${r.data.name}”` : `Saved view “${r.data.name}”`);
  };
  const remove = async (id: string) => {
    const r = await deleteViewAction(id);
    if (!r.ok) return void toast.error(r.error);
    setViews((vs) => (vs ?? []).filter((v) => v.id !== id));
    setConfirmDel(null);
    toast.success("View deleted");
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setNaming(null); setConfirmDel(null); } }}>
      <Tip content={active ? `View: ${active.name}${changed ? " (changed)" : ""}` : "Saved views and row density"}>
        <Popover.Trigger asChild>
          <button type="button" className={cn("inline-flex h-9 max-w-48 items-center gap-1.5 rounded-full px-3 text-xs neo-inset-sm", active ? "font-medium text-oxblood" : "text-ink-2 hover:text-oxblood")}>
            <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{active ? active.name : "Views"}</span>{changed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-label="changed" />}
          </button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-72 rounded-neo bg-canvas p-2 neo-raised">
          <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">Saved views</p>
          {views === null ? <p className="px-2 py-1.5 text-xs text-ink-3">Loading…</p> : views.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-ink-3">None yet. Arrange the board (columns, filters, grouping, sort) and save it as a view.</p>
          ) : (
            <ul className="flex max-h-64 flex-col overflow-y-auto">
              {views.map((v) => (
                <li key={v.id} className="group flex items-center gap-1 rounded-neo-sm hover:bg-sunken/60">
                  <button type="button" onClick={() => { onApply(v.view, v.id); setOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs text-ink">
                    {v.id === activeId ? <Check className="h-3.5 w-3.5 shrink-0 text-oxblood" aria-hidden /> : v.shared ? <Globe2 className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="shared" /> : <Lock className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="only you" />}
                    <span className="truncate">{v.name}</span>{!v.mine && <span className="ml-auto shrink-0 text-[0.625rem] text-ink-3">team</span>}
                  </button>
                  {v.mine && (confirmDel === v.id ? (
                    <button type="button" onClick={() => void remove(v.id)} className="mr-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium text-danger hover:bg-danger/10">Delete?</button>
                  ) : (
                    <button type="button" onClick={() => setConfirmDel(v.id)} aria-label={`Delete view ${v.name}`} className="mr-1 grid h-6 w-6 place-items-center rounded-full text-ink-3 opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <div className="my-1.5 border-t border-hairline" />
          {naming ? (
            <form onSubmit={(e) => { e.preventDefault(); void save({ name: naming.name, shared: naming.shared }); }} className="flex flex-col gap-2 px-1">
              <input autoFocus value={naming.name} onChange={(e) => setNaming({ ...naming, name: e.target.value })} placeholder="View name, e.g. India · open pipeline" maxLength={60}
                className="h-8 rounded-full px-3 text-xs text-ink outline-none neo-inset-sm placeholder:text-ink-3" aria-label="View name" />
              <label className="flex items-center gap-2 px-1 text-xs text-ink-2"><input type="checkbox" checked={naming.shared} onChange={(e) => setNaming({ ...naming, shared: e.target.checked })} className="accent-[var(--brand-oxblood)]" />Share with the team</label>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setNaming(null)} className="rounded-full px-3 py-1 text-xs text-ink-2 hover:bg-sunken/60">Cancel</button>
                <button type="submit" disabled={!naming.name.trim()} className="rounded-full px-3 py-1 text-xs font-medium text-ivory bg-accent-fill disabled:opacity-50">Save view</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col">
              {active?.mine && changed && <button type="button" onClick={() => void save({ id: active.id, name: active.name, shared: active.shared })} className="flex items-center gap-2 rounded-neo-sm px-2 py-1.5 text-left text-xs text-oxblood hover:bg-sunken/60"><Save className="h-3.5 w-3.5" aria-hidden />Update “{active.name}”</button>}
              {<button type="button" onClick={() => setNaming({ name: "", shared: false })} className="flex items-center gap-2 rounded-neo-sm px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-sunken/60"><Plus className="h-3.5 w-3.5" aria-hidden />Save current layout as a view…</button>}
              <button type="button" onClick={() => { onReset(); setOpen(false); }} className="flex items-center gap-2 rounded-neo-sm px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-sunken/60"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset to the default layout</button>
            </div>
          )}
          <div className="my-1.5 border-t border-hairline" />
          <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">Row density</p>
          <div className="flex gap-1 px-1">
            {(["comfortable", "compact"] as const).map((d) => (
              <button key={d} type="button" onClick={() => onDensity(d)} className={cn("flex-1 rounded-full px-2 py-1 text-xs capitalize", density === d ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:bg-sunken/60")}>{d}</button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
