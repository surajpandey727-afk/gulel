import { SHEETS, REF_LISTS } from "./schema";
import { inputColumns, rowKeyOf } from "./compute";
import type { CellValue, ColumnDef, RefItem, RowData } from "./types";

export const FIRST_DATA_ROW = 4;
export const TEMPLATE_LAST_ROW = 103;
export const REF_LAST_ROW = 28;

export type Grid = unknown[][];
export interface ParsedRow { sheet: string; row_key: string | null; data: RowData; position: number }
export interface ParsedWorkbook { rows: ParsedRow[]; refs: RefItem[]; warnings: string[] }

export function colIndex(letter: string) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function serialToIso(serial: number) {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400_000)).toISOString().slice(0, 10);
}

export function isoToSerial(iso: string) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400_000);
}

function readCell(c: ColumnDef, raw: unknown): CellValue {
  if (raw === null || raw === undefined || raw === "") return null;
  if (c.type === "date") {
    if (typeof raw === "number") return serialToIso(raw);
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    const t = Date.parse(String(raw));
    return Number.isNaN(t) ? String(raw) : new Date(t).toISOString().slice(0, 10);
  }
  if (c.type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
    return Number.isNaN(n) ? String(raw) : n;
  }
  const str = String(raw).trim();
  return str === "" ? null : str;
}

/** Turn per-sheet value grids (row 1 = index 0) into repository rows + reference lists. */
export function parseWorkbook(getGrid: (sheet: string) => Grid | undefined): ParsedWorkbook {
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  for (const def of SHEETS) {
    const grid = getGrid(def.name);
    if (!grid) { warnings.push(`Sheet "${def.name}" not found`); continue; }
    const header = grid[2] ?? [];
    for (const c of def.columns) {
      const h = header[colIndex(c.letter)];
      if (h !== undefined && h !== null && String(h).trim() !== c.header) warnings.push(`${def.name}!${c.letter}3 is "${h}", expected "${c.header}"`);
    }
    const inputs = inputColumns(def);
    for (let i = FIRST_DATA_ROW - 1; i < grid.length; i++) {
      const line = grid[i] ?? [];
      const data: RowData = {};
      let any = false;
      for (const c of inputs) {
        const v = readCell(c, line[colIndex(c.letter)]);
        data[c.key] = v;
        if (v !== null) any = true;
      }
      if (!any) continue;
      rows.push({ sheet: def.name, row_key: rowKeyOf(def.name, data), data, position: i + 1 });
    }
  }
  const refs: RefItem[] = [];
  const ref = getGrid("Reference");
  if (!ref) warnings.push(`Sheet "Reference" not found`);
  else {
    for (const l of REF_LISTS) {
      for (let i = FIRST_DATA_ROW - 1; i < Math.min(ref.length, REF_LAST_ROW); i++) {
        const line = ref[i] ?? [];
        const id = line[colIndex(l.id)];
        if (id === null || id === undefined || String(id).trim() === "") continue;
        const isOpen = l.isopen ? String(line[colIndex(l.isopen)] ?? "").trim().toUpperCase() : "";
        refs.push({
          list: l.list,
          item_id: String(id).trim(),
          name: String(line[colIndex(l.name)] ?? id).trim(),
          is_open: l.isopen ? isOpen === "Y" : null,
          market_id: l.marketid ? String(line[colIndex(l.marketid)] ?? "").trim() || null : null,
          color: null,
          position: i + 1,
        });
      }
    }
  }
  return { rows, refs, warnings };
}

/** Value written into a Google Sheet input cell (USER_ENTERED, so text that looks like a formula is escaped). */
export function toSheetCell(c: ColumnDef, v: CellValue | undefined): string | number {
  if (v === null || v === undefined || v === "") return "";
  if (c.type === "number") return typeof v === "number" ? v : Number(v);
  if (c.type === "date") return String(v);
  const str = String(v);
  return /^[=+@-]/.test(str) || /^\d+(\.\d+)?$/.test(str) && c.type !== "text" ? `'${str}` : str;
}
