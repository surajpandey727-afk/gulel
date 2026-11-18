"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, Columns3, Copy, Download, EyeOff, Filter, GripVertical,
  KanbanSquare, LayoutDashboard, Layers, Lock, Maximize2, Minimize2, MoreHorizontal, Palette, Plus, Redo2, RefreshCw, RotateCcw, Search, Paperclip, Sparkles, StickyNote, Table2, Trash2, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Modal, Tip } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import { createClient } from "@/lib/supabase/client";
import { SHEETS } from "@/lib/central/schema";
import { ENTITY_LABEL, REF_LIST_BY_NAME, buildIndex, colByLetter, computeRow, displayValue, entityName, nextRowKey, rowIssues, sheetDef, sheetMarket } from "@/lib/central/compute";
import { marketSummary } from "@/lib/central/metrics";
import type { CellValue, ColumnDef, Op, RefItem, Row, SheetDef, Store } from "@/lib/central/types";
import { applyOpsAction, syncAction, trashAction, upsertLabelAction } from "@/app/(app)/central/actions";
import { CellView, Floating, InlineEditor, LongTextEditor, OptionPicker, Pill, entityTargetFor, optionsFor } from "./cells";
import { PALETTE, PALETTE_KEYS, labelColor, type PaletteKey } from "./palette";
import { RowDrawer } from "./row-drawer";
import { LabelsModal } from "./labels-modal";
import { MunshiPanel } from "./munshi";
import { MarketDashboard } from "./market-dashboard";
import { SheetTabs } from "./sheet-tabs";
import { DocsMarker, DocumentsDialog } from "./documents";
import { useRowDrag, type DropTarget } from "./use-row-drag";
import { RichView } from "@/components/notes/rich-editor";
import { orgContextAction } from "@/app/(app)/organisations/records-actions";
import type { NoteRow } from "@/lib/orgs/records";
import { orderedRows, placeRow, priorityNumbers, rowBefore } from "@/lib/central/order";
import { usePrefs } from "@/components/shell/prefs-provider";
import { SavedViews } from "./saved-views";

/* ---------------------------------------------------------------- view model */

interface View {
  hidden: string[]; widths: Record<string, number>; frozen: number; groupBy: string | null;
  sort: { key: string; dir: 1 | -1 } | null; filters: Record<string, string[]>; issuesOnly: boolean; showLookups: boolean; collapsed: string[]; showArchived?: boolean;
  mode?: "table" | "kanban"; notesOnly?: boolean;
}
const GROUP_DEFAULT = ["stage_id", "status_id", "relationship_id", "type_id", "project_id"];
const NAME_KEYS = new Set(["organisation", "name", "project", "opportunity", "partner"]);

function defaultView(def: SheetDef): View {
  const g = GROUP_DEFAULT.find((k) => def.columns.some((c) => c.key === k && c.type !== "formula")) ?? null;
  return { hidden: [], widths: {}, frozen: def.frozen, groupBy: g, sort: null, filters: {}, issuesOnly: false, showLookups: false, collapsed: [] };
}

function isLookupCol(def: SheetDef, c: ColumnDef) {
  if (c.type !== "formula") return false;
  if (c.key === "row_check" || / ID$/.test(c.header) || c.header === "Is open") return true;
  if (!c.mirror) return false;
  const src = colByLetter(def, c.mirror.letter);
  if (!src || src.type === "formula") return false;
  if (c.mirror.list || c.mirror.fieldLetter === "name") return true;
  if (c.mirror.sheet && c.mirror.fieldLetter) {
    const t = SHEETS.find((s) => s.name === c.mirror!.sheet);
    const tc = t?.columns.find((x) => x.letter === c.mirror!.fieldLetter);
    return !!tc && NAME_KEYS.has(tc.key);
  }
  return false;
}

export function displayHeader(def: SheetDef, c: ColumnDef) {
  if (c.type === "ref" || c.type === "entity") {
    const m = def.columns.find((x) => x.mirror?.letter === c.letter && isLookupCol(def, x) && !/ ID$/.test(x.header) && x.header !== "Is open");
    return m?.header ?? c.header.replace(/ ID$/, "");
  }
  return c.header;
}

const INLINE_TYPES = new Set(["text", "number", "date", "email", "url", "id"]);
const TYPE_GLYPH: Partial<Record<ColumnDef["type"], string>> = { ref: "◐", entity: "↗", choice: "◐", date: "▦", number: "#", formula: "ƒ", id: "№", email: "@", url: "⌁", longtext: "¶" };

function applyLocal(store: Store, ops: Op[]): Store {
  let base = store.rows;
  for (const op of ops) {
    if (op.op !== "place") continue;
    const anchor = op.after ? base.find((r) => r.sheet === op.sheet && !r.deleted_at && (r.id === op.after || r.row_key === op.after)) : null;
    const row = base.find((r) => r.sheet === op.sheet && !r.deleted_at && (r.id === op.key || r.row_key === op.key));
    if (!row || (op.after && !anchor)) continue;
    const moves = placeRow(base, op.sheet, row.id, anchor?.id ?? null);
    base = base.map((r) => (moves.has(r.id) ? { ...r, position: moves.get(r.id)! } : r));
  }
  const rows = base.map((r) => {
    let next = r;
    for (const op of ops) {
      if (op.op === "insert" || op.sheet !== r.sheet || (op.key !== r.id && op.key !== r.row_key)) continue;
      if (op.op === "update") next = { ...next, data: { ...next.data, ...op.data } };
      else if (op.op === "delete") next = { ...next, deleted_at: new Date().toISOString() };
      else if (op.op === "restore") next = { ...next, deleted_at: null };
      else if (op.op === "color") next = { ...next, color: op.color };
      else if (op.op === "move") next = { ...next, position: op.position };
    }
    return next;
  });
  return { ...store, rows };
}

function mergeRows(store: Store, incoming: Row[]): Store {
  const map = new Map(store.rows.map((r) => [r.id, r]));
  for (const r of incoming) map.set(r.id, r);
  return { ...store, rows: [...map.values()] };
}

interface Props {
  sheet: string;
  initial: Store;
  canWrite: boolean;
  link: { url: string | null; lastSync: string | null; autoSync: boolean; status: string | null; error: string | null; connected: boolean };
  initialQuery?: string;
  /** Count of gulel notes per Central Repository organisation key (ORG-xxx). */
  orgNotes?: Record<string, number>;
  /** Count of documents per Central Repository organisation key (ORG-xxx). */
  orgFiles?: Record<string, number>;
  /** Row count per sheet for the sheet tabs between the dashboard and the toolbar. */
  counts?: Record<string, number>;
}

type Cell = { rowId: string; key: string };

/** Key of a row's free-text notes column (Notes, or Comments on Tasks). */
function notesKeyOf(def: SheetDef) {
  return def.columns.find((c) => c.key === "notes" && c.type === "longtext")?.key ?? def.columns.find((c) => c.key === "comments" && c.type === "longtext")?.key ?? null;
}

