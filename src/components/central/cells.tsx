"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Plus, Search, X } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { displayValue, entityName, entityRows, type Index } from "@/lib/central/compute";
import type { CellValue, ColumnDef, EntityTarget, Row } from "@/lib/central/types";
import { PALETTE, labelColor, type PaletteKey } from "./palette";

export function Pill({ color, children, className, title }: { color: PaletteKey; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", PALETTE[color].pill, className)}>
      {children}
    </span>
  );
}

const fmtDate = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
const CURRENCY_SIGN: Record<string, string> = { GBP: "£", INR: "₹", USD: "$", EUR: "€", AUD: "A$" };

export function entityTargetFor(c: ColumnDef, row: Row | null): EntityTarget | null {
  if (c.type !== "entity" || !c.entity) return null;
  if (c.entity !== "@any") return c.entity;
  const t = String(row?.data.ref_type_id ?? "");
  return t === "PL" ? "@opportunity" : t === "PA" ? "@partner" : t === "PJ" ? "Projects" : null;
}

/** Read-only rendering of one cell. */
export function CellView({ c, value, row, idx, isOpen }: { c: ColumnDef; value: CellValue | undefined; row: Row; idx: Index; isOpen: boolean }) {
  const v = value === null || value === undefined ? "" : String(value);
  if (!v) return null;
  switch (c.type) {
    case "ref": {
      const item = c.list ? idx.refs.get(c.list)?.get(v) : undefined;
      if (!item) return <span className="text-xs font-medium text-danger" title="Not in the dropdown list">{v} · invalid</span>;
      return <Pill color={labelColor(item)} title={`${item.item_id} · ${item.name}`}>{item.name}</Pill>;
    }
    case "choice":
      return <Pill color={labelColor({ name: v, color: null, position: c.choices?.indexOf(v) ?? 0 })}>{v}</Pill>;
    case "entity": {
      const label = displayValue(idx, c, value, row);
      const missing = label === v && !!entityTargetFor(c, row);
      return (
        <span className={cn("flex min-w-0 items-center gap-1.5", missing && "text-danger")} title={`${v}${missing ? " · not found" : ""}`}>
          <span className="truncate text-ink">{label}</span>
        </span>
      );
    }
    case "date": {
      const overdue = isOpen && /next date|due/i.test(c.header) && v < new Date().toISOString().slice(0, 10);
      return <span className={cn("tabular", overdue ? "font-medium text-danger" : "text-ink-2")} title={overdue ? "Overdue" : undefined}>{fmtDate(v)}</span>;
    }
    case "number": {
      const isMoney = c.key === "value";
      const auto = isMoney && (row.data.value === null || row.data.value === undefined || row.data.value === "");
      const sign = isMoney ? CURRENCY_SIGN[String(row.data.currency_id ?? "")] ?? "" : "";
      return <span className={cn("block text-right tabular", auto ? "text-ink-3" : "text-ink")} title={auto ? "From linked projects. Type a value to override." : undefined}>{sign}{Number(v).toLocaleString("en-GB")}</span>;
    }
    case "email":
      return <span className="truncate text-ink-2">{v}</span>;
    case "url":
      return (
        <a href={v} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="inline-flex min-w-0 items-center gap-1 text-oxblood underline-offset-2 hover:underline">
          <span className="truncate">{v.replace(/^https?:\/\//, "")}</span><ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
      );
    case "id":
      return <span className="font-mono text-xs text-ink-2">{v}</span>;
    case "formula": {
      if (/^(Value|Fee|Total|Pending)$/.test(c.header) && v !== "") {
        const cur = String(row.data.currency_id ?? row.data.fee_currency_id ?? "");
        return <span className="block text-right tabular text-ink-2">{CURRENCY_SIGN[cur] ?? ""}{Number(v).toLocaleString("en-GB")}</span>;
      }
      if (c.header === "Advance/Delay") { const n = Number(v); return <span className={cn("block text-right tabular", n < 0 ? "font-medium text-danger" : "text-ink-2")}>{n > 0 ? `+${n}` : n} d</span>; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return <span className="tabular text-ink-3">{fmtDate(v)}</span>;
      if (v === "#INVALID") return <span className="text-xs font-medium text-danger">#INVALID</span>;
      return <span className="truncate text-ink-3">{v}</span>;
    }
    default:
      return <span className="truncate text-ink">{v}</span>;
  }
}

/* ---------------------------------------------------------------- floating panel */

export function Floating({ anchor, onClose, children, width = 280, tall }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; width?: number; /** Allow most of the viewport height (notes). */ tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const cap = tall ? Math.min(680, window.innerHeight - 24) : 360;
      const below = window.innerHeight - r.bottom;
      const fitsBelow = below > (tall ? Math.min(cap, 420) : 260);
      const maxH = fitsBelow ? Math.min(cap, below - 12) : Math.min(cap, r.top - 12);
      const top = fitsBelow ? r.bottom + 4 : Math.max(8, r.top - maxH - 4);
      setPos({ top, left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8), maxH });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, width, tall]);
  useEffect(() => {
    // A dialog opened from inside this panel (expand, viewer) owns the clicks and Esc until it closes.
    const modalOpen = () => [...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((d) => d !== ref.current);
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node) && !modalOpen()) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !modalOpen()) onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [anchor, onClose]);
  if (!pos) return null;
  return createPortal(
    <div ref={ref} role="dialog" style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxH }} className="fixed z-50 flex flex-col overflow-hidden rounded-neo bg-canvas neo-raised text-sm">
      {children}
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- option picker (ref / entity / choice) */

export interface Option { value: string; label: string; hint?: string; color?: PaletteKey }

