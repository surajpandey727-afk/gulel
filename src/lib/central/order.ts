import type { Row } from "./types";

/**
 * Row order (priority) for a sheet. Positions are kept as clean integers 1..n in the order rows appear, which is
 * exactly the row order written to the Google Sheet, so a later pull reads back the same numbers.
 */

/** Live rows of a sheet in priority order. */
export function orderedRows(rows: Row[], sheet: string): Row[] {
  return rows.filter((r) => r.sheet === sheet && !r.deleted_at).sort((a, b) => a.position - b.position || (a.row_key ?? "").localeCompare(b.row_key ?? ""));
}

/**
 * Move `id` to sit directly after `afterId` (null = top) and renumber the whole sheet 1..n.
 * Returns only the rows whose position changes, as id -> new position. Unknown ids return an empty map.
 */
export function placeRow(rows: Row[], sheet: string, id: string, afterId: string | null): Map<string, number> {
  const list = orderedRows(rows, sheet);
  const moving = list.find((r) => r.id === id);
  if (!moving || afterId === id) return new Map();
  const rest = list.filter((r) => r.id !== id);
  const at = afterId === null ? 0 : rest.findIndex((r) => r.id === afterId) + 1;
  if (afterId !== null && at === 0) return new Map();
  rest.splice(at, 0, moving);
  const out = new Map<string, number>();
  rest.forEach((r, i) => { if (r.position !== i + 1) out.set(r.id, i + 1); });
  return out;
}

/** The row just before `id` in priority order (null when it is first); the inverse anchor for undo. */
export function rowBefore(rows: Row[], sheet: string, id: string): string | null {
  const list = orderedRows(rows, sheet);
  const i = list.findIndex((r) => r.id === id);
  return i > 0 ? list[i - 1].id : null;
}

/**
 * Priority number (1-based) per row id. Archived rows (Archived = Y) are left out of the count, so the numbers
 * read 1, 2, 3… across the rows you are actually working.
 */
export function priorityNumbers(rows: Row[], sheet: string, isArchived?: (r: Row) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const r of orderedRows(rows, sheet)) if (!isArchived?.(r)) out.set(r.id, ++n);
  return out;
}