/** Short, unique dropdown ID for a new label (initials, else first letters), e.g. "Trade show" -> "TS". */
function makeRefId(name: string, taken: string[]) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words.map((w) => w[0]).join("") : words[0] ?? "NEW").slice(0, 3) || "NEW";
  const used = new Set(taken.map((t) => t.toUpperCase()));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now() % 1000}`;
}

export function Board({ sheet, initial, canWrite, link, initialQuery = "", orgNotes = {}, orgFiles = {}, counts = {} }: Props) {
  const def = sheetDef(sheet);
  const router = useRouter();
  const [store, setStore] = useState<Store>(initial);
  useEffect(() => setStore(initial), [initial]);
  const live = useMemo<Store>(() => ({ rows: store.rows.filter((r) => !r.deleted_at), refs: store.refs }), [store]);
  const idx = useMemo(() => buildIndex(live), [live]);

  /* ---------- view (per sheet, saved to your profile so it follows you to any device) */
  const { prefs, setPrefs } = usePrefs();
  const storageKey = `cr:view:${sheet}`;
  const [view, setView] = useState<View>(() => ({ ...defaultView(def), ...(prefs.boardLayouts[sheet] as Partial<View> | undefined) }));
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const layouts = useRef(prefs.boardLayouts);
  useEffect(() => {
    // Switching sheet: load that sheet's layout from your profile; layouts saved in this browser before are carried over.
    const saved = layouts.current[sheet] as Partial<View> | undefined;
    if (saved) { setView({ ...defaultView(def), ...saved }); setActiveViewId(null); return; }
    try { const raw = localStorage.getItem(storageKey); setView(raw ? { ...defaultView(def), ...JSON.parse(raw) } : defaultView(def)); } catch { setView(defaultView(def)); }
    setActiveViewId(null);
  }, [storageKey, def, sheet]);
  useEffect(() => { layouts.current = prefs.boardLayouts; }, [prefs.boardLayouts]);
  const persist = useCallback((next: View) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setPrefs({ boardLayouts: { ...layouts.current, [sheet]: next as unknown as Record<string, unknown> } }, { quiet: true });
  }, [storageKey, sheet, setPrefs]);
  const patchView = useCallback((p: Partial<View>) => setView((v) => {
    const next = { ...v, ...p };
    queueMicrotask(() => persist(next));
    return next;
  }), [persist]);
  const applyView = useCallback((v: Partial<View> | null, id: string | null) => {
    const next = { ...defaultView(def), ...(v ?? {}) };
    setView(next); setActiveViewId(id); persist(next);
  }, [def, persist]);

  /* ---------- columns */
  const columns = useMemo(() => def.columns.filter((c) => c.key !== "row_check" && !view.hidden.includes(c.key) && (view.showLookups || !isLookupCol(def, c))), [def, view.hidden, view.showLookups]);
  const width = (c: ColumnDef) => view.widths[c.key] ?? Math.max(c.type === "id" ? 96 : 110, Math.min(c.type === "longtext" ? 280 : 220, c.width));
  const LEAD = 146;
  const nameKey = (columns.find((c) => c.type === "text" || c.type === "longtext") ?? columns.find((c) => c.type === "entity") ?? columns[0])?.key ?? "";
  const frozenCount = Math.min(view.frozen, columns.length);
  const lefts = useMemo(() => {
    const out: number[] = [];
    let x = LEAD;
    columns.forEach((c, i) => { out.push(i < frozenCount ? x : -1); x += width(c); });
    return out;
  }, [columns, frozenCount, view.widths]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- rows: compute, filter, sort, group */
  const [q, setQ] = useState(initialQuery);
  const computed = useMemo(() => {
    const m = new Map<string, { all: Record<string, CellValue>; issues: string[]; text: string }>();
    for (const r of idx.bySheet.get(sheet) ?? []) {
      const all = computeRow(idx, r);
      const labels = def.columns.map((c) => displayValue(idx, c, all[c.key], r)).join(" ");
      m.set(r.id, { all, issues: rowIssues(idx, r), text: `${labels} ${r.row_key ?? ""}`.toLowerCase() });
    }
    return m;
  }, [idx, sheet, def]);

  const noteKey = notesKeyOf(def);
  const noteInfo = useCallback((r: Row) => {
    const text = noteKey ? String(r.data[noteKey] ?? "").trim() : "";
    const orgKey = r.sheet === "Organisations" ? r.row_key : String(r.data.org_id ?? "");
    const gulel = orgKey ? orgNotes[orgKey] ?? 0 : 0;
    return { text, gulel, has: !!text || gulel > 0 };
  }, [noteKey, orgNotes]);
  const hasArchive = def.columns.some((c) => c.key === "archived");
  const archivedCount = hasArchive ? (idx.bySheet.get(sheet) ?? []).filter((r) => String(r.data.archived ?? "").toUpperCase() === "Y").length : 0;
  const visibleRows = useMemo(() => {
    let rows = idx.bySheet.get(sheet) ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) rows = rows.filter((r) => computed.get(r.id)?.text.includes(needle));
    if (view.issuesOnly) rows = rows.filter((r) => (computed.get(r.id)?.issues.length ?? 0) > 0);
    if (hasArchive && !view.showArchived) rows = rows.filter((r) => String(r.data.archived ?? "").toUpperCase() !== "Y");
    if (view.notesOnly) rows = rows.filter((r) => noteInfo(r).has);
    for (const [k, vals] of Object.entries(view.filters)) if (vals.length) rows = rows.filter((r) => vals.includes(String(r.data[k] ?? "")));
    if (view.sort) {
      const { key, dir } = view.sort;
      const c = def.columns.find((x) => x.key === key);
      const val = (r: Row) => { const v = computed.get(r.id)?.all[key]; return c ? displayValue(idx, c, v, r) : String(v ?? ""); };
      rows = [...rows].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va === "" && vb !== "") return 1;
        if (vb === "" && va !== "") return -1;
        const na = Number(va), nb = Number(vb);
        return (!Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "" ? na - nb : va.localeCompare(vb)) * dir;
      });
    }
    return rows;
  }, [idx, sheet, q, view.issuesOnly, view.showArchived, view.notesOnly, noteInfo, hasArchive, view.filters, view.sort, computed, def]);

  const groupCol = view.groupBy ? def.columns.find((c) => c.key === view.groupBy) ?? null : null;
  const groups = useMemo(() => {
    if (!groupCol) return [{ key: "__all", label: def.title.replace(/^Pipeline: |^Partners: /, ""), color: (def.tab ? "green" : "moss") as PaletteKey, rows: visibleRows }];
    const byVal = new Map<string, Row[]>();
    for (const r of visibleRows) { const v = String(r.data[groupCol.key] ?? ""); if (!byVal.has(v)) byVal.set(v, []); byVal.get(v)!.push(r); }
    const order: { key: string; label: string; color: PaletteKey }[] = [];
    if (groupCol.type === "ref" && groupCol.list) for (const i of idx.refList.get(groupCol.list) ?? []) order.push({ key: i.item_id, label: i.name, color: labelColor(i) });
    else if (groupCol.type === "choice") (groupCol.choices ?? []).forEach((x, i) => order.push({ key: x, label: x, color: labelColor({ name: x, color: null, position: i }) }));
    for (const k of byVal.keys()) if (!order.some((o) => o.key === k)) {
      const r = byVal.get(k)![0];
      order.push({ key: k, label: k ? displayValue(idx, groupCol, k, r) : `No ${displayHeader(def, groupCol).toLowerCase()}`, color: k ? "taupe" : "grey" });
    }
    return order.map((o) => ({ ...o, rows: byVal.get(o.key) ?? [] })).filter((g) => g.rows.length > 0 || (!q && !Object.values(view.filters).some((f) => f.length) && !view.issuesOnly && groupCol.type !== "entity"));
  }, [groupCol, visibleRows, idx, def, q, view.filters, view.issuesOnly]);

  const flatRows = useMemo(() => groups.flatMap((g) => (view.collapsed.includes(g.key) ? [] : g.rows)), [groups, view.collapsed]);

  /* ---------- selection, active cell, editing */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<(Cell & { seed?: string }) | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [labelsList, setLabelsList] = useState<string | null>(null);
  const [munshi, setMunshi] = useState(false);
  const [confirmDel, setConfirmDel] = useState<{ ids: string[]; message: string } | null>(null);
  const [trash, setTrash] = useState<Row[] | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellEl = (c: Cell) => gridRef.current?.querySelector<HTMLElement>(`[data-cell="${c.rowId}:${c.key}"]`) ?? null;

  /* ---------- mutations with undo/redo */
  const undoStack = useRef<{ ops: Op[]; inverse: Op[] }[]>([]);
  const redoStack = useRef<{ ops: Op[]; inverse: Op[] }[]>([]);
  const [busy, setBusy] = useState(0);

  const run = useCallback(async (ops: Op[], inverse: Op[], opts: { force?: boolean; record?: boolean; quiet?: boolean } = {}): Promise<boolean> => {
    if (!canWrite) { toast.error("You have view-only access."); return false; }
    const before = store;
    if (!ops.some((o) => o.op === "insert")) setStore((s) => applyLocal(s, ops));
    setBusy((b) => b + 1);
    const res = await applyOpsAction(ops, { force: opts.force });
    setBusy((b) => b - 1);
    if (!res.ok) {
      setStore(before);
      if (/referenced by/.test(res.error) && ops.every((o) => o.op === "delete")) {
        setConfirmDel({ ids: ops.map((o) => (o as { key: string }).key), message: res.error });
        return false;
      }
      toast.error(res.error.split("\n").slice(0, 3).join("\n"));
      return false;
    }
    setStore((s) => mergeRows(s, res.data.rows));
    if (opts.record !== false) { undoStack.current.push({ ops, inverse }); redoStack.current = []; }
    const warn = res.data.results.flatMap((r) => r.warnings ?? []);
    if (!opts.quiet && warn.length && ops.length === 1 && ops[0].op !== "update") toast.warning(warn.slice(0, 2).join("; "));
    return true;
  }, [canWrite, store]);

  const undo = useCallback(async () => {
    const last = undoStack.current.pop();
    if (!last) return toast("Nothing to undo");
    if (await run(last.inverse, last.ops, { record: false, force: true, quiet: true })) { redoStack.current.push(last); toast("Undone"); }
  }, [run]);
  const redo = useCallback(async () => {
    const last = redoStack.current.pop();
    if (!last) return toast("Nothing to redo");
    if (await run(last.ops, last.inverse, { record: false, force: true, quiet: true })) undoStack.current.push(last);
  }, [run]);

  const setCell = useCallback((row: Row, key: string, value: CellValue) => {
    const prev = row.data[key] ?? null;
    if ((prev ?? "") === (value ?? "")) return;
    void run([{ op: "update", sheet, key: row.id, data: { [key]: value } }], [{ op: "update", sheet, key: row.id, data: { [key]: prev } }]);
  }, [run, sheet]);

  const addRow = useCallback(async (preset: Record<string, CellValue> = {}) => {
    const ok = await applyOpsAction([{ op: "insert", sheet, data: preset }]);
    if (!ok.ok) return toast.error(ok.error);
    setStore((s) => mergeRows(s, ok.data.rows));
    const row = ok.data.rows[0];
    if (row) {
      undoStack.current.push({ ops: [{ op: "restore", sheet, key: row.id }], inverse: [{ op: "delete", sheet, key: row.id }] });
      const firstText = columns.find((c) => c.type === "text" || c.type === "longtext");
      if (firstText) setTimeout(() => { setActive({ rowId: row.id, key: firstText.key }); setEditing({ rowId: row.id, key: firstText.key }); }, 30);
    }
  }, [sheet, columns]);

  const deleteRows = useCallback(async (ids: string[], force = false) => {
    if (!ids.length) return;
    const ops: Op[] = ids.map((id) => ({ op: "delete", sheet, key: id }));
    if (await run(ops, ids.map((id) => ({ op: "restore", sheet, key: id })), { force })) {
      setSelected(new Set());
      toast.success(`${ids.length} row${ids.length > 1 ? "s" : ""} deleted`, { action: { label: "Undo", onClick: () => void undo() } });
    }
  }, [run, sheet, undo]);

  const duplicateRows = useCallback(async (ids: string[]) => {
    const rows = ids.map((id) => store.rows.find((r) => r.id === id)).filter(Boolean) as Row[];
    const idKey = def.columns.find((c) => c.type === "id")?.key;
    const ops: Op[] = rows.map((r) => ({ op: "insert", sheet, data: Object.fromEntries(Object.entries(r.data).filter(([k]) => k !== idKey)), color: r.color }));
    const res = await applyOpsAction(ops);
    if (!res.ok) return toast.error(res.error);
    setStore((s) => mergeRows(s, res.data.rows));
    undoStack.current.push({ ops: res.data.rows.map((r) => ({ op: "restore", sheet, key: r.id })), inverse: res.data.rows.map((r) => ({ op: "delete", sheet, key: r.id })) });
    toast.success(`Duplicated ${rows.length} row${rows.length > 1 ? "s" : ""}`);
  }, [store, sheet, def]);

  const colorRows = useCallback((ids: string[], color: PaletteKey | null) => {
    const rows = ids.map((id) => store.rows.find((r) => r.id === id)).filter(Boolean) as Row[];
    void run(rows.map((r) => ({ op: "color", sheet, key: r.id, color })), rows.map((r) => ({ op: "color", sheet, key: r.id, color: r.color })));
  }, [run, sheet, store]);

  const bulkSet = useCallback((ids: string[], key: string, value: CellValue) => {
    const rows = ids.map((id) => store.rows.find((r) => r.id === id)).filter(Boolean) as Row[];
    void run(rows.map((r) => ({ op: "update", sheet, key: r.id, data: { [key]: value } })), rows.map((r) => ({ op: "update", sheet, key: r.id, data: { [key]: r.data[key] ?? null } })));
  }, [run, sheet, store]);

  /* ---------- add a value that is not in a dropdown yet: a new label, organisation, contact, partner… */
  const createOption = useCallback(async (c: ColumnDef, row: Row | null, label: string): Promise<string | null> => {
    if (!canWrite) { toast.error("You have view-only access."); return null; }
    const name = label.trim();
    if (!name) return null;
    if (c.type === "ref" && c.list) {
      const items = idx.refList.get(c.list) ?? [];
      const id = makeRefId(name, items.map((i) => i.item_id));
      const res = await upsertLabelAction(c.list, { item_id: id, name });
      if (!res.ok) { toast.error(res.error); return null; }
      const item: RefItem = { list: c.list, item_id: id, name, is_open: REF_LIST_BY_NAME.get(c.list)?.isopen ? true : null, market_id: null, color: null, position: Math.max(3, ...items.map((i) => i.position)) + 1 };
      setStore((s) => ({ ...s, refs: [...s.refs, item] }));
      toast.success(`Added “${name}” to ${displayHeader(def, c)}`);
      return id;
    }
    if (c.type !== "entity") return null;
    const target = entityTargetFor(c, row);
    if (!target) { toast.error("Set the reference type first."); return null; }
    // Reuse an organisation with the same name instead of creating a duplicate.
    const sameOrg = (idx.bySheet.get("Organisations") ?? []).find((o) => String(o.data.organisation ?? "").trim().toLowerCase() === name.toLowerCase());
    let ops: Op[] = [];
    let pickSheet = "";
    if (target === "Organisations") { ops = [{ op: "insert", sheet: "Organisations", data: { organisation: name } }]; pickSheet = "Organisations"; }
    else if (target === "Contacts") { ops = [{ op: "insert", sheet: "Contacts", data: { name, org_id: row?.data.org_id ?? null } }]; pickSheet = "Contacts"; }
    else if (target === "Freelancers") { ops = [{ op: "insert", sheet: "Freelancers", data: { name } }]; pickSheet = "Freelancers"; }
    else if (target === "Projects") { ops = [{ op: "insert", sheet: "Projects", data: { project: name, org_id: row?.data.org_id ?? null } }]; pickSheet = "Projects"; }
    else if (target === "@opportunity") { pickSheet = sheetMarket(row?.sheet ?? "") === "IN" ? "Pipeline_India" : "Pipeline_Global"; ops = [{ op: "insert", sheet: pickSheet, data: { opportunity: name } }]; }
    else if (target === "@partner") {
      pickSheet = sheetMarket(row?.sheet ?? "") === "IN" ? "Partners_India" : "Partners_Global";
      const orgKey = sameOrg?.row_key ?? nextRowKey(idx, "Organisations");
      const firstStage = (idx.refList.get("PStage") ?? [])[0]?.item_id ?? null;
      if (!sameOrg) ops.push({ op: "insert", sheet: "Organisations", data: { org_id: orgKey, organisation: name } });
      ops.push({ op: "insert", sheet: pickSheet, data: { org_id: orgKey, stage_id: firstStage } });
    }
    if (target === "Organisations" && sameOrg?.row_key) return sameOrg.row_key;
    const res = await applyOpsAction(ops);
    if (!res.ok) { toast.error(res.error); return null; }
    setStore((s) => mergeRows(s, res.data.rows));
    const created = res.data.rows.find((x) => x.sheet === pickSheet);
    if (!created?.row_key) return null;
    toast.success(`Created ${created.row_key} “${name}” in ${pickSheet.replace(/_/g, " ")}`, { description: "Open it on its board to fill in the rest." });
    return created.row_key;
  }, [canWrite, idx, def]);

  /* ---------- full screen, dashboard, notes */
  const [full, setFull] = useState(false);
  const toggleFull = useCallback(() => {
    setFull((f) => {
      const next = !f;
      try {
        if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
        if (!next && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      } catch {}
      return next;
    });
  }, []);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]") && !(e.target as HTMLElement).closest?.("input,textarea")) setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);
  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [full]);
  const showDash = prefs.boardDashboard;
  const toggleDash = () => setPrefs({ boardDashboard: !showDash }, { quiet: true });
  const markets = useMemo(() => [marketSummary(idx, "IN"), marketSummary(idx, "GL")], [idx]);
  const [notesFor, setNotesFor] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>(orgFiles);
  useEffect(() => setDocCounts(orgFiles), [orgFiles]);
  const [docsFor, setDocsFor] = useState<{ orgKey: string; title: string; uploadNow: boolean } | null>(null);
  const orgKeyOf = useCallback((r: Row) => (r.sheet === "Organisations" ? r.row_key : String(r.data.org_id ?? "")) || null, []);
  const docKey = docsFor?.orgKey ?? null;
  const onDocCount = useCallback((n: number) => { if (docKey) setDocCounts((c) => (c[docKey] === n ? c : { ...c, [docKey]: n })); }, [docKey]);

  /* ---------- realtime from other users, agents, the API and sheet pulls */
  useEffect(() => {
    const supabase = createClient();
    // Every sheet, not just this one: the dashboard above the board summarises all of them.
    const ch = supabase.channel(`cr-${sheet}`).on("postgres_changes", { event: "*", schema: "public", table: "cr_rows" }, (p) => {
      const r = p.new as Row & { workspace_id?: string };
      if (!r?.id) return;
      setStore((s) => mergeRows(s, [{ id: r.id, sheet: r.sheet, row_key: r.row_key, data: r.data, position: r.position, color: r.color, deleted_at: r.deleted_at, updated_at: r.updated_at, updated_via: r.updated_via }]));
    }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [sheet]);

  /* ---------- keyboard */
  const move = useCallback((dr: number, dc: number) => {
    setActive((a) => {
      if (!a) return flatRows[0] && columns[0] ? { rowId: flatRows[0].id, key: columns[0].key } : null;
      const ri = flatRows.findIndex((r) => r.id === a.rowId), ci = columns.findIndex((c) => c.key === a.key);
      const nr = flatRows[Math.max(0, Math.min(flatRows.length - 1, ri + dr))], nc = columns[Math.max(0, Math.min(columns.length - 1, ci + dc))];
      if (!nr || !nc) return a;
      const next = { rowId: nr.id, key: nc.key };
      requestAnimationFrame(() => cellEl(next)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
      return next;
    });
  }, [flatRows, columns]);

  const startEdit = useCallback((cell: Cell, seed?: string) => {
    const c = def.columns.find((x) => x.key === cell.key);
    if (!c || c.type === "formula" || !canWrite) return;
    setAnchor(cellEl(cell));
    setEditing({ ...cell, seed });
  }, [def, canWrite]);

  const pasteAt = useCallback(async (start: Cell, text: string) => {
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const ri = flatRows.findIndex((r) => r.id === start.rowId), ci = columns.findIndex((c) => c.key === start.key);
    const ops: Op[] = [], inverse: Op[] = [];
    lines.forEach((cells, dy) => {
      const row = flatRows[ri + dy];
      if (!row) return;
      const data: Record<string, CellValue> = {}, prev: Record<string, CellValue> = {};
      cells.forEach((val, dx) => {
        const c = columns[ci + dx];
        if (!c || c.type === "formula") return;
        data[c.key] = val.trim() === "" ? null : val.trim();
        prev[c.key] = row.data[c.key] ?? null;
      });
      if (Object.keys(data).length) { ops.push({ op: "update", sheet, key: row.id, data }); inverse.push({ op: "update", sheet, key: row.id, data: prev }); }
    });
    if (ops.length && (await run(ops, inverse))) toast.success(`Pasted into ${ops.length} row${ops.length > 1 ? "s" : ""}`);
  }, [flatRows, columns, run, sheet]);

  // Reorder helpers are defined further down; the key handler reaches them through refs.
  const placeRef = useRef<(t: DropTarget) => void>(() => {});
  const groupIdsRef = useRef<(id: string) => string[]>(() => []);
  const canDragRef = useRef(false);
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing || (e.target as HTMLElement).closest("input,textarea,select,[role=dialog]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); void (e.shiftKey ? redo() : undo()); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); void redo(); return; }
    if (!active) { if (e.key.startsWith("Arrow")) { e.preventDefault(); move(0, 0); } return; }
    const row = store.rows.find((r) => r.id === active.rowId);
    const c = def.columns.find((x) => x.key === active.key);
    if (!row || !c) return;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (!canDragRef.current) { toast("Clear the column sort to reorder rows"); return; }
      const ids = groupIdsRef.current(row.id), from = ids.indexOf(row.id), to = e.key === "ArrowUp" ? from - 1 : from + 1;
      if (from >= 0 && to >= 0 && to < ids.length) { const rest = ids.filter((x) => x !== row.id); placeRef.current({ id: row.id, afterId: rest[to - 1] ?? null, beforeId: rest[to] ?? null, from, to }); }
      return;
    }
    const map: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (map[e.key]) { e.preventDefault(); move(...map[e.key]); return; }
    if (e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(active); return; }
    if (e.key === "Escape") { setActive(null); setSelected(new Set()); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && c.type !== "formula") { e.preventDefault(); setCell(row, c.key, null); return; }
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      const v = displayValue(idx, c, computed.get(row.id)?.all[c.key], row);
      void navigator.clipboard.writeText(v).then(() => toast("Copied"), () => toast.error("Clipboard blocked by the browser"));
      return;
    }
    if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault();
      void navigator.clipboard.readText().then((t) => pasteAt(active, t), () => toast.error("Allow clipboard access to paste"));
      return;
    }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); void duplicateRows([row.id]); return; }
    if (e.key.length === 1 && !mod && !e.altKey && ["text", "longtext", "number", "email", "url", "id", "date"].includes(c.type)) { e.preventDefault(); startEdit(active, e.key); return; }
    if (e.key === " " && ["ref", "entity", "choice"].includes(c.type)) { e.preventDefault(); startEdit(active); }
  }, [editing, active, store, def, move, startEdit, setCell, idx, computed, pasteAt, undo, redo, duplicateRows]);

  /* ---------- reorder (priority) */
  const canDrag = !view.sort && canWrite;
  const priority = useMemo(() => priorityNumbers(store.rows, sheet, hasArchive ? (r) => String(r.data.archived ?? "").toUpperCase() === "Y" : undefined), [store.rows, sheet, hasArchive]);
  const [announce, setAnnounce] = useState("");
  const placeAt = useCallback((t: DropTarget) => {
    // Anchor on the row above in the visible list; at the top of a filtered list or group, keep it just ahead of the row below.
    let after = t.afterId;
    if (!after && t.beforeId) {
      const full = orderedRows(store.rows, sheet).filter((r) => r.id !== t.id);
      const i = full.findIndex((r) => r.id === t.beforeId);
      after = i > 0 ? full[i - 1].id : null;
    }
    const original = rowBefore(store.rows, sheet, t.id);
    if (after === original) return;
    const moved = store.rows.find((r) => r.id === t.id);
    const label = (moved && entityName(idx, moved)) || moved?.row_key || "Row";
    void run([{ op: "place", sheet, key: t.id, after }], [{ op: "place", sheet, key: t.id, after: original }], { quiet: true }).then((ok) => {
      if (!ok) return;
      const n = priorityNumbers(applyLocal(store, [{ op: "place", sheet, key: t.id, after }]).rows, sheet).get(t.id);
      setAnnounce(`${label} moved to priority ${n ?? t.to + 1}`);
    });
  }, [store, sheet, run, idx]);
  const drag = useRowDrag({ containerRef: gridRef, onDrop: placeAt, enabled: canDrag });
  useEffect(() => { placeRef.current = placeAt; canDragRef.current = canDrag; }, [placeAt, canDrag]);
  const groupIdsOf = useCallback((id: string) => groups.find((g) => g.rows.some((r) => r.id === id))?.rows.map((r) => r.id) ?? [], [groups]);
  useEffect(() => { groupIdsRef.current = groupIdsOf; }, [groupIdsOf]);

  /* ---------- export */
  const exportCsv = useCallback(() => {
    const rows = selected.size ? flatRows.filter((r) => selected.has(r.id)) : flatRows;
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = columns.map((c) => esc(displayHeader(def, c)));
    const body = rows.map((r) => columns.map((c) => esc(displayValue(idx, c, computed.get(r.id)?.all[c.key], r))).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sheet}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [selected, flatRows, columns, def, idx, computed, sheet]);

  const [syncing, startSync] = useTransition();
  const syncNow = () => startSync(async () => {
    const r = await syncAction("both");
    if (r.ok) { toast.success(r.message ?? "Synced"); router.refresh(); } else toast.error(r.error);
  });

  const openTrash = async () => { const r = await trashAction(sheet); if (r.ok) setTrash(r.data); else toast.error(r.error); };

  const commitInline = (v: string, mv?: "down" | "right" | "left") => {
    const er = editing ? store.rows.find((r) => r.id === editing.rowId) : null;
    const ec = editing ? def.columns.find((c) => c.key === editing.key) : null;
    if (er && ec) setCell(er, ec.key, v.trim() === "" ? null : v);
    setEditing(null);
    gridRef.current?.focus({ preventScroll: true });
    if (mv === "down") move(1, 0); else if (mv === "right") move(0, 1); else if (mv === "left") move(0, -1);
  };
  const cancelInline = () => { setEditing(null); gridRef.current?.focus({ preventScroll: true }); };
  const editingCol = editing ? def.columns.find((c) => c.key === editing.key) ?? null : null;
  const editingRow = editing ? store.rows.find((r) => r.id === editing.rowId) ?? null : null;
  const allIds = flatRows.map((r) => r.id);
  const totalIssues = [...computed.values()].filter((c) => c.issues.length).length;
  const refCols = def.columns.filter((c) => c.type === "ref" || c.type === "choice");
  const activeFilters = Object.values(view.filters).filter((v) => v.length).length + (view.issuesOnly ? 1 : 0);
  const tableWidth = LEAD + columns.reduce((s, c) => s + width(c), 0) + 44;

  const kanbanCol = groupCol ?? def.columns.find((c) => c.type === "ref" || c.type === "choice") ?? null;
  const notesCount = noteKey || def.columns.some((c) => c.key === "org_id") || sheet === "Organisations" ? (idx.bySheet.get(sheet) ?? []).filter((r) => noteInfo(r).has).length : 0;

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", full && "fixed inset-0 z-40 overflow-y-auto bg-canvas px-4 py-4 sm:px-6")}>
      {!full && (
        <section aria-label="India and Global at a glance" className={cn("flex flex-col gap-3", showDash && "min-h-[50dvh] pb-2")}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Central Repository at a glance</p>
              <h2 className="text-base font-semibold tracking-tight text-ink">India and Global markets</h2>
            </div>
            <button type="button" onClick={toggleDash} aria-expanded={showDash} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs text-ink-2 neo-raised-sm hover:text-oxblood">
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />{showDash ? "Hide dashboard" : "Show dashboard"}
            </button>
          </div>
          {showDash && <MarketDashboard markets={markets} />}
        </section>
      )}
      {!full && <SheetTabs sheet={sheet} counts={counts} />}
      {full && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-base font-semibold tracking-tight text-ink">{def.title}</h2>
          <button type="button" onClick={toggleFull} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-ink-2 neo-raised-sm hover:text-oxblood"><Minimize2 className="h-3.5 w-3.5" aria-hidden />Exit full screen<span className="text-ink-3">Esc</span></button>
        </div>
      )}
      {/* toolbar: view | create & search | shape the table | history & actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="View" className="inline-flex h-9 items-center gap-0.5 rounded-full neo-inset-sm p-1">
          <ToolIcon label="Table view" active={view.mode !== "kanban"} onClick={() => patchView({ mode: "table" })}><Table2 className="h-4 w-4" /></ToolIcon>
          <ToolIcon label={kanbanCol ? `Kanban view (cards by ${displayHeader(def, kanbanCol)})` : "Kanban needs a dropdown column"} active={view.mode === "kanban"} disabled={!kanbanCol} onClick={() => patchView({ mode: "kanban", ...(groupCol ? {} : { groupBy: kanbanCol?.key ?? null }) })}><KanbanSquare className="h-4 w-4" /></ToolIcon>
        </div>
        {canWrite && <Button variant="primary" size="sm" onClick={() => void addRow()}><Plus className="h-3.5 w-3.5" aria-hidden />New item</Button>}
        <label className="flex h-9 min-w-0 flex-1 basis-40 items-center gap-2 rounded-full neo-inset-sm px-3 sm:max-w-64">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${def.name.replace(/_/g, " ")}`} aria-label="Search rows" className="w-full min-w-0 bg-transparent text-xs text-ink outline-none placeholder:text-ink-3" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X className="h-3.5 w-3.5 text-ink-3" /></button>}
        </label>
        <div role="group" aria-label="Filter and arrange" className="inline-flex h-9 items-center gap-0.5 rounded-full neo-inset-sm p-1">
          <FilterMenu def={def} idx={idx} refCols={refCols} view={view} patchView={patchView} count={activeFilters} issues={totalIssues} />
          {notesCount > 0 && (
            <ToolIcon label={view.notesOnly ? "Showing only rows with notes. Click to show all" : `Only rows with notes (${notesCount})`} active={!!view.notesOnly} onClick={() => patchView({ notesOnly: !view.notesOnly })} badge={view.notesOnly ? notesCount : undefined} tone="warning">
              <StickyNote className="h-4 w-4" />
            </ToolIcon>
          )}
          {hasArchive && (
            <ToolIcon label={view.showArchived ? "Hide archived rows" : `Show archived rows (${archivedCount})`} active={!!view.showArchived} onClick={() => patchView({ showArchived: !view.showArchived })} badge={view.showArchived ? archivedCount : undefined}>
              <Archive className="h-4 w-4" />
            </ToolIcon>
          )}
          <span className="mx-0.5 h-4 w-px bg-hairline" aria-hidden />
          <ToolMenu icon={Layers} iconOnly label={groupCol ? `Grouped by ${displayHeader(def, groupCol)}` : "Group rows"} highlight={!!groupCol}>
            {(close) => (
              <MenuList>
                <MenuItem active={!view.groupBy} onClick={() => { patchView({ groupBy: null }); close(); }}>No grouping</MenuItem>
                {def.columns.filter((c) => c.type === "ref" || c.type === "choice" || c.type === "entity").map((c) => (
                  <MenuItem key={c.key} active={view.groupBy === c.key} onClick={() => { patchView({ groupBy: c.key, collapsed: [] }); close(); }}>{displayHeader(def, c)}</MenuItem>
                ))}
              </MenuList>
            )}
          </ToolMenu>
          <ToolMenu icon={Lock} iconOnly label={frozenCount ? `First ${frozenCount} column${frozenCount > 1 ? "s" : ""} frozen` : "Freeze columns"} badge={frozenCount || undefined}>
            {(close) => (
              <MenuList>
                {[0, 1, 2, 3, 4, 5].map((n) => <MenuItem key={n} active={frozenCount === n} onClick={() => { patchView({ frozen: n }); close(); }}>{n === 0 ? "No frozen columns" : `Freeze first ${n} column${n > 1 ? "s" : ""}`}{columns[n - 1] ? <span className="ml-auto pl-3 text-ink-3">to {displayHeader(def, columns[n - 1])}</span> : null}</MenuItem>)}
              </MenuList>
            )}
          </ToolMenu>
          <ToolMenu icon={Columns3} iconOnly label={view.hidden.length ? `Columns (${view.hidden.length} hidden)` : "Show or hide columns"} highlight={view.hidden.length > 0}>
            {() => (
              <div className="max-h-80 overflow-y-auto p-1.5">
                <label className="flex items-center gap-2 rounded-neo-sm px-2.5 py-1.5 text-xs font-medium text-ink"><input type="checkbox" checked={view.showLookups} onChange={(e) => patchView({ showLookups: e.target.checked })} className="accent-[var(--brand-oxblood)]" />Show lookup &amp; ID columns</label>
                <div className="my-1 border-t border-hairline" />
                {def.columns.filter((c) => c.key !== "row_check" && (view.showLookups || !isLookupCol(def, c))).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded-neo-sm px-2.5 py-1 text-xs text-ink-2 hover:bg-sunken/60">
                    <input type="checkbox" checked={!view.hidden.includes(c.key)} onChange={(e) => patchView({ hidden: e.target.checked ? view.hidden.filter((h) => h !== c.key) : [...view.hidden, c.key] })} className="accent-[var(--brand-oxblood)]" />
                    {displayHeader(def, c)}{c.type === "formula" && <span className="ml-auto text-ink-3">calculated</span>}
                  </label>
                ))}
                <div className="my-1 border-t border-hairline" />
                <button type="button" onClick={() => patchView({ ...defaultView(def), groupBy: view.groupBy })} className="w-full rounded-neo-sm px-2.5 py-1.5 text-left text-xs text-oxblood hover:bg-sunken/60">Reset widths, columns &amp; freeze</button>
              </div>
            )}
          </ToolMenu>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
          <SavedViews sheet={sheet} view={view} activeId={activeViewId} canWrite={canWrite} onApply={applyView} onReset={() => applyView(null, null)}
            density={prefs.boardDensity} onDensity={(d) => setPrefs({ boardDensity: d }, { quiet: true })} />
          <div role="group" aria-label="History and export" className="inline-flex h-9 items-center gap-0.5 rounded-full neo-inset-sm p-1">
            <ToolIcon label="Undo (Ctrl+Z)" onClick={() => void undo()}><Undo2 className="h-4 w-4" /></ToolIcon>
            <ToolIcon label="Redo (Ctrl+Y)" onClick={() => void redo()}><Redo2 className="h-4 w-4" /></ToolIcon>
            <span className="mx-0.5 h-4 w-px bg-hairline" aria-hidden />
            <ToolIcon label={selected.size ? `Export ${selected.size} selected row${selected.size > 1 ? "s" : ""} as CSV` : "Export visible rows as CSV"} onClick={exportCsv}><Download className="h-4 w-4" /></ToolIcon>
            <ToolIcon label="Deleted rows (restore)" onClick={() => void openTrash()}><Trash2 className="h-4 w-4" /></ToolIcon>
            <ToolIcon label={full ? "Exit full screen (Esc)" : "Full screen"} active={full} onClick={toggleFull}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</ToolIcon>
          </div>
          {canWrite && <Button size="sm" onClick={() => setMunshi(true)}><Sparkles className="h-3.5 w-3.5 text-oxblood" aria-hidden />Ask Munshi</Button>}
        </div>
      </div>

      {/* sync status */}
      <SyncStrip link={link} busy={busy > 0} syncing={syncing} onSync={syncNow} issues={totalIssues} onIssues={() => patchView({ issuesOnly: !view.issuesOnly })} issuesOnly={view.issuesOnly} />

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-full neo-raised-sm px-4 py-2 text-xs">
          <span className="font-medium text-ink">{selected.size} selected</span>
          <span className="h-4 w-px bg-hairline" />
          {canWrite && <BulkSet def={def} idx={idx} onSet={(k, v) => bulkSet([...selected], k, v)} />}
          {canWrite && <ToolMenu icon={Palette} label="Colour" small>{(close) => <ColorGrid onPick={(c) => { colorRows([...selected], c); close(); }} />}</ToolMenu>}
          {canWrite && <button type="button" onClick={() => void duplicateRows([...selected])} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-2 hover:bg-sunken/70"><Copy className="h-3.5 w-3.5" />Duplicate</button>}
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-2 hover:bg-sunken/70"><Download className="h-3.5 w-3.5" />Export</button>
          {canWrite && <button type="button" onClick={() => void deleteRows([...selected])} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-danger hover:bg-sunken/70"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-3 hover:bg-sunken/70"><X className="h-3.5 w-3.5" />Clear</button>
        </div>
      )}

      {view.mode === "kanban" && kanbanCol ? (
        <KanbanView
          groups={groups} groupCol={kanbanCol} def={def} idx={idx} computed={computed} nameKey={nameKey} columns={columns} canWrite={canWrite} full={full}
          noteInfo={noteInfo} onOpen={(id) => setDrawer(id)}
          onMove={(id, key) => { const row = store.rows.find((x) => x.id === id); if (row) setCell(row, kanbanCol.key, key || null); }}
          onAdd={(key) => void addRow(key ? { [kanbanCol.key]: key } : {})}
        />
      ) : (<>
      {/* grid */}
      <div
        ref={gridRef} tabIndex={0} onKeyDown={onKeyDown} role="grid" data-density={prefs.boardDensity} aria-label={def.name} aria-rowcount={flatRows.length}
        className={cn("relative min-h-64 overflow-auto", full ? "max-h-[calc(100dvh-9.5rem)]" : "max-h-[calc(100dvh-17rem)]", " rounded-neo neo-raised outline-none focus-visible:ring-2 focus-visible:ring-oxblood/30")}
      >
        <table className="border-separate border-spacing-0 text-sm" style={{ width: tableWidth, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: LEAD }} />
            {columns.map((c) => <col key={c.key} style={{ width: width(c) }} />)}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-hairline bg-canvas px-2 py-2.5">
                <input
                  type="checkbox" aria-label="Select all rows" className="accent-[var(--brand-oxblood)]"
                  checked={allIds.length > 0 && allIds.every((id) => selected.has(id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
                />
                <Tip content={view.sort ? "Priority order (clear the column sort to see and drag rows in priority order)" : "Priority: drag rows, or Alt+arrow keys, to reorder"}>
                  <span className="ml-2 cursor-help font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">#</span>
                </Tip>
                <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 text-ink-3" aria-hidden>
                  <Tip content="Notes: amber when a row has notes"><StickyNote className="h-3 w-3" /></Tip>
                  <Tip content="Documents: click a row's clip to open or upload"><Paperclip className="h-3 w-3" /></Tip>
                </span>
              </th>
              {columns.map((c, i) => (
                <HeaderCell
                  key={c.key} def={def} c={c} left={lefts[i]} lastFrozen={i === frozenCount - 1} sort={view.sort}
                  onSort={(dir) => patchView({ sort: dir ? { key: c.key, dir } : null })}
                  onHide={() => patchView({ hidden: [...view.hidden, c.key] })}
                  onFreeze={() => patchView({ frozen: i + 1 })}
                  onGroup={c.type === "ref" || c.type === "choice" || c.type === "entity" ? () => patchView({ groupBy: c.key, collapsed: [] }) : undefined}
                  onManage={c.type === "ref" && c.list ? () => setLabelsList(c.list!) : undefined}
                  onResize={(w) => patchView({ widths: { ...view.widths, [c.key]: w } })}
                  width={width(c)}
                />
              ))}
              <th className="sticky top-0 z-20 border-b border-hairline bg-canvas" aria-hidden />
            </tr>
          </thead>
          {groups.map((g) => {
            const collapsed = view.collapsed.includes(g.key);
            const groupIds = g.rows.map((r) => r.id);
            return (
              <tbody key={g.key}>
                {groupCol && (
                  <tr>
                    <td colSpan={columns.length + 2} className="bg-canvas px-2 pb-1 pt-4">
                      <div className="sticky left-2 flex w-max items-center gap-2">
                        <button type="button" onClick={() => patchView({ collapsed: collapsed ? view.collapsed.filter((k) => k !== g.key) : [...view.collapsed, g.key] })} className="grid h-6 w-6 place-items-center rounded-full text-ink-2 hover:bg-sunken/70" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${g.label}`}>
                          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <span className={cn("h-3 w-1 rounded-full", PALETTE[g.color].bar)} aria-hidden />
                        <span className="text-sm font-semibold text-ink">{g.label}</span>
                        <span className="text-xs text-ink-3">{g.rows.length} item{g.rows.length === 1 ? "" : "s"}</span>
                        {!collapsed && g.rows.length > 0 && (
                          <input type="checkbox" aria-label={`Select all in ${g.label}`} className="ml-1 accent-[var(--brand-oxblood)]" checked={groupIds.every((id) => selected.has(id))}
                            onChange={(e) => setSelected((s) => { const n = new Set(s); groupIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; })} />
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!collapsed && g.rows.map((r) => (
                  <BoardRow
                    key={r.id} nameKey={nameKey} row={r} def={def} columns={columns} lefts={lefts} frozenCount={frozenCount} idx={idx} groupColor={g.color}
                    computed={computed.get(r.id)!} selected={selected.has(r.id)} active={active?.rowId === r.id ? active.key : null}
                    editingKey={editing?.rowId === r.id ? editing.key : null} dragging={drag.dragging === r.id}
                    priority={priority.get(r.id) ?? null} dragStyle={drag.rowStyle(r.id)} grip={drag.handleProps(r.id, groupIds)}
                    editor={editing?.rowId === r.id ? (c: ColumnDef) => <InlineEditor c={c} initial={editing.seed ?? String(r.data[c.key] ?? "")} onCommit={commitInline} onCancel={cancelInline} /> : undefined}
                    onSelect={(on) => setSelected((s) => { const n = new Set(s); if (on) n.add(r.id); else n.delete(r.id); return n; })}
                    onActivate={(key) => { setActive({ rowId: r.id, key }); gridRef.current?.focus({ preventScroll: true }); }}
                    onEdit={(key) => startEdit({ rowId: r.id, key })}
                    onOpen={() => setDrawer(r.id)}
                    canDrag={canDrag} sorted={!!view.sort}
                    onMenu={(el) => setRowMenu({ id: r.id, el })}
                    notes={noteInfo(r)} notesKey={noteKey} onNotes={(el) => setNotesFor({ id: r.id, el })}
                    docs={orgKeyOf(r) ? docCounts[orgKeyOf(r)!] ?? 0 : -1}
                    onDocs={() => { const k = orgKeyOf(r); if (k) setDocsFor({ orgKey: k, title: entityName(idx, r) || k, uploadNow: canWrite && !(docCounts[k] > 0) }); }}
                  />
                ))}
                {!collapsed && canWrite && (
                  <tr>
                    <td className="sticky left-0 z-10 border-b border-hairline/60 bg-canvas" />
                    <td colSpan={columns.length + 1} className="border-b border-hairline/60 bg-canvas">
                      <button type="button" onClick={() => void addRow(groupCol && g.key !== "__all" && g.key ? { [groupCol.key]: g.key } : {})} className="sticky left-16 flex w-max items-center gap-1.5 px-3 py-2 text-xs text-ink-3 hover:text-oxblood">
                        <Plus className="h-3.5 w-3.5" aria-hidden />Add item{groupCol && g.key ? ` to ${g.label}` : ""}
                      </button>
                    </td>
                  </tr>
                )}
                {!collapsed && g.rows.length > 0 && <SummaryRow columns={columns} lefts={lefts} rows={g.rows} computed={computed} idx={idx} />}
              </tbody>
            );
          })}
        </table>
        {drag.indicatorTop !== null && (
          <div aria-hidden className="pointer-events-none absolute left-0 z-40 h-0.5 rounded-full bg-oxblood" style={{ top: drag.indicatorTop - 1, width: tableWidth }}>
            <span className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full bg-oxblood" />
          </div>
        )}
        <div role="status" aria-live="polite" className="sr-only">{announce}</div>
        {flatRows.length === 0 && groups.length === 0 && (
          <div className="grid place-items-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-ink">{q || activeFilters ? "No rows match" : "No rows yet"}</p>
            <p className="mt-1 text-xs text-ink-3">{q || activeFilters ? "Clear the search or filters." : "Add an item, ask Munshi, or import the workbook from Sync & access."}</p>
          </div>
        )}
      </div>
      <p className="text-[0.6875rem] text-ink-3">
        Click a cell to select, Enter or type to edit, arrows to move, Ctrl+C / Ctrl+V to copy and paste (multi-cell paste from Excel or Sheets works), Delete to clear, Ctrl+Z to undo, Ctrl+D to duplicate. Columns marked ƒ are calculated like the sheet&apos;s formulas. The note marker at the start of a row opens its notes.
      </p>
      </>)}

      {/* editors */}
      {editing && editingCol && editingRow && ["ref", "entity", "choice"].includes(editingCol.type) && (
        <OptionPicker
          anchor={anchor} value={String(editingRow.data[editingCol.key] ?? "")}
          options={optionsFor(editingCol, editingRow, idx)}
          emptyHint={editingCol.type === "entity" && !entityTargetFor(editingCol, editingRow) ? "Set Ref type first." : undefined}
          onPick={(v) => { setCell(editingRow, editingCol.key, v); setEditing(null); gridRef.current?.focus({ preventScroll: true }); }}
          onClose={() => { setEditing(null); gridRef.current?.focus({ preventScroll: true }); }}
          onManage={editingCol.type === "ref" && editingCol.list ? () => { setEditing(null); setLabelsList(editingCol.list!); } : undefined}
          onCreate={canWrite && (editingCol.type === "ref" || (editingCol.type === "entity" && !!entityTargetFor(editingCol, editingRow))) ? (label) => {
            const col = editingCol, row = editingRow;
            setEditing(null);
            void createOption(col, row, label).then((key) => { if (key) setCell(row, col.key, key); gridRef.current?.focus({ preventScroll: true }); });
          } : undefined}
          createNoun={editingCol.type === "ref" ? "label" : (ENTITY_LABEL[entityTargetFor(editingCol, editingRow) ?? "@any"] ?? "record").toLowerCase()}
        />
      )}
      {editing && editingCol && editingRow && editingCol.type === "longtext" && (
        <LongTextEditor
          anchor={anchor} c={editingCol} initial={editing.seed ?? String(editingRow.data[editingCol.key] ?? "")}
          onCommit={(v) => { setCell(editingRow, editingCol.key, v.trim() === "" ? null : v); setEditing(null); gridRef.current?.focus({ preventScroll: true }); }}
          onCancel={() => { setEditing(null); gridRef.current?.focus({ preventScroll: true }); }}
        />
      )}
      {rowMenuState()}
      {docsFor && <DocumentsDialog key={docsFor.orgKey} orgKey={docsFor.orgKey} title={docsFor.title} uploadNow={docsFor.uploadNow} canWrite={canWrite} onClose={() => setDocsFor(null)} onCount={onDocCount} />}
      {notesFor && (() => {
        const nr = store.rows.find((x) => x.id === notesFor.id);
        if (!nr) return null;
        return (
          <NotesPopover
            key={nr.id} anchor={notesFor.el} row={nr} noteKey={noteKey} info={noteInfo(nr)} canWrite={canWrite} title={entityName(idx, nr) || nr.row_key || "Row"}
            onSave={(v) => { if (noteKey) setCell(nr, noteKey, v.trim() === "" ? null : v); setNotesFor(null); }}
            onOpen={() => { setNotesFor(null); setDrawer(nr.id); }}
            onClose={() => setNotesFor(null)}
          />
        );
      })()}

      <RowDrawer
        open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)} rowId={drawer} store={live} idx={idx} def={def} canWrite={canWrite}
        onSet={setCell} onDelete={(id) => { setDrawer(null); void deleteRows([id]); }} onDuplicate={(id) => void duplicateRows([id])}
      />
      {labelsList && <LabelsModal list={labelsList} idx={idx} canWrite={canWrite} onClose={() => setLabelsList(null)} onChange={(refs: RefItem[]) => setStore((s) => ({ ...s, refs: [...s.refs.filter((r) => r.list !== labelsList), ...refs] }))} />}
      <MunshiPanel open={munshi} onOpenChange={setMunshi} sheet={sheet} idx={idx} onApplied={(rows) => setStore((s) => mergeRows(s, rows))} />

      <Modal open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)} title="Delete referenced rows?" description="Other rows point at what you're deleting. They will show as invalid until you update them."
        footer={<><Button size="sm" onClick={() => setConfirmDel(null)}>Cancel</Button><Button size="sm" variant="danger" onClick={() => { const ids = confirmDel!.ids; setConfirmDel(null); void deleteRows(ids, true); }}>Delete anyway</Button></>}>
        <p className="whitespace-pre-line text-sm text-ink-2">{confirmDel?.message}</p>
      </Modal>

      <Modal open={!!trash} onOpenChange={(o) => !o && setTrash(null)} title="Deleted rows" description="Restore a row to put it back in gulel and the Google Sheet." wide>
        {trash && trash.length === 0 && <p className="text-sm text-ink-3">Nothing deleted in this sheet.</p>}
        <ul className="flex flex-col gap-2">
          {trash?.map((r) => {
            const nameCol = def.columns.find((c) => NAME_KEYS.has(c.key) && c.type !== "formula");
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-neo-sm neo-inset-sm px-3 py-2 text-sm">
                <span className="font-mono text-xs text-ink-3">{r.row_key ?? "—"}</span>
                <span className="truncate text-ink">{nameCol ? String(r.data[nameCol.key] ?? "") : ""}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-3">{r.deleted_at ? new Date(r.deleted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}</span>
                {canWrite && <Button size="sm" onClick={async () => {
                  if (await run([{ op: "restore", sheet, key: r.id }], [{ op: "delete", sheet, key: r.id }])) { setStore((s) => mergeRows(s, [{ ...r, deleted_at: null }])); setTrash((t) => t?.filter((x) => x.id !== r.id) ?? null); toast.success("Restored"); }
                }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Restore</Button>}
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );

  function rowMenuState() {
    if (!rowMenu) return null;
    const r = store.rows.find((x) => x.id === rowMenu.id);
    if (!r) return null;
    const close = () => setRowMenu(null);
    return (
      <Floating anchor={rowMenu.el} onClose={close} width={220}>
        <MenuList>
          <MenuItem onClick={() => { setDrawer(r.id); close(); }}><Maximize2 className="h-3.5 w-3.5" />Open item</MenuItem>
          {canWrite && <MenuItem onClick={() => { void duplicateRows([r.id]); close(); }}><Copy className="h-3.5 w-3.5" />Duplicate</MenuItem>}
          {canWrite && <div className="px-2.5 pb-1 pt-2 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3">Row colour</div>}
          {canWrite && <ColorGrid onPick={(c) => { colorRows([r.id], c); close(); }} current={r.color} />}
          {canWrite && hasArchive && (String(r.data.archived ?? "").toUpperCase() === "Y"
            ? <MenuItem onClick={() => { setCell(r, "archived", "N"); close(); }}><ArchiveRestore className="h-3.5 w-3.5" />Reinstate</MenuItem>
            : <MenuItem onClick={() => { setCell(r, "archived", "Y"); close(); }}><Archive className="h-3.5 w-3.5" />Archive</MenuItem>)}
          {canWrite && <MenuItem danger onClick={() => { void deleteRows([r.id]); close(); }}><Trash2 className="h-3.5 w-3.5" />Delete</MenuItem>}
        </MenuList>
      </Floating>
    );
  }
}

/* ---------------------------------------------------------------- pieces */

type NoteInfo = { text: string; gulel: number; has: boolean };

const BoardRow = memo(function BoardRow({ editor, nameKey, row, columns, lefts, frozenCount, idx, computed, selected, active, editingKey, dragging, groupColor, onSelect, onActivate, onEdit, onOpen, canDrag, sorted, priority, dragStyle, grip, onMenu, notes, notesKey, onNotes, docs, onDocs }: {
  editor?: (c: ColumnDef) => React.ReactNode; nameKey: string; row: Row; def: SheetDef; columns: ColumnDef[]; lefts: number[]; frozenCount: number; idx: ReturnType<typeof buildIndex>;
  computed: { all: Record<string, CellValue>; issues: string[] }; selected: boolean; active: string | null; editingKey: string | null; dragging: boolean; groupColor: PaletteKey;
  onSelect: (on: boolean) => void; onActivate: (key: string) => void; onEdit: (key: string) => void; onOpen: () => void;
  canDrag: boolean; sorted: boolean; priority: number | null; dragStyle?: React.CSSProperties; grip: ReturnType<ReturnType<typeof useRowDrag>["handleProps"]>; onMenu: (el: HTMLElement) => void;
  notes: NoteInfo; notesKey: string | null; onNotes: (el: HTMLElement) => void;
  /** Documents on the row's organisation; -1 when the row has no organisation. */
  docs: number; onDocs: () => void;
}) {
  const isOpen = computed.all.is_open !== "N";
  const tint = row.color && row.color in PALETTE ? PALETTE[row.color as PaletteKey].row : "";
  const bg = selected ? "bg-sunken" : "bg-canvas";
  return (
    <tr className={cn("group", dragging && "[&>td]:!bg-raised")} aria-selected={selected} data-row-id={row.id} style={dragStyle}>
      <td className={cn("sticky left-0 z-10 border-b border-hairline/60 p-0", bg)}>
        <div className={cn("flex h-9 items-center gap-1 border-l-[3px] pl-1", tint)} style={{ borderLeftColor: `var(--color-${row.color ? colorVar(row.color as PaletteKey) : colorVar(groupColor)})` }}>
          <Tip content={canDrag ? "Drag to reorder, or focus and press the up and down arrows (Alt+arrow from any cell)" : sorted ? "Clear the column sort to reorder" : "View only"}>
            <button
              type="button" {...(canDrag ? grip : {})} onMouseDown={(e) => e.stopPropagation()} aria-disabled={!canDrag}
              aria-label={`Priority ${priority ?? "none"}. ${canDrag ? "Drag, or press the up or down arrow, to reorder" : "Reordering unavailable"}`}
              className={cn("grid h-6 w-4 shrink-0 touch-none place-items-center rounded text-ink-3 opacity-30 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood", canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed")}
            ><GripVertical className="h-3.5 w-3.5" /></button>
          </Tip>
          <span className={cn("w-6 shrink-0 text-right font-mono text-[0.6875rem] tabular", priority ? "text-ink-2" : "text-ink-3/50")} title={priority ? `Priority ${priority}` : "Archived: no priority"}>{priority ?? "–"}</span>
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${row.row_key ?? "row"}`} className="accent-[var(--brand-oxblood)]" />
          {computed.issues.length > 0 ? (
            <span title={computed.issues.join("\n")} className="grid h-5 w-5 place-items-center"><AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={`${computed.issues.length} data issue(s): ${computed.issues.join("; ")}`} /></span>
          ) : <span className="grid h-5 w-5 place-items-center" title="Row check: OK"><Check className="h-3 w-3 text-ink-3/50" aria-hidden /></span>}
          <NoteMarker notes={notes} enabled={!!notesKey || notes.gulel > 0 || row.sheet === "Organisations" || "org_id" in row.data} onOpen={onNotes} />
          <DocsMarker count={Math.max(0, docs)} enabled={docs >= 0} onOpen={onDocs} />
        </div>
      </td>
      {columns.map((c, i) => {
        const v = computed.all[c.key];
        const isName = c.key === nameKey;
        const isActive = active === c.key;
        const invalid = c.type !== "formula" && computed.issues.some((x) => x.endsWith(c.header) || x === `Invalid ${c.header}`);
        const frozen = lefts[i] >= 0;
        return (
          <td
            key={c.key} data-cell={`${row.id}:${c.key}`} role="gridcell" aria-selected={isActive}
            onMouseDown={() => onActivate(c.key)}
            onDoubleClick={() => onEdit(c.key)}
            onClick={() => { if (isActive && ["ref", "entity", "choice"].includes(c.type)) onEdit(c.key); }}
            style={frozen ? { left: lefts[i] } : undefined}
            className={cn(
              "relative h-9 overflow-hidden border-b border-l border-hairline/60 px-2.5 align-middle",
              // Solid background always (frozen columns must hide what scrolls under them); tints go on an overlay.
              bg,
              frozen && "sticky z-10",
              i === frozenCount - 1 && "shadow-[6px_0_8px_-6px_rgba(0,0,0,0.18)]",
              c.type === "ref" && "px-1.5 text-center",
              invalid && "ring-1 ring-inset ring-danger/50",
              c.key === notesKey && notes.text && "shadow-[inset_3px_0_0_var(--state-warning)]",
              isActive && "z-[15] outline outline-2 -outline-offset-2 outline-oxblood",
              editingKey === c.key && c.type === "date" && "overflow-visible",
            )}
          >
            <span aria-hidden className={cn("pointer-events-none absolute inset-0", tint, c.type === "formula" && "bg-sunken/40", c.key === notesKey && notes.text && "bg-warning/[0.07]")} />
            {editingKey === c.key && editor && INLINE_TYPES.has(c.type) && editor(c)}
            <div className="relative flex min-w-0 items-center gap-1">
              <div className={cn("min-w-0 flex-1 truncate", c.type === "ref" && "flex justify-center")}><CellView c={c} value={v} row={row} idx={idx} isOpen={isOpen} /></div>
              {isName && (
                <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center rounded-full bg-canvas/95 opacity-0 shadow-sm group-hover:opacity-100">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} onMouseDown={(e) => e.stopPropagation()} className="grid h-6 w-6 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-oxblood" aria-label="Open item"><Maximize2 className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }} onMouseDown={(e) => e.stopPropagation()} className="grid h-6 w-6 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-oxblood" aria-label="Row actions"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </div>
          </td>
        );
      })}
      <td className={cn("border-b border-l border-hairline/60", bg)} />
    </tr>
  );
});

/** The notes marker at the start of each row: an amber chip when the row (or its organisation in gulel) has notes. */
function NoteMarker({ notes, enabled, onOpen }: { notes: NoteInfo; enabled: boolean; onOpen: (el: HTMLElement) => void }) {
  if (!enabled) return <span className="w-6" aria-hidden />;
  const preview = [
    notes.text ? notes.text.slice(0, 240) + (notes.text.length > 240 ? "…" : "") : "",
    notes.gulel ? `${notes.gulel} note${notes.gulel > 1 ? "s" : ""} on the organisation in gulel` : "",
  ].filter(Boolean).join("\n\n");
  return (
    <button
      type="button" onClick={(e) => { e.stopPropagation(); onOpen(e.currentTarget); }} onMouseDown={(e) => e.stopPropagation()}
      title={notes.has ? preview : "Add a note"} aria-label={notes.has ? `Notes: ${preview}` : "Add a note"}
      className={cn("inline-flex h-5 min-w-6 items-center justify-center gap-0.5 rounded-full px-1 text-[0.625rem] font-semibold tabular",
        notes.has ? "bg-warning/15 text-warning ring-1 ring-inset ring-warning/35 hover:bg-warning/25" : "text-ink-3 opacity-0 hover:text-oxblood focus-visible:opacity-100 group-hover:opacity-70")}
    >
      <StickyNote className="h-3 w-3" aria-hidden />{notes.gulel > 0 ? notes.gulel + (notes.text ? 1 : 0) : null}
    </button>
  );
}

function NotesPopover({ anchor, row, noteKey, info, canWrite, title, onSave, onOpen, onClose }: {
  anchor: HTMLElement; row: Row; noteKey: string | null; info: NoteInfo; canWrite: boolean; title: string; onSave: (v: string) => void; onOpen: () => void; onClose: () => void;
}) {
  const initial = noteKey ? String(row.data[noteKey] ?? "") : "";
  const [v, setV] = useState(initial);
  const [ask, setAsk] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [orgNotes, setOrgNotes] = useState<NoteRow[] | null>(null);
  const done = useRef(false);
  const dirty = !!noteKey && canWrite && v !== initial;
  const orgKey = row.sheet === "Organisations" ? row.row_key : String(row.data.org_id ?? "");
  useEffect(() => {
    if (!orgKey || info.gulel === 0) return;
    let live = true;
    void orgContextAction(orgKey).then((r) => { if (live && r.ok && r.data) setOrgNotes(r.data.notes.filter((n) => !n.archived_at)); });
    return () => { live = false; };
  }, [orgKey, info.gulel]);
  // Closing never throws work away: click-away, the close button and Ctrl+Enter save; Esc asks when there are changes.
  const close = () => { if (done.current) return; done.current = true; if (dirty) onSave(v); else onClose(); };
  const escape = () => { if (dirty) setAsk(true); else { done.current = true; onClose(); } };
  return (
    <Floating anchor={anchor} onClose={() => { if (!expanded) close(); }} width={560} tall>
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <StickyNote className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">Notes · {title}</span>
        <span className="font-mono text-[0.625rem] text-ink-3">{row.row_key}</span>
        {noteKey && <Tip content="Expand"><button type="button" onClick={() => setExpanded(true)} className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-sunken/70 hover:text-oxblood" aria-label="Expand note"><Maximize2 className="h-3.5 w-3.5" /></button></Tip>}
        <Tip content={dirty ? "Save and close" : "Close"}><button type="button" onClick={close} className="grid h-7 w-7 place-items-center rounded-full neo-raised-sm text-ink-2 hover:text-oxblood" aria-label={dirty ? "Save and close" : "Close"}><X className="h-3.5 w-3.5" /></button></Tip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {noteKey ? (
          <div className="flex flex-col gap-1.5 px-4 pt-3">
            <span className="eyebrow">Row note · syncs to the Google Sheet</span>
            <AutoTextarea
              autoFocus value={v} onChange={setV} readOnly={!canWrite} placeholder="Plain text. Saved to the board and the Google Sheet." maxRows={18}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(); }
                else if (e.key === "Escape") { e.preventDefault(); escape(); }
              }}
            />
            {ask ? (
              <div className="flex flex-wrap items-center gap-2 rounded-neo-sm bg-warning/10 px-3 py-2 text-xs text-ink-2">
                <span className="mr-auto">You have unsaved changes.</span>
                <Button size="sm" className="h-7" onClick={() => setAsk(false)}>Keep editing</Button>
                <Button size="sm" className="h-7" variant="danger" onClick={() => { done.current = true; onClose(); }}>Discard</Button>
                <Button size="sm" className="h-7" variant="primary" onClick={close}>Save</Button>
              </div>
            ) : <span className="text-[0.6875rem] text-ink-3">{dirty ? "Unsaved: Ctrl+Enter, the close button or clicking away saves. Esc asks first." : "Ctrl+Enter or click away to save."}</span>}
          </div>
        ) : <p className="px-4 pt-3 text-xs text-ink-3">This sheet has no notes column; notes live on the organisation in gulel.</p>}
        {info.gulel > 0 && (
          <div className="flex flex-col gap-2 px-4 pt-4">
            <span className="eyebrow">Organisation notes in gulel ({info.gulel})</span>
            {orgNotes === null ? <p className="text-xs text-ink-3">Loading…</p> : orgNotes.slice(0, 3).map((n) => (
              <div key={n.id} className="rounded-neo-sm neo-inset-sm px-3 py-2">
                <p className="mb-1 text-[0.625rem] text-ink-3">{n.author ?? "Team"} · {new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                <RichView body={n.body} clampHeight={140} title={`${title}: note by ${n.author ?? "Team"}`} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline px-4 py-2">
        <span className="text-xs text-ink-2">{info.gulel > 3 ? `${info.gulel - 3} more in gulel` : "Notes, files and history"}</span>
        <button type="button" onClick={() => { done.current = true; if (dirty) onSave(v); onOpen(); }} className="rounded-full px-2.5 py-1 text-xs font-medium text-oxblood hover:bg-sunken/70">Open item{orgKey ? " to add rich notes" : ""}</button>
      </div>
      <Modal open={expanded} onOpenChange={(o) => { if (!o) setExpanded(false); }} title={`Notes · ${title}`} description="Row note. Plain text, synced to the Google Sheet." wide
        footer={<Button variant="primary" onClick={() => setExpanded(false)}>Done</Button>}>
        <AutoTextarea autoFocus value={v} onChange={setV} readOnly={!canWrite} placeholder="Plain text. Saved to the board and the Google Sheet." minRows={14} maxRows={40}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setExpanded(false); } }} />
      </Modal>
    </Floating>
  );
}

/** A textarea that grows with its content (between minRows and maxRows), then scrolls. */
function AutoTextarea({ value, onChange, minRows = 6, maxRows = 18, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void; minRows?: number; maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = "auto";
    el.style.height = `${Math.min(maxRows * line + 18, Math.max(minRows * line + 18, el.scrollHeight + 2))}px`;
  }, [value, minRows, maxRows]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} {...rest}
      className="w-full resize-none rounded-neo neo-inset-sm px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-oxblood/25" />
  );
}

function KanbanView({ groups, groupCol, def, idx, computed, nameKey, columns, canWrite, full, noteInfo, onOpen, onMove, onAdd }: {
  groups: { key: string; label: string; color: PaletteKey; rows: Row[] }[]; groupCol: ColumnDef; def: SheetDef; idx: ReturnType<typeof buildIndex>;
  computed: Map<string, { all: Record<string, CellValue>; issues: string[] }>; nameKey: string; columns: ColumnDef[]; canWrite: boolean; full: boolean;
  noteInfo: (r: Row) => NoteInfo; onOpen: (id: string) => void; onMove: (id: string, key: string) => void; onAdd: (key: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const fields = columns.filter((c) => c.key !== nameKey && c.key !== groupCol.key && c.type !== "id" && c.type !== "longtext");
  const nameCol = def.columns.find((c) => c.key === nameKey);
  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-2", full ? "h-[calc(100dvh-9.5rem)]" : "h-[calc(100dvh-17rem)] min-h-96")}>
      {groups.map((g) => (
        <section
          key={g.key} aria-label={g.label}
          onDragOver={(e) => { if (canWrite) { e.preventDefault(); setOver(g.key); } }} onDragLeave={() => setOver((o) => (o === g.key ? null : o))}
          onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id && g.key !== "__all") onMove(id, g.key); }}
          className={cn("flex w-72 shrink-0 flex-col rounded-neo neo-inset-sm", over === g.key && "ring-2 ring-oxblood/40")}
        >
          <header className="flex items-center gap-2 px-3 pb-2 pt-3">
            <span className={cn("h-3 w-1 rounded-full", PALETTE[g.color].bar)} aria-hidden />
            <span className="truncate text-sm font-semibold text-ink">{g.label}</span>
            <span className="ml-auto text-xs tabular text-ink-3">{g.rows.length}</span>
          </header>
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {g.rows.map((r) => {
              const all = computed.get(r.id)?.all ?? {};
              const title = (nameCol ? displayValue(idx, nameCol, all[nameKey], r) : "") || r.row_key || "Untitled";
              const n = noteInfo(r);
              const shown = fields.filter((c) => all[c.key] !== null && all[c.key] !== undefined && all[c.key] !== "").slice(0, 4);
              return (
                <li key={r.id}>
                  <button
                    type="button" draggable={canWrite} onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)} onClick={() => onOpen(r.id)}
                    className={cn("flex w-full flex-col gap-1.5 rounded-neo-sm bg-canvas p-3 text-left neo-raised-sm transition-shadow hover:shadow-[var(--raise-md)]", r.color && r.color in PALETTE && "border-l-[3px]")}
                    style={r.color && r.color in PALETTE ? { borderLeftColor: `var(--color-${colorVar(r.color as PaletteKey)})` } : undefined}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink">{title}</span>
                      {n.has && <span title={n.text || `${n.gulel} note(s) in gulel`} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-warning ring-1 ring-inset ring-warning/35"><StickyNote className="h-3 w-3" aria-hidden />{n.gulel || null}</span>}
                    </span>
                    {r.row_key && <span className="font-mono text-[0.625rem] text-ink-3">{r.row_key}</span>}
                    {shown.map((c) => (
                      <span key={c.key} className="flex min-w-0 items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 truncate text-ink-3">{displayHeader(def, c)}</span>
                        <span className="min-w-0 flex-1 truncate"><CellView c={c} value={all[c.key]} row={r} idx={idx} isOpen={all.is_open !== "N"} /></span>
                      </span>
                    ))}
                    {n.text && <span className="line-clamp-2 border-l-2 border-warning/60 pl-2 text-xs text-ink-2">{n.text}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {canWrite && g.key !== "__all" && (
            <button type="button" onClick={() => onAdd(g.key)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-3 hover:text-oxblood"><Plus className="h-3.5 w-3.5" aria-hidden />Add item</button>
          )}
        </section>
      ))}
    </div>
  );
}

function colorVar(k: PaletteKey) {
  return ({ green: "oxblood", moss: "chart-2", olive: "chart-4", amber: "warning", red: "danger", taupe: "chart-3", cream: "buttercream", grey: "ink-3" } as const)[k];
}

function HeaderCell({ def, c, left, lastFrozen, sort, onSort, onHide, onFreeze, onGroup, onManage, onResize, width }: {
  def: SheetDef; c: ColumnDef; left: number; lastFrozen: boolean; sort: View["sort"]; width: number;
  onSort: (dir: 1 | -1 | null) => void; onHide: () => void; onFreeze: () => void; onGroup?: () => void; onManage?: () => void; onResize: (w: number) => void;
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const sorted = sort?.key === c.key ? sort.dir : 0;
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = width;
    const moveH = (ev: PointerEvent) => onResize(Math.max(64, Math.min(640, w0 + ev.clientX - x0)));
    const up = () => { window.removeEventListener("pointermove", moveH); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", moveH);
    window.addEventListener("pointerup", up);
  };
  return (
    <th
      scope="col" style={left >= 0 ? { left } : undefined}
      className={cn("group/h sticky top-0 border-b border-l border-hairline bg-canvas px-0 text-left text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3", left >= 0 ? "z-30" : "z-20", lastFrozen && "shadow-[6px_0_8px_-6px_rgba(0,0,0,0.18)]")}
    >
      <button type="button" onClick={(e) => setMenu(e.currentTarget)} className={cn("flex w-full items-center gap-1.5 px-2.5 py-2.5 text-left hover:text-ink", c.type === "ref" && "justify-center")} title={`${c.header}${c.required ? " · required" : ""}${c.type === "formula" ? " · calculated" : ""}`}>
        <span className="text-[0.625rem] text-ink-3/70" aria-hidden>{TYPE_GLYPH[c.type]}</span>
        <span className="truncate">{displayHeader(def, c)}</span>
        {c.required && <span className="text-danger" aria-label="required">*</span>}
        {sorted === 1 && <ArrowUp className="h-3 w-3 shrink-0 text-oxblood" aria-label="sorted ascending" />}
        {sorted === -1 && <ArrowDown className="h-3 w-3 shrink-0 text-oxblood" aria-label="sorted descending" />}
      </button>
      <span onPointerDown={startResize} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-oxblood/30 group-hover/h:opacity-100" aria-hidden />
      {menu && (
        <Floating anchor={menu} onClose={() => setMenu(null)} width={220}>
          <MenuList>
            <MenuItem onClick={() => { onSort(1); setMenu(null); }}><ArrowUp className="h-3.5 w-3.5" />Sort ascending</MenuItem>
            <MenuItem onClick={() => { onSort(-1); setMenu(null); }}><ArrowDown className="h-3.5 w-3.5" />Sort descending</MenuItem>
            {sorted !== 0 && <MenuItem onClick={() => { onSort(null); setMenu(null); }}><ArrowUpDown className="h-3.5 w-3.5" />Clear sort</MenuItem>}
            {onGroup && <MenuItem onClick={() => { onGroup(); setMenu(null); }}><Layers className="h-3.5 w-3.5" />Group by this</MenuItem>}
            <MenuItem onClick={() => { onFreeze(); setMenu(null); }}><Lock className="h-3.5 w-3.5" />Freeze up to here</MenuItem>
            {onManage && <MenuItem onClick={() => { onManage(); setMenu(null); }}><Palette className="h-3.5 w-3.5" />Edit labels &amp; colours</MenuItem>}
            <MenuItem onClick={() => { onHide(); setMenu(null); }}><EyeOff className="h-3.5 w-3.5" />Hide column</MenuItem>
          </MenuList>
        </Floating>
      )}
    </th>
  );
}

function SummaryRow({ columns, lefts, rows, computed, idx }: { columns: ColumnDef[]; lefts: number[]; rows: Row[]; computed: Map<string, { all: Record<string, CellValue> }>; idx: ReturnType<typeof buildIndex> }) {
  return (
    <tr aria-hidden>
      <td className="sticky left-0 z-10 bg-canvas" />
      {columns.map((c, i) => {
        let content: React.ReactNode = null;
        if (c.type === "ref" && c.list) {
          const counts = new Map<string, number>();
          rows.forEach((r) => { const v = String(r.data[c.key] ?? ""); counts.set(v, (counts.get(v) ?? 0) + 1); });
          content = (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-sunken" title={[...counts].map(([k, n]) => `${idx.refs.get(c.list!)?.get(k)?.name ?? "Blank"}: ${n}`).join("\n")}>
              {[...counts].map(([k, n]) => <span key={k} className={cn("h-full", k ? PALETTE[labelColor(idx.refs.get(c.list!)?.get(k))].bar : "bg-transparent")} style={{ width: `${(n / rows.length) * 100}%` }} />)}
            </div>
          );
        } else if (c.type === "number" || (c.type === "formula" && /^(Value|Fee|Total|Pending)$/.test(c.header))) {
          const sum = rows.reduce((s, r) => s + (Number(computed.get(r.id)?.all[c.key]) || 0), 0);
          content = sum ? <span className="block text-right text-xs font-medium tabular text-ink-2">{sum.toLocaleString("en-GB")}<span className="ml-1 text-ink-3">sum</span></span> : null;
        }
        return <td key={c.key} style={lefts[i] >= 0 ? { left: lefts[i] } : undefined} className={cn("bg-canvas px-2.5 pb-1 pt-1.5", lefts[i] >= 0 && "sticky z-10")}>{content}</td>;
      })}
      <td className="bg-canvas" />
    </tr>
  );
}

function SyncStrip({ link, busy, syncing, onSync, issues, onIssues, issuesOnly }: { link: Props["link"]; busy: boolean; syncing: boolean; onSync: () => void; issues: number; onIssues: () => void; issuesOnly: boolean }) {
  const ago = link.lastSync ? relTime(link.lastSync) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", busy || syncing ? "animate-pulse bg-warning" : link.status === "error" ? "bg-danger" : link.url ? "bg-oxblood" : "bg-ink-3")} aria-hidden />
        {busy ? "Saving…" : syncing ? "Syncing with Google Sheets…" : link.url ? (link.status === "error" ? `Sync error: ${link.error ?? "see Sync & access"}` : `Saved · ${link.autoSync ? "auto-syncs to" : "linked to"} Google Sheets${ago ? ` · last synced ${ago}` : ""}`) : "Saved in gulel · no Google Sheet linked"}
      </span>
      {link.url ? (
        <>
          <a href={link.url} target="_blank" rel="noreferrer noopener" className="text-oxblood hover:underline">Open sheet</a>
          <button type="button" onClick={onSync} disabled={syncing} className="inline-flex items-center gap-1 text-oxblood hover:underline disabled:opacity-50"><RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} aria-hidden />Sync now</button>
        </>
      ) : (
        <Link href="/central/sync" className="text-oxblood hover:underline">Connect Google Sheets</Link>
      )}
      <button type="button" onClick={onIssues} className={cn("inline-flex items-center gap-1", issues ? "text-warning" : "text-ink-3", issuesOnly && "font-semibold underline")}>
        <AlertTriangle className="h-3 w-3" aria-hidden />{issues ? `${issues} row${issues > 1 ? "s" : ""} need attention` : "All rows pass the row check"}
      </button>
    </div>
  );
}

export function relTime(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function FilterMenu({ def, idx, refCols, view, patchView, count, issues }: { def: SheetDef; idx: ReturnType<typeof buildIndex>; refCols: ColumnDef[]; view: View; patchView: (p: Partial<View>) => void; count: number; issues: number }) {
  return (
    <ToolMenu icon={Filter} iconOnly label={count ? `${count} filter${count > 1 ? "s" : ""} on` : "Filter rows"} highlight={count > 0} badge={count || undefined}>
      {() => (
        <div className="max-h-96 w-full overflow-y-auto p-2">
          <label className="flex items-center gap-2 rounded-neo-sm px-2 py-1.5 text-xs text-ink"><input type="checkbox" checked={view.issuesOnly} onChange={(e) => patchView({ issuesOnly: e.target.checked })} className="accent-[var(--brand-oxblood)]" />Only rows with data issues ({issues})</label>
          {refCols.map((c) => {
            const items = c.type === "ref" ? (idx.refList.get(c.list!) ?? []).map((i) => ({ v: i.item_id, l: i.name, color: labelColor(i) })) : (c.choices ?? []).map((x, i) => ({ v: x, l: x, color: labelColor({ name: x, color: null, position: i }) }));
            const cur = view.filters[c.key] ?? [];
            const toggle = (v: string) => patchView({ filters: { ...view.filters, [c.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } });
            return (
              <div key={c.key} className="mt-2">
                <div className="px-2 pb-1 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3">{displayHeader(def, c)}</div>
                <div className="flex flex-wrap gap-1 px-1">
                  {[...items, { v: "", l: "Blank", color: "grey" as PaletteKey }].map((i) => (
                    <button key={i.v} type="button" onClick={() => toggle(i.v)} className={cn("rounded-full", cur.includes(i.v) ? "ring-2 ring-oxblood" : "opacity-70 hover:opacity-100")}><Pill color={i.color}>{i.l}</Pill></button>
                  ))}
                </div>
              </div>
            );
          })}
          {count > 0 && <button type="button" onClick={() => patchView({ filters: {}, issuesOnly: false })} className="mt-3 w-full rounded-full px-3 py-1.5 text-xs text-oxblood hover:bg-sunken/60">Clear all filters</button>}
        </div>
      )}
    </ToolMenu>
  );
}

function BulkSet({ def, idx, onSet }: { def: SheetDef; idx: ReturnType<typeof buildIndex>; onSet: (key: string, v: CellValue) => void }) {
  const [col, setCol] = useState<ColumnDef | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const cols = def.columns.filter((c) => c.type === "ref" || c.type === "choice" || (c.type === "entity" && c.entity !== "@any") || c.type === "date");
  return (
    <span ref={wrap} className="inline-flex">
      <ToolMenu icon={Check} label="Set field" small>
        {(close) => (
          <MenuList>
            {cols.map((c) => <MenuItem key={c.key} onClick={() => { setCol(c); close(); }}>{displayHeader(def, c)}</MenuItem>)}
          </MenuList>
        )}
      </ToolMenu>
      {col && col.type !== "date" && (
        <OptionPicker anchor={wrap.current} options={optionsFor(col, null, idx)} value="" onPick={(v) => { onSet(col.key, v); setCol(null); }} onClose={() => setCol(null)} />
      )}
      {col && col.type === "date" && (
        <Modal open onOpenChange={(o) => !o && setCol(null)} title={`Set ${displayHeader(def, col)}`}>
          <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("d") as string; onSet(col.key, v || null); setCol(null); }} className="flex items-center gap-2">
            <input name="d" type="date" aria-label={displayHeader(def, col)} className="h-10 flex-1 rounded-neo neo-inset-sm px-3 text-sm" autoFocus />
            <Button type="submit" variant="primary" size="sm">Apply</Button>
          </form>
        </Modal>
      )}
    </span>
  );
}

function ColorGrid({ onPick, current }: { onPick: (c: PaletteKey | null) => void; current?: string | null }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 p-2">
      {PALETTE_KEYS.map((k) => (
        <button key={k} type="button" onClick={() => onPick(k)} title={PALETTE[k].label} aria-label={PALETTE[k].label} className={cn("h-6 w-6 rounded-full", PALETTE[k].dot, current === k && "ring-2 ring-offset-2 ring-offset-canvas ring-ink")} />
      ))}
      <button type="button" onClick={() => onPick(null)} title="No colour" aria-label="No colour" className="grid h-6 w-6 place-items-center rounded-full ring-1 ring-hairline"><X className="h-3 w-3 text-ink-3" /></button>
    </div>
  );
}

function ToolMenu({ icon: Icon, label, children, highlight, small, iconOnly, badge }: { icon: React.ComponentType<{ className?: string }>; label: string; children: (close: () => void) => React.ReactNode; highlight?: boolean; small?: boolean; iconOnly?: boolean; badge?: number }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => setEl(el ? null : e.currentTarget);
  return (
    <>
      {iconOnly ? (
        <ToolIcon label={label} onClick={toggle} active={!!el || highlight} badge={badge} expanded={!!el}><Icon className="h-4 w-4" /></ToolIcon>
      ) : (
        <button type="button" onClick={toggle} aria-expanded={!!el}
          className={cn(small ? "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-2 hover:bg-sunken/70" : "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs neo-raised-sm hover:shadow-[var(--raise-md)]", highlight ? "text-oxblood" : "text-ink-2")}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      )}
      {el && <Floating anchor={el} onClose={() => setEl(null)} width={small ? 220 : 260}>{children(() => setEl(null))}</Floating>}
    </>
  );
}

/** Icon-only toolbar button inside a grouped cluster; the name shows as a tooltip. */
function ToolIcon({ label, onClick, children, active, disabled, badge, tone, expanded }: {
  label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; active?: boolean; disabled?: boolean; badge?: number; tone?: "warning"; expanded?: boolean;
}) {
  return (
    <Tip content={label}>
      <button
        type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={expanded === undefined ? active : undefined} aria-expanded={expanded}
        className={cn(
          "relative grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-150 disabled:opacity-35",
          active ? cn("neo-raised-sm", tone === "warning" ? "text-warning" : "text-oxblood") : cn("hover:bg-raised/80", tone === "warning" ? "text-warning hover:text-warning" : "text-ink-2 hover:text-oxblood"),
        )}
      >
        {children}
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-fill px-1 text-[0.5625rem] font-semibold tabular text-ivory" aria-hidden>{badge}</span>
        )}
      </button>
    </Tip>
  );
}

function MenuList({ children }: { children: React.ReactNode }) {
  return <div role="menu" className="flex max-h-96 flex-col overflow-y-auto p-1.5">{children}</div>;
}
function MenuItem({ children, onClick, active, danger }: { children: React.ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-neo-sm px-2.5 py-1.5 text-left text-xs hover:bg-sunken/70", active ? "font-medium text-oxblood" : danger ? "text-danger" : "text-ink-2")}>
      {children}{active && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

