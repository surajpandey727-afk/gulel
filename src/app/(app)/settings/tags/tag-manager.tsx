"use client";
import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Panel } from "@/components/neo/surface";
import { Tip } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import { PALETTE, type PaletteKey } from "@/components/central/palette";
import { TagChip } from "@/components/tags/tag-input";
import type { DocTag } from "@/lib/orgs/tags";
import { deleteTagAction, saveTagAction } from "@/app/(app)/central/doc-actions";

const COLORS: PaletteKey[] = ["green", "moss", "olive", "amber", "red", "taupe", "cream", "grey"];

function Swatches({ value, onPick }: { value: string; onPick: (c: PaletteKey) => void }) {
  return (
    <div role="radiogroup" aria-label="Tag colour" className="flex flex-wrap gap-1">
      {COLORS.map((c) => (
        <Tip key={c} content={PALETTE[c].label}>
          <button type="button" role="radio" aria-checked={value === c} aria-label={PALETTE[c].label} onClick={() => onPick(c)}
            className={cn("grid h-6 w-6 place-items-center rounded-full ring-1 ring-hairline", value === c && "ring-2 ring-oxblood")}>
            <span className={cn("h-3.5 w-3.5 rounded-full", PALETTE[c].dot)} />
          </button>
        </Tip>
      ))}
    </div>
  );
}

/**
 * The team's shared document tags. Every tag typed on a document lands here automatically; this page sets colours,
 * renames (carried through to every document) and removes tags. Shared with everyone in the workspace.
 */
export function TagManager({ initial, canWrite }: { initial: DocTag[]; canWrite: boolean }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState<{ id?: string; name: string; color: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    if (!draft) return;
    const r = await saveTagAction(draft);
    if (!r.ok) return void toast.error(r.error);
    setTags(r.data); setDraft(null); toast.success(r.message ?? "Saved");
  });
  const remove = (id: string, fromDocuments: boolean) => start(async () => {
    const r = await deleteTagAction(id, fromDocuments);
    if (!r.ok) return void toast.error(r.error);
    setTags(r.data); setConfirm(null); toast.success(r.message ?? "Removed");
  });

  return (
    <Panel title="Document tags" eyebrow="Shared with your team" actions={canWrite && !draft ? <Button size="sm" onClick={() => setDraft({ name: "", color: "moss" })}><Plus className="h-3.5 w-3.5" aria-hidden />New tag</Button> : undefined}>
      <p className="mb-4 text-xs text-ink-3">Tags you type on any document join this list automatically, so next time you just pick them. Colours show on documents everywhere in gulel. Renaming a tag updates every document that uses it.</p>
      {draft && !draft.id && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-neo neo-inset-sm p-3">
          <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} placeholder="Tag name" aria-label="New tag name"
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setDraft(null); }}
            className="h-9 min-w-40 flex-1 rounded-full px-4 text-sm text-ink outline-none neo-inset-sm" />
          <Swatches value={draft.color} onPick={(c) => setDraft({ ...draft, color: c })} />
          <Button size="sm" onClick={() => setDraft(null)}>Cancel</Button>
          <Button size="sm" variant="primary" loading={pending} disabled={!draft.name.trim()} onClick={save}>Add tag</Button>
        </div>
      )}
      {tags.length === 0 ? <p className="text-sm text-ink-3">No tags yet.</p> : (
        <ul className="flex flex-col gap-1.5">
          {tags.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-neo px-3 py-2 neo-inset-sm">
              {draft?.id === t.id ? (
                <>
                  <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} aria-label={`Rename ${t.name}`}
                    onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setDraft(null); }}
                    className="h-8 min-w-36 flex-1 rounded-full px-3 text-sm text-ink outline-none neo-inset-sm" />
                  <Swatches value={draft.color} onPick={(c) => setDraft({ ...draft, color: c })} />
                  <Tip content="Cancel"><button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:text-ink"><X className="h-3.5 w-3.5" /></button></Tip>
                  <Tip content="Save"><button type="button" onClick={save} aria-label="Save tag" className="grid h-7 w-7 place-items-center rounded-full text-oxblood neo-raised-sm"><Check className="h-3.5 w-3.5" /></button></Tip>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1"><TagChip name={t.name} defs={tags} /></span>
                  <span className="tabular text-xs text-ink-3">{t.uses} document{t.uses === 1 ? "" : "s"}</span>
                  {canWrite && (confirm === t.id ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                      Remove “{t.name}”?
                      <Button size="sm" className="h-7" onClick={() => setConfirm(null)}>Keep</Button>
                      <Button size="sm" className="h-7" onClick={() => remove(t.id, false)}>From the list only</Button>
                      {t.uses > 0 && <Button size="sm" className="h-7" variant="danger" onClick={() => remove(t.id, true)}>Also from {t.uses} document{t.uses === 1 ? "" : "s"}</Button>}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Tip content="Rename or recolour"><button type="button" aria-label={`Edit ${t.name}`} onClick={() => setDraft({ id: t.id, name: t.name, color: t.color })} className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-sunken/70 hover:text-oxblood"><Pencil className="h-3.5 w-3.5" /></button></Tip>
                      <Tip content="Remove"><button type="button" aria-label={`Remove ${t.name}`} onClick={() => setConfirm(t.id)} className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-sunken/70 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></Tip>
                    </span>
                  ))}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
