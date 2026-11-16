import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SHEETS } from "./schema";
import {
  buildIndex, coerce, colByKey, entityName, entityRows, findEntity, idColumn, nextRowKey, rowIssues, rowKeyOf, sheetDef, SHEET_BY_NAME,
} from "./compute";
import type { CellValue, EntityTarget, Op, RefItem, Row, RowData, Store } from "./types";

type Via = "ui" | "agent" | "sheet" | "api" | "import";
export interface Ctx { db: SupabaseClient; workspaceId: string; actorId: string | null; via: Via; note?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadStore(db: SupabaseClient, workspaceId: string, opts: { includeDeleted?: boolean } = {}): Promise<Store> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("cr_rows").select("id, sheet, row_key, data, position, color, deleted_at, updated_at, updated_via").eq("workspace_id", workspaceId);
    if (!opts.includeDeleted) q = q.is("deleted_at", null);
    const { data, error } = await q.order("position").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const { data: refs, error } = await db.from("cr_reference").select("list, item_id, name, is_open, market_id, color, position").eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  return { rows, refs: (refs ?? []) as RefItem[] };
}

export interface OpResult { ok: boolean; op: Op["op"]; sheet: string; key: string | null; error?: string; warnings?: string[]; rowId?: string }
export interface ApplyResult { ok: boolean; results: OpResult[]; error?: string }

function findRow(store: Store, sheet: string, key: string): Row | undefined {
  return store.rows.find((r) => r.sheet === sheet && !r.deleted_at && (UUID.test(key) ? r.id === key : r.row_key === key))
    ?? (UUID.test(key) ? undefined : store.rows.find((r) => r.sheet === sheet && !r.deleted_at && (r.row_key ?? "").toLowerCase() === key.toLowerCase()));
}

/** Rows (in any sheet) whose entity columns point at `key` of `sheet`. */
export function referencesTo(store: Store, sheet: string, key: string) {
  const fam = sheet.replace(/_(India|Global)$/, "");
  const targets: EntityTarget[] = fam === "Pipeline" ? ["@opportunity", "@any"] : fam === "Partners" ? ["@partner", "@any"] : sheet === "Projects" ? ["Projects", "@any"] : [sheet as EntityTarget];
  const refs: { sheet: string; key: string | null; column: string }[] = [];
  for (const r of store.rows) {
    if (r.deleted_at) continue;
    const def = SHEET_BY_NAME.get(r.sheet)!;
    for (const c of def.columns) {
      if (c.type !== "entity" || !c.entity || !targets.includes(c.entity) || String(r.data[c.key] ?? "") !== key) continue;
      if (c.entity === "@any") {
        const t = r.data.ref_type_id;
        if (!((t === "PL" && fam === "Pipeline") || (t === "PA" && fam === "Partners") || (t === "PJ" && sheet === "Projects"))) continue;
      }
      refs.push({ sheet: r.sheet, key: r.row_key, column: c.header });
    }
  }
  return refs;
}

/** Validate and normalise a partial row against the sheet's columns. Resolves names to IDs for dropdown columns. */
function normalise(store: Store, sheet: string, input: RowData, existing?: Row): { data: RowData; errors: string[] } {
  const def = sheetDef(sheet);
  const idx = buildIndex(store);
  const errors: string[] = [];
  const out: RowData = {};
  for (const [k, raw] of Object.entries(input)) {
    const c = colByKey(def, k) ?? def.columns.find((x) => x.header.toLowerCase() === k.toLowerCase());
    if (!c) { errors.push(`Unknown column "${k}" in ${sheet}`); continue; }
    if (c.type === "formula") { errors.push(`${c.header} is calculated from other columns and cannot be edited`); continue; }
    const r = coerce(c, raw);
    if ("error" in r) { errors.push(r.error); continue; }
    let v: CellValue = r.value;
    if (v !== null && c.type === "ref" && c.list) {
      const items = idx.refList.get(c.list) ?? [];
      const hit = items.find((i) => i.item_id === v) ?? items.find((i) => i.item_id.toLowerCase() === String(v).toLowerCase() || i.name.toLowerCase() === String(v).toLowerCase());
      if (!hit) { errors.push(`${c.header}: "${v}" is not in the ${c.list} list (${items.map((i) => `${i.item_id}=${i.name}`).join(", ")})`); continue; }
      v = hit.item_id;
    }
    if (v !== null && c.type === "entity" && c.entity) {
      let target: EntityTarget | null = c.entity;
      if (c.entity === "@any") {
        const t = String(input.ref_type_id ?? existing?.data.ref_type_id ?? "");
        target = t === "PL" ? "@opportunity" : t === "PA" ? "@partner" : t === "PJ" ? "Projects" : null;
        if (!target) { errors.push(`${c.header}: set Ref type first`); continue; }
      }
      let hit = findEntity(idx, target, String(v));
      if (!hit) {
        const want = String(v).toLowerCase();
        const matches = entityRows(idx, target).filter((row) => entityName(idx, row).toLowerCase() === want);
        if (matches.length === 1) hit = matches[0];
        else if (matches.length > 1) { errors.push(`${c.header}: "${v}" matches ${matches.length} records, use the ID`); continue; }
      }
      if (!hit) { errors.push(`${c.header}: no ${target.replace("@", "")} with ID or name "${v}"`); continue; }
      v = hit.row_key;
    }
    if (c.type === "id" && v !== null) v = String(v).toUpperCase();
    out[c.key] = v;
  }
  return { data: out, errors };
}

