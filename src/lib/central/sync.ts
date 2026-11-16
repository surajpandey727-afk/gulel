import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHEETS, REF_LISTS } from "./schema";
import { inputColumns } from "./compute";
import { loadStore } from "./store";
import { batchGet, batchUpdate, quoteSheet, SheetsError } from "./google";
import { FIRST_DATA_ROW, REF_LAST_ROW, TEMPLATE_LAST_ROW, parseWorkbook, toSheetCell, type Grid, type ParsedWorkbook } from "./workbook";
import type { RowData } from "./types";

const lastLetter = (letters: string[]) => letters.sort((a, b) => a.length - b.length || a.localeCompare(b)).at(-1)!;

async function getLink(workspaceId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("cr_link").select("*").eq("workspace_id", workspaceId).maybeSingle();
  return data as { spreadsheet_id: string | null; auto_push: boolean } | null;
}

async function logRun(workspaceId: string, direction: "sheet_to_gulel" | "gulel_to_sheet", entity: string, patch: { rows_synced: number; rows_skipped?: number; rows_errored?: number; status: "completed" | "failed"; error_detail?: string | null }, actorId: string | null, started: Date) {
  const admin = createAdminClient();
  await admin.from("sync_log").insert({ workspace_id: workspaceId, direction, entity, ...patch, started_at: started.toISOString(), finished_at: new Date().toISOString(), created_by: actorId });
}

export async function readSpreadsheet(workspaceId: string, spreadsheetId: string): Promise<ParsedWorkbook> {
  const ranges = SHEETS.map((s) => `${quoteSheet(s.name)}!A1:${lastLetter(s.columns.map((c) => c.letter))}1000`);
  ranges.push(`${quoteSheet("Reference")}!A1:CA${REF_LAST_ROW}`);
  const res = await batchGet(workspaceId, spreadsheetId, ranges);
  const grids = new Map<string, Grid>();
  res.forEach((vr, i) => grids.set(i < SHEETS.length ? SHEETS[i].name : "Reference", vr.values ?? []));
  return parseWorkbook((n) => grids.get(n));
}

const same = (a: RowData, b: RowData) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  return true;
};

