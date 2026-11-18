"use client";
import { useId, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { PALETTE, type PaletteKey } from "@/components/central/palette";

export interface TagDef { name: string; color: string }

const AUTO: PaletteKey[] = ["moss", "olive", "taupe", "amber", "cream", "grey", "red"];
/** Same colour rule as the server: shared list colour, else a stable colour from the name. */
export function tagColor(name: string, defs?: TagDef[]): PaletteKey {
  const hit = defs?.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (hit && hit.color in PALETTE) return hit.color as PaletteKey;
  if (/^qualification$/i.test(name)) return "green";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AUTO[Math.abs(h) % AUTO.length];
}

export function TagChip({ name, defs, onRemove, size = "sm" }: { name: string; defs?: TagDef[]; onRemove?: () => void; size?: "xs" | "sm" }) {
  const c = PALETTE[tagColor(name, defs)];
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full font-medium ring-1 ring-inset", c.pill, size === "xs" ? "px-1.5 py-px text-[0.625rem]" : "py-0.5 pl-2 text-[0.6875rem]", onRemove ? "pr-1" : size === "sm" && "pr-2")}>
      <span className="truncate">{name}</span>
      {onRemove && <button type="button" aria-label={`Remove tag ${name}`} onClick={onRemove} className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-ink/10"><X className="h-2.5 w-2.5" /></button>}
    </span>
  );
}

/**
 * Pick tags from the team's shared list (shown as you type or focus), or type a new one: new tags join the shared
 * list when saved, so nobody types the same tag twice. Enter or comma adds; Backspace on empty removes the last.
 */
export function TagInput({ tags, defs, onChange, placeholder, label = "Add tag" }: { tags: string[]; defs: TagDef[]; onChange: (t: string[]) => void; placeholder: string; label?: string }) {
  const [v, setV] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const q = v.trim().toLowerCase();
  const options = useMemo(() => {
    const free = defs.filter((d) => !tags.some((t) => t.toLowerCase() === d.name.toLowerCase()));
    const hits = q ? free.filter((d) => d.name.toLowerCase().includes(q)) : free;
    return hits.slice(0, 8);
  }, [defs, tags, q]);
  const exact = defs.some((d) => d.name.toLowerCase() === q) || tags.some((t) => t.toLowerCase() === q);
  const add = (raw: string) => {
    const t = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    setV(""); setActive(0);
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    const canonical = defs.find((d) => d.name.toLowerCase() === t.toLowerCase())?.name ?? t;
    onChange([...tags, canonical]);
  };
  const total = options.length + (q && !exact ? 1 : 0);
  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1" onClick={() => inputRef.current?.focus()}>
        {tags.map((t) => <TagChip key={t} name={t} defs={defs} onRemove={() => onChange(tags.filter((x) => x !== t))} />)}
        <input
          ref={inputRef} value={v} placeholder={tags.length ? "" : placeholder} aria-label={label} role="combobox" aria-expanded={open && total > 0} aria-controls={listId} aria-autocomplete="list"
          onChange={(e) => { setV(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => { setOpen(false); if (v.trim()) add(v); }, 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && total) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % total); }
            else if (e.key === "ArrowUp" && total) { e.preventDefault(); setActive((a) => (a + total - 1) % total); }
            else if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(open && options[active] ? options[active].name : v); }
            else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
            else if (e.key === "Backspace" && !v && tags.length) onChange(tags.slice(0, -1));
          }}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[0.6875rem] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {open && total > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 top-full z-30 mt-1 max-h-56 w-64 overflow-y-auto rounded-neo bg-canvas p-1.5 neo-raised">
          {options.map((o, i) => (
            <li key={o.name} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); add(o.name); }} onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center gap-2 rounded-neo-sm px-2 py-1.5 text-left", i === active && "bg-sunken/70")}>
                <TagChip name={o.name} defs={defs} />
              </button>
            </li>
          ))}
          {q && !exact && (
            <li role="option" aria-selected={active === options.length}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); add(v); }} onMouseEnter={() => setActive(options.length)}
                className={cn("flex w-full items-center gap-1.5 rounded-neo-sm px-2 py-1.5 text-left text-xs text-ink-2", active === options.length && "bg-sunken/70")}>
                <Plus className="h-3.5 w-3.5 text-oxblood" aria-hidden />Create tag “{v.trim().slice(0, 40)}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
