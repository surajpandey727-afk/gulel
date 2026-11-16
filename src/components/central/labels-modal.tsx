"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Input } from "@/components/neo/field";
import { cn } from "@/components/neo/cn";
import { REF_LIST_BY_NAME, type Index } from "@/lib/central/compute";
import type { RefItem } from "@/lib/central/types";
import { deleteLabelAction, setLabelColorAction, upsertLabelAction } from "@/app/(app)/central/actions";
import { PALETTE, PALETTE_KEYS, labelColor, type PaletteKey } from "./palette";
import { Pill } from "./cells";

/** Manage a dropdown list (a block of the Reference sheet): values, names, open/closed flag and colours. */
export function LabelsModal({ list, idx, canWrite, onClose, onChange }: { list: string; idx: Index; canWrite: boolean; onClose: () => void; onChange: (refs: RefItem[]) => void }) {
  const def = REF_LIST_BY_NAME.get(list);
  const [items, setItems] = useState<RefItem[]>(idx.refList.get(list) ?? []);
  const [draft, setDraft] = useState({ item_id: "", name: "" });
  const [pending, start] = useTransition();
  const update = (next: RefItem[]) => { setItems(next); onChange(next); };

  const setColor = (i: RefItem, color: PaletteKey) => start(async () => {
    const r = await setLabelColorAction(list, i.item_id, color);
    if (!r.ok) return void toast.error(r.error);
    update(items.map((x) => (x.item_id === i.item_id ? { ...x, color } : x)));
  });
  const save = (i: RefItem, patch: Partial<RefItem>) => start(async () => {
    const next = { ...i, ...patch };
    const r = await upsertLabelAction(list, { item_id: next.item_id, name: next.name, is_open: next.is_open, market_id: next.market_id });
    if (!r.ok) return void toast.error(r.error);
    update(items.map((x) => (x.item_id === i.item_id ? next : x)));
  });
  const add = () => start(async () => {
    const r = await upsertLabelAction(list, { item_id: draft.item_id, name: draft.name, is_open: true });
    if (!r.ok) return void toast.error(r.error);
    update([...items, { list, item_id: draft.item_id.trim().toUpperCase(), name: draft.name.trim(), is_open: def?.isopen ? true : null, market_id: null, color: null, position: Math.max(3, ...items.map((x) => x.position)) + 1 }]);
    setDraft({ item_id: "", name: "" });
  });
  const remove = (i: RefItem) => start(async () => {
    const r = await deleteLabelAction(list, i.item_id);
    if (!r.ok) return void toast.error(r.error);
    update(items.filter((x) => x.item_id !== i.item_id));
    toast.success(`Removed ${i.name}. Rows using ${i.item_id} will be flagged invalid.`);
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${def?.title ?? list} values`} description="These are the sheet's dropdown values (Reference tab). Changes sync to Google Sheets." wide>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.item_id} className="flex flex-wrap items-center gap-2 rounded-neo-sm neo-inset-sm px-3 py-2">
            <span className="w-12 shrink-0 font-mono text-xs text-ink-3">{i.item_id}</span>
            {canWrite ? (
              <input defaultValue={i.name} aria-label={`Name for ${i.item_id}`} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== i.name) save(i, { name: v }); }}
                className="min-w-0 flex-1 rounded-full bg-transparent px-2 py-1 text-sm text-ink outline-none focus-visible:neo-raised-sm" />
            ) : <span className="flex-1 text-sm">{i.name}</span>}
            <Pill color={labelColor(i)}>{i.name}</Pill>
            {def?.isopen && (
              <label className="flex items-center gap-1 text-xs text-ink-2">
                <input type="checkbox" checked={!!i.is_open} disabled={!canWrite} onChange={(e) => save(i, { is_open: e.target.checked })} className="accent-[var(--brand-oxblood)]" />Open
              </label>
            )}
            <div className="flex gap-1" role="radiogroup" aria-label={`Colour for ${i.name}`}>
              {PALETTE_KEYS.map((k) => (
                <button key={k} type="button" disabled={!canWrite} onClick={() => setColor(i, k)} title={PALETTE[k].label} aria-label={PALETTE[k].label} aria-checked={labelColor(i) === k} role="radio"
                  className={cn("h-4 w-4 rounded-full", PALETTE[k].dot, labelColor(i) === k && "ring-2 ring-ink ring-offset-1 ring-offset-canvas")} />
              ))}
            </div>
            {canWrite && <button type="button" onClick={() => remove(i)} aria-label={`Remove ${i.name}`} className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="mt-4 flex flex-wrap items-end gap-2">
          <Input value={draft.item_id} onChange={(e) => setDraft({ ...draft, item_id: e.target.value })} placeholder="ID (e.g. S8)" aria-label="New value ID" className="h-10 w-28 font-mono uppercase" maxLength={8} />
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" aria-label="New value name" className="h-10 min-w-40 flex-1" />
          <Button type="submit" size="sm" variant="primary" loading={pending} disabled={!draft.item_id || !draft.name}><Plus className="h-3.5 w-3.5" aria-hidden />Add value</Button>
        </form>
      )}
    </Modal>
  );
}