/**
 * Apply operations atomically against an in-memory copy (so later ops can reference rows created by earlier ones),
 * then persist. Any hard error rejects the whole batch.
 */
export async function applyOps(ctx: Ctx, ops: Op[], opts: { dryRun?: boolean; force?: boolean } = {}): Promise<ApplyResult & { store?: Store }> {
  const store = await loadStore(ctx.db, ctx.workspaceId, { includeDeleted: true });
  const work: Store = { rows: store.rows.map((r) => ({ ...r, data: { ...r.data } })), refs: store.refs };
  const results: OpResult[] = [];
  const writes: { kind: "insert" | "update"; row: Row; before: RowData | null; action: "insert" | "update" | "delete" | "restore"; patch: Record<string, unknown> }[] = [];

  for (const op of ops) {
    if (!SHEET_BY_NAME.has(op.sheet)) { results.push({ ok: false, op: op.op, sheet: op.sheet, key: null, error: `Unknown sheet "${op.sheet}". Sheets: ${SHEETS.map((s) => s.name).join(", ")}` }); continue; }
    const def = sheetDef(op.sheet);
    const idc = idColumn(def);
    if (op.op === "insert") {
      const { data, errors } = normalise(work, op.sheet, op.data);
      const live = { rows: work.rows.filter((r) => !r.deleted_at), refs: work.refs };
      if (idc && !data[idc.key]) data[idc.key] = nextRowKey(buildIndex(live), op.sheet);
      const full: RowData = Object.fromEntries(def.columns.filter((c) => c.type !== "formula").map((c) => [c.key, data[c.key] ?? null]));
      const key = rowKeyOf(op.sheet, full);
      if (key && findRow(work, op.sheet, key)) errors.push(`${idc?.header ?? "Row"} ${key} already exists in ${op.sheet}`);
      if (errors.length) { results.push({ ok: false, op: "insert", sheet: op.sheet, key, error: errors.join("; ") }); continue; }
      const maxPos = Math.max(0, ...work.rows.filter((r) => r.sheet === op.sheet && !r.deleted_at).map((r) => r.position));
      const row: Row = { id: crypto.randomUUID(), sheet: op.sheet, row_key: key, data: full, position: op.position ?? maxPos + 1, color: op.color ?? null, deleted_at: null };
      work.rows.push(row);
      writes.push({ kind: "insert", row, before: null, action: "insert", patch: {} });
      results.push({ ok: true, op: "insert", sheet: op.sheet, key, rowId: row.id, warnings: rowIssues(buildIndex({ rows: work.rows.filter((r) => !r.deleted_at), refs: work.refs }), row) });
      continue;
    }
    const row = op.op === "restore"
      ? work.rows.find((r) => r.sheet === op.sheet && r.deleted_at && (r.id === op.key || r.row_key === op.key))
      : findRow(work, op.sheet, op.key);
    if (!row) { results.push({ ok: false, op: op.op, sheet: op.sheet, key: op.key, error: `No row "${op.key}" in ${op.sheet}` }); continue; }
    const before = { ...row.data };
    if (op.op === "update") {
      const { data, errors } = normalise(work, op.sheet, op.data, row);
      const next = { ...row.data, ...data };
      const newKey = rowKeyOf(op.sheet, next);
      if (idc && newKey !== row.row_key) {
        if (!newKey) errors.push(`${idc.header} cannot be empty`);
        else if (findRow(work, op.sheet, newKey)) errors.push(`${idc.header} ${newKey} already exists`);
        else if (row.row_key) {
          const refs = referencesTo(work, op.sheet, row.row_key);
          if (refs.length) errors.push(`${row.row_key} is referenced by ${refs.length} row(s) (${refs.slice(0, 3).map((r) => `${r.sheet} ${r.key ?? ""}`).join(", ")}); change those first`);
        }
      }
      if (errors.length) { results.push({ ok: false, op: "update", sheet: op.sheet, key: op.key, error: errors.join("; ") }); continue; }
      row.data = next;
      row.row_key = newKey;
      writes.push({ kind: "update", row, before, action: "update", patch: { data: next, row_key: newKey } });
      results.push({ ok: true, op: "update", sheet: op.sheet, key: newKey, rowId: row.id, warnings: rowIssues(buildIndex({ rows: work.rows.filter((r) => !r.deleted_at), refs: work.refs }), row) });
    } else if (op.op === "delete") {
      const refs = row.row_key && idc ? referencesTo(work, op.sheet, row.row_key) : [];
      if (refs.length && !opts.force) {
        results.push({ ok: false, op: "delete", sheet: op.sheet, key: row.row_key, error: `${row.row_key} is referenced by ${refs.length} row(s): ${refs.slice(0, 5).map((r) => `${r.sheet} ${r.key ?? ""} (${r.column})`).join(", ")}` });
        continue;
      }
      row.deleted_at = new Date().toISOString();
      writes.push({ kind: "update", row, before, action: "delete", patch: { deleted_at: row.deleted_at } });
      results.push({ ok: true, op: "delete", sheet: op.sheet, key: row.row_key, rowId: row.id, warnings: refs.length ? [`${refs.length} row(s) now point at a deleted record`] : [] });
    } else if (op.op === "restore") {
      if (row.row_key && findRow(work, op.sheet, row.row_key)) { results.push({ ok: false, op: "restore", sheet: op.sheet, key: row.row_key, error: `${row.row_key} is already in use` }); continue; }
      row.deleted_at = null;
      writes.push({ kind: "update", row, before: null, action: "restore", patch: { deleted_at: null } });
      results.push({ ok: true, op: "restore", sheet: op.sheet, key: row.row_key, rowId: row.id });
    } else if (op.op === "color") {
      row.color = op.color;
      writes.push({ kind: "update", row, before: null, action: "update", patch: { color: op.color } });
      results.push({ ok: true, op: "color", sheet: op.sheet, key: row.row_key, rowId: row.id });
    } else if (op.op === "move") {
      row.position = op.position;
      writes.push({ kind: "update", row, before: null, action: "update", patch: { position: op.position } });
      results.push({ ok: true, op: "move", sheet: op.sheet, key: row.row_key, rowId: row.id });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) return { ok: false, results, error: failed.map((f) => `${f.sheet}${f.key ? ` ${f.key}` : ""}: ${f.error}`).join("\n") };
  if (opts.dryRun || !writes.length) return { ok: true, results, store: work };

  const meta = { updated_by: ctx.actorId, updated_via: ctx.via };
  const inserts = writes.filter((w) => w.kind === "insert").map((w) => ({
    id: w.row.id, workspace_id: ctx.workspaceId, sheet: w.row.sheet, row_key: w.row.row_key, data: w.row.data, position: w.row.position, color: w.row.color, ...meta,
  }));
  if (inserts.length) {
    const { error } = await ctx.db.from("cr_rows").insert(inserts);
    if (error) return { ok: false, results, error: friendlyDbError(error.message) };
  }
  // Updates run sequentially; soft-deletes go first so a freed key can be reused in the same batch.
  const updates = writes.filter((w) => w.kind === "update").sort((a, b) => (a.action === "delete" ? -1 : 0) - (b.action === "delete" ? -1 : 0));
  for (const w of updates) {
    const { error } = await ctx.db.from("cr_rows").update({ ...w.patch, ...meta }).eq("id", w.row.id).eq("workspace_id", ctx.workspaceId);
    if (error) return { ok: false, results, error: friendlyDbError(error.message) };
  }
  const changes = writes.filter((w) => w.action !== "update" || "data" in w.patch).map((w) => ({
    workspace_id: ctx.workspaceId, sheet: w.row.sheet, row_id: w.row.id, row_key: w.row.row_key, action: w.action,
    before: w.before, after: w.action === "delete" ? null : w.row.data, actor_id: ctx.actorId, via: ctx.via, note: ctx.note ?? null,
  }));
  if (changes.length) await ctx.db.from("cr_changes").insert(changes);
  return { ok: true, results, store: work };
}

function friendlyDbError(msg: string) {
  if (/cr_rows_key_uq/.test(msg)) return "That ID already exists in this sheet.";
  if (/row-level security/i.test(msg)) return "You don't have permission to edit the Central Repository.";
  return msg;
}

export async function hasPendingPush(db: SupabaseClient, workspaceId: string) {
  const { count } = await db.from("cr_changes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("pushed_at", null).neq("via", "sheet");
  return (count ?? 0) > 0;
}