export function optionsFor(c: ColumnDef, row: Row | null, idx: Index): Option[] {
  if (c.type === "ref" && c.list) return (idx.refList.get(c.list) ?? []).map((i) => ({ value: i.item_id, label: i.name, hint: i.item_id, color: labelColor(i) }));
  if (c.type === "choice") return (c.choices ?? []).map((x, i) => ({ value: x, label: x, color: labelColor({ name: x, color: null, position: i }) }));
  const target = entityTargetFor(c, row);
  if (!target) return [];
  return entityRows(idx, target).filter((r) => r.row_key).map((r) => ({ value: r.row_key!, label: entityName(idx, r) || r.row_key!, hint: r.row_key! }));
}

export function OptionPicker({ anchor, options, value, onPick, onClose, onManage, emptyHint, onCreate, createNoun = "value" }: {
  anchor: HTMLElement | null; options: Option[]; value: string; onPick: (v: string | null) => void; onClose: () => void; onManage?: () => void; emptyHint?: string;
  /** Lets the user add a value that is not in the list yet (a new label, organisation, contact, partner…). */
  onCreate?: (label: string) => void; createNoun?: string;
}) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s) || (o.hint ?? "").toLowerCase().includes(s)) : options;
  }, [q, options]);
  useEffect(() => setHi(Math.max(0, list.findIndex((o) => o.value === value))), [list, value]);
  const typed = q.trim();
  const canCreate = !!onCreate && typed.length > 0 && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());
  return (
    <Floating anchor={anchor} onClose={onClose} width={300}>
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <Search className="h-3.5 w-3.5 text-ink-3" aria-hidden />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search options"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (list[hi]) onPick(list[hi].value); else if (canCreate) onCreate!(typed); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
        />
      </div>
      <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {list.length === 0 && !canCreate && <li className="px-3 py-3 text-xs text-ink-3">{emptyHint ?? (onCreate ? "Type to search or add a new value." : "No matches. Only values from the list are allowed.")}</li>}
        {list.map((o, i) => (
          <li key={o.value} role="option" aria-selected={o.value === value}>
            <button
              type="button" onMouseEnter={() => setHi(i)} onClick={() => onPick(o.value)}
              className={cn("flex w-full items-center gap-2 rounded-neo-sm px-2.5 py-1.5 text-left", i === hi && "bg-sunken/70")}
            >
              {o.color ? <Pill color={o.color}>{o.label}</Pill> : <span className="truncate text-ink">{o.label}</span>}
              {o.hint && o.hint !== o.label && <span className="ml-auto shrink-0 font-mono text-[0.625rem] text-ink-3">{o.hint}</span>}
              {o.value === value && <Check className={cn("h-3.5 w-3.5 shrink-0 text-oxblood", !o.hint && "ml-auto")} aria-hidden />}
            </button>
          </li>
        ))}
        {canCreate && (
          <li>
            <button type="button" onClick={() => onCreate!(typed)} className="flex w-full items-center gap-2 rounded-neo-sm px-2.5 py-1.5 text-left text-sm text-oxblood hover:bg-sunken/70">
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">Add {createNoun} &ldquo;{typed}&rdquo;</span>
            </button>
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between border-t border-hairline px-2 py-1.5">
        <button type="button" onClick={() => onPick(null)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-2 hover:bg-sunken/70"><X className="h-3 w-3" aria-hidden />Clear</button>
        {onManage && <button type="button" onClick={onManage} className="rounded-full px-2.5 py-1 text-xs font-medium text-oxblood hover:bg-sunken/70">Edit labels</button>}
      </div>
    </Floating>
  );
}

/* ---------------------------------------------------------------- inline text / number / date editor */

export function InlineEditor({ c, initial, onCommit, onCancel }: { c: ColumnDef; initial: string; onCommit: (v: string, move?: "down" | "right" | "left") => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Number, date and email inputs do not support selection ranges (it throws), so only text-like inputs get the caret moved.
    if (el.type === "text") { try { el.setSelectionRange(el.value.length, el.value.length); } catch {} }
  }, [c.type]);
  return (
    <input
      ref={ref} value={v} onChange={(e) => setV(e.target.value)} aria-label={c.header}
      type={c.type === "date" ? "date" : c.type === "number" ? "number" : c.type === "email" ? "email" : "text"}
      step={c.type === "number" ? "any" : undefined} min={c.type === "number" ? 0 : undefined}
      className={cn("absolute inset-0 z-10 h-full w-full rounded-[6px] bg-canvas px-2.5 text-sm text-ink outline-2 outline-oxblood", c.type === "number" && "text-right tabular", c.type === "id" && "font-mono uppercase")}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); onCommit(v, "down"); }
        else if (e.key === "Tab") { e.preventDefault(); onCommit(v, e.shiftKey ? "left" : "right"); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
    />
  );
}

export function LongTextEditor({ anchor, c, initial, onCommit, onCancel }: { anchor: HTMLElement | null; c: ColumnDef; initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const commit = () => { if (!done.current) { done.current = true; onCommit(v); } };
  return (
    <Floating anchor={anchor} onClose={commit} width={380}>
      <div className="flex items-center justify-between px-3 pt-2.5 text-xs font-medium text-ink-2"><span>{c.header}</span><span className="text-ink-3">Ctrl+Enter to save · Esc to cancel</span></div>
      <textarea
        autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={c.header}
        className="m-3 min-h-40 resize-y rounded-neo neo-inset-sm px-3 py-2 text-sm leading-relaxed text-ink outline-none"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); done.current = true; onCancel(); }
        }}
      />
    </Floating>
  );
}