/** Merge a parsed workbook into the repository. Rows with unsynced Gulel edits are left alone. */
export async function mergeParsed(workspaceId: string, parsed: ParsedWorkbook, via: "sheet" | "import", actorId: string | null, opts: { deleteMissing: boolean }) {
  const admin = createAdminClient();
  const store = await loadStore(admin, workspaceId);
  const { data: pending } = await admin.from("cr_changes").select("row_id").eq("workspace_id", workspaceId).is("pushed_at", null).neq("via", "sheet");
  const pendingIds = new Set((pending ?? []).map((p) => p.row_id));
  const live = new Map(store.rows.map((r) => [`${r.sheet}\u0000${r.row_key ?? `#${r.position}`}`, r]));
  const seen = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  const changes: Record<string, unknown>[] = [];
  let updated = 0, skipped = 0;
  const dupes = new Set<string>();
  for (const p of parsed.rows) {
    const k = `${p.sheet}\u0000${p.row_key ?? `#${p.position}`}`;
    if (seen.has(k)) { dupes.add(`${p.sheet} ${p.row_key}`); continue; }
    seen.add(k);
    const cur = live.get(k);
    if (!cur) {
      const id = crypto.randomUUID();
      inserts.push({ id, workspace_id: workspaceId, sheet: p.sheet, row_key: p.row_key, data: p.data, position: p.position, updated_via: via, updated_by: actorId });
      changes.push({ workspace_id: workspaceId, sheet: p.sheet, row_id: id, row_key: p.row_key, action: "insert", after: p.data, via, actor_id: actorId, pushed_at: via === "sheet" ? new Date().toISOString() : null });
      continue;
    }
    if (pendingIds.has(cur.id)) { skipped++; continue; }
    if (!same(cur.data, p.data) || cur.position !== p.position) {
      await admin.from("cr_rows").update({ data: p.data, position: p.position, updated_via: via, updated_by: actorId }).eq("id", cur.id);
      if (!same(cur.data, p.data)) {
        updated++;
        changes.push({ workspace_id: workspaceId, sheet: p.sheet, row_id: cur.id, row_key: p.row_key, action: "update", before: cur.data, after: p.data, via, actor_id: actorId, pushed_at: via === "sheet" ? new Date().toISOString() : null });
      }
    }
  }
  let deleted = 0;
  if (opts.deleteMissing) {
    for (const [k, r] of live) {
      if (seen.has(k) || pendingIds.has(r.id)) continue;
      await admin.from("cr_rows").update({ deleted_at: new Date().toISOString(), updated_via: via, updated_by: actorId }).eq("id", r.id);
      changes.push({ workspace_id: workspaceId, sheet: r.sheet, row_id: r.id, row_key: r.row_key, action: "delete", before: r.data, via, actor_id: actorId, pushed_at: via === "sheet" ? new Date().toISOString() : null });
      deleted++;
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await admin.from("cr_rows").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < changes.length; i += 500) await admin.from("cr_changes").insert(changes.slice(i, i + 500));
  if (parsed.refs.length) {
    const colors = new Map(store.refs.map((r) => [`${r.list}\u0000${r.item_id}`, r.color]));
    const refs = parsed.refs.map((r) => ({ ...r, workspace_id: workspaceId, color: colors.get(`${r.list}\u0000${r.item_id}`) ?? null }));
    const { error } = await admin.from("cr_reference").upsert(refs, { onConflict: "workspace_id,list,item_id" });
    if (error) throw new Error(error.message);
    const keep = new Set(parsed.refs.map((r) => `${r.list}\u0000${r.item_id}`));
    for (const r of store.refs) if (!keep.has(`${r.list}\u0000${r.item_id}`)) await admin.from("cr_reference").delete().eq("workspace_id", workspaceId).eq("list", r.list).eq("item_id", r.item_id);
  }
  return { inserted: inserts.length, updated, deleted, skipped, warnings: [...parsed.warnings, ...[...dupes].map((d) => `Duplicate ID skipped: ${d}`)] };
}

export async function pullFromSheet(workspaceId: string, actorId: string | null) {
  const started = new Date();
  const link = await getLink(workspaceId);
  if (!link?.spreadsheet_id) throw new SheetsError(400, "No Google Sheet is linked yet.");
  const admin = createAdminClient();
  try {
    const parsed = await readSpreadsheet(workspaceId, link.spreadsheet_id);
    const res = await mergeParsed(workspaceId, parsed, "sheet", actorId, { deleteMissing: true });
    await admin.from("cr_link").update({ last_pull_at: new Date().toISOString(), last_status: "ok", last_error: res.warnings.length ? res.warnings.slice(0, 5).join("; ") : null }).eq("workspace_id", workspaceId);
    await logRun(workspaceId, "sheet_to_gulel", "all sheets", { rows_synced: res.inserted + res.updated + res.deleted, rows_skipped: res.skipped, status: "completed" }, actorId, started);
    return res;
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("cr_link").update({ last_status: "error", last_error: msg }).eq("workspace_id", workspaceId);
    await logRun(workspaceId, "sheet_to_gulel", "all sheets", { rows_synced: 0, status: "failed", error_detail: msg }, actorId, started);
    throw e;
  }
}

/** Write every input column of every sheet (and the Reference lists) so the Google Sheet matches gulel. */
export async function pushToSheet(workspaceId: string, actorId: string | null) {
  const started = new Date();
  const link = await getLink(workspaceId);
  if (!link?.spreadsheet_id) throw new SheetsError(400, "No Google Sheet is linked yet.");
  const admin = createAdminClient();
  const pushStartedAt = new Date().toISOString();
  try {
    const store = await loadStore(admin, workspaceId);
    const data: { range: string; majorDimension: "COLUMNS"; values: unknown[][] }[] = [];
    const warnings: string[] = [];
    let rows = 0;
    for (const def of SHEETS) {
      const list = store.rows.filter((r) => r.sheet === def.name).sort((a, b) => a.position - b.position);
      rows += list.length;
      const end = Math.max(TEMPLATE_LAST_ROW, FIRST_DATA_ROW + list.length - 1);
      if (list.length > TEMPLATE_LAST_ROW - FIRST_DATA_ROW + 1) warnings.push(`${def.name} has ${list.length} rows; the sheet's formulas cover 100. Extend the formulas in Google Sheets.`);
      for (const c of inputColumns(def)) {
        const col = list.map((r) => toSheetCell(c, r.data[c.key]));
        while (col.length < end - FIRST_DATA_ROW + 1) col.push("");
        data.push({ range: `${quoteSheet(def.name)}!${c.letter}${FIRST_DATA_ROW}:${c.letter}${end}`, majorDimension: "COLUMNS", values: [col] });
      }
    }
    for (const l of REF_LISTS) {
      const items = store.refs.filter((r) => r.list === l.list).sort((a, b) => a.position - b.position);
      const pad = <T,>(arr: T[]) => { const out: unknown[] = [...arr]; while (out.length < REF_LAST_ROW - FIRST_DATA_ROW + 1) out.push(""); return out; };
      const range = (letter: string) => `${quoteSheet("Reference")}!${letter}${FIRST_DATA_ROW}:${letter}${REF_LAST_ROW}`;
      data.push({ range: range(l.id), majorDimension: "COLUMNS", values: [pad(items.map((i) => i.item_id))] });
      data.push({ range: range(l.name), majorDimension: "COLUMNS", values: [pad(items.map((i) => i.name))] });
      if (l.isopen) data.push({ range: range(l.isopen), majorDimension: "COLUMNS", values: [pad(items.map((i) => (i.is_open ? "Y" : "N")))] });
      if (l.marketid) data.push({ range: range(l.marketid), majorDimension: "COLUMNS", values: [pad(items.map((i) => i.market_id ?? ""))] });
    }
    await batchUpdate(workspaceId, link.spreadsheet_id, data);
    await admin.from("cr_changes").update({ pushed_at: new Date().toISOString(), push_error: null }).eq("workspace_id", workspaceId).is("pushed_at", null).lte("created_at", pushStartedAt);
    await admin.from("cr_link").update({ last_push_at: new Date().toISOString(), last_status: "ok", last_error: warnings.length ? warnings.join("; ") : null }).eq("workspace_id", workspaceId);
    await logRun(workspaceId, "gulel_to_sheet", "all sheets", { rows_synced: rows, status: "completed" }, actorId, started);
    return { rows, warnings };
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("cr_changes").update({ push_error: msg }).eq("workspace_id", workspaceId).is("pushed_at", null);
    await admin.from("cr_link").update({ last_status: "error", last_error: msg }).eq("workspace_id", workspaceId);
    await logRun(workspaceId, "gulel_to_sheet", "all sheets", { rows_synced: 0, status: "failed", error_detail: msg }, actorId, started);
    throw e;
  }
}

/** Two-way sync: pull sheet edits first, then write gulel's state back. */
export async function syncNow(workspaceId: string, actorId: string | null) {
  const pulled = await pullFromSheet(workspaceId, actorId);
  const pushed = await pushToSheet(workspaceId, actorId);
  return { pulled, pushed };
}

/** Called after a gulel edit: sync if a sheet is linked and auto-sync is on (pull first so sheet-side edits survive). Never throws. */
export async function autoPush(workspaceId: string, actorId: string | null) {
  try {
    const link = await getLink(workspaceId);
    if (!link?.spreadsheet_id || !link.auto_push) return;
    await syncNow(workspaceId, actorId);
  } catch { /* recorded in cr_link / sync_log */ }
}
