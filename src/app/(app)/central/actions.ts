"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GatewayError } from "@/lib/ai/gateway";
import { applyOps, loadStore, type OpResult } from "@/lib/central/store";
import { autoPush, mergeParsed, pullFromSheet, pushToSheet, syncNow } from "@/lib/central/sync";
import { createSheetFromXlsx, getSpreadsheetMeta, parseSpreadsheetId } from "@/lib/central/google";
import { parseWorkbook } from "@/lib/central/workbook";
import { proposeChanges, type Proposal } from "@/lib/central/agent";
import { REF_LIST_BY_NAME } from "@/lib/central/compute";
import { kickTick } from "@/lib/jobs/enqueue";
import type { Op, Row, Store } from "@/lib/central/types";

type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

async function writer() {
  const s = await getSession();
  if (s.role === "viewer") throw new Error("Viewers cannot change the Central Repository.");
  return s;
}

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function applyOpsAction(ops: Op[], opts: { force?: boolean; via?: "ui" | "agent"; note?: string } = {}): Promise<Result<{ results: OpResult[]; rows: Row[] }>> {
  try {
    const s = await writer();
    if (!Array.isArray(ops) || ops.length === 0) return { ok: false, error: "Nothing to change." };
    if (ops.length > 500) return { ok: false, error: "Too many changes in one go (max 500)." };
    const db = await createClient();
    const res = await applyOps({ db, workspaceId: s.workspaceId, actorId: s.userId, via: opts.via ?? "ui", note: opts.note }, ops, { force: opts.force });
    if (!res.ok) return { ok: false, error: res.error ?? "Change rejected." };
    const ids = new Set(res.results.flatMap((r) => [r.rowId, ...(r.touched ?? [])]).filter(Boolean));
    const rows = (res.store?.rows ?? []).filter((r) => ids.has(r.id));
    if (res.results.some((r) => r.op !== "color" && r.op !== "move")) after(() => autoPush(s.workspaceId, s.userId));
    return { ok: true, data: { results: res.results, rows } };
  } catch (e) { return fail(e); }
}

export async function setLabelColorAction(list: string, itemId: string, color: string | null): Promise<Result> {
  try {
    const s = await writer();
    const db = await createClient();
    const { error } = await db.from("cr_reference").update({ color }).eq("workspace_id", s.workspaceId).eq("list", list).eq("item_id", itemId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Add or rename a dropdown value (a row of the Reference sheet). */
export async function upsertLabelAction(list: string, item: { item_id: string; name: string; is_open?: boolean | null; market_id?: string | null; color?: string | null }): Promise<Result> {
  try {
    const s = await writer();
    const def = REF_LIST_BY_NAME.get(list);
    if (!def) return { ok: false, error: "Unknown list." };
    const id = item.item_id.trim().toUpperCase();
    const name = item.name.trim();
    if (!/^[A-Z0-9]{1,8}$/.test(id)) return { ok: false, error: "ID must be 1–8 letters or digits." };
    if (!name) return { ok: false, error: "Name is required." };
    const db = await createClient();
    const { data: existing } = await db.from("cr_reference").select("item_id, position").eq("workspace_id", s.workspaceId).eq("list", list);
    if ((existing ?? []).length >= 25 && !(existing ?? []).some((e) => e.item_id === id)) return { ok: false, error: "The sheet holds at most 25 values per list." };
    const position = (existing ?? []).find((e) => e.item_id === id)?.position ?? Math.max(3, ...(existing ?? []).map((e) => e.position)) + 1;
    const { error } = await db.from("cr_reference").upsert({
      workspace_id: s.workspaceId, list, item_id: id, name, position,
      is_open: def.isopen ? item.is_open ?? true : null, market_id: def.marketid ? item.market_id ?? null : null,
      ...(item.color !== undefined ? { color: item.color } : {}),
    }, { onConflict: "workspace_id,list,item_id" });
    if (error) return { ok: false, error: error.message };
    await db.from("cr_changes").insert({ workspace_id: s.workspaceId, sheet: "Reference", row_key: `${list}:${id}`, action: "update", after: { name }, actor_id: s.userId, via: "ui" });
    after(() => autoPush(s.workspaceId, s.userId));
    return { ok: true, data: undefined, message: "Saved" };
  } catch (e) { return fail(e); }
}

export async function deleteLabelAction(list: string, itemId: string): Promise<Result> {
  try {
    const s = await writer();
    const db = await createClient();
    const { error } = await db.from("cr_reference").delete().eq("workspace_id", s.workspaceId).eq("list", list).eq("item_id", itemId);
    if (error) return { ok: false, error: error.message.includes("row-level") ? "Only the workspace owner can delete dropdown values." : error.message };
    await db.from("cr_changes").insert({ workspace_id: s.workspaceId, sheet: "Reference", row_key: `${list}:${itemId}`, action: "delete", actor_id: s.userId, via: "ui" });
    after(() => autoPush(s.workspaceId, s.userId));
    return { ok: true, data: undefined, message: "Removed" };
  } catch (e) { return fail(e); }
}

export async function rowHistoryAction(rowId: string): Promise<Result<{ id: number; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; via: string; created_at: string; actor: string | null }[]>> {
  try {
    const s = await getSession();
    const db = await createClient();
    const { data, error } = await db.from("cr_changes").select("id, action, before, after, via, created_at, actor_id").eq("workspace_id", s.workspaceId).eq("row_id", rowId).order("created_at", { ascending: false }).limit(50);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []).map((d) => ({ ...d, actor: d.actor_id === s.userId ? "You" : d.actor_id ? "Teammate" : null })) };
  } catch (e) { return fail(e); }
}

export async function trashAction(sheet: string): Promise<Result<Row[]>> {
  try {
    const s = await getSession();
    const db = await createClient();
    const { data, error } = await db.from("cr_rows").select("id, sheet, row_key, data, position, color, deleted_at, updated_at, updated_via")
      .eq("workspace_id", s.workspaceId).eq("sheet", sheet).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as Row[] };
  } catch (e) { return fail(e); }
}

/* ---------------------------------------------------------------- Munshi (AI agent) */

export async function storeAction(): Promise<Result<Store>> {
  try {
    const s = await getSession();
    return { ok: true, data: await loadStore(await createClient(), s.workspaceId) };
  } catch (e) { return fail(e); }
}

export async function proposeAction(instruction: string): Promise<Result<Proposal>> {
  try {
    const s = await writer();
    const q = instruction.trim();
    if (q.length < 4 || q.length > 4000) return { ok: false, error: "Write an instruction between 4 and 4,000 characters." };
    const db = await createClient();
    return { ok: true, data: await proposeChanges(db, s.workspaceId, s.userId, q) };
  } catch (e) {
    const msg = e instanceof GatewayError ? e.message : e instanceof Error ? e.message : "Munshi could not plan these changes.";
    if (/x-api-key|authentication_error|invalid api key/i.test(msg)) {
      return { ok: false, error: "The Anthropic API key saved in Settings → Providers was rejected (it may have been rotated). Paste the current key there, then try again." };
    }
    return { ok: false, error: msg };
  }
}

/* ---------------------------------------------------------------- Google Sheet link & sync */

async function owner() {
  const s = await getSession();
  if (s.role !== "owner" && s.role !== "analyst") throw new Error("Only owners and analysts can manage the Google Sheet link.");
  return s;
}

export async function linkSheetAction(urlOrId: string): Promise<Result> {
  try {
    const s = await owner();
    const id = parseSpreadsheetId(urlOrId);
    if (!id) return { ok: false, error: "Paste the Google Sheet's URL." };
    const meta = await getSpreadsheetMeta(s.workspaceId, id);
    const missing = ["Pipeline_India", "Organisations", "Contacts", "Reference"].filter((n) => !meta.sheets.some((x) => x.properties.title === n));
    if (missing.length) return { ok: false, error: `"${meta.properties.title}" is missing tabs: ${missing.join(", ")}. Link a copy of the central repository workbook.` };
    const admin = createAdminClient();
    await admin.from("cr_link").upsert({ workspace_id: s.workspaceId, spreadsheet_id: id, spreadsheet_url: meta.spreadsheetUrl, updated_at: new Date().toISOString(), last_status: "linked", last_error: null });
    revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message: `Linked "${meta.properties.title}". Run a sync to load it.` };
  } catch (e) { return fail(e); }
}

export async function unlinkSheetAction(): Promise<Result> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    await admin.from("cr_link").update({ spreadsheet_id: null, spreadsheet_url: null, last_status: "unlinked" }).eq("workspace_id", s.workspaceId);
    revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message: "Google Sheet unlinked. Data in gulel is kept." };
  } catch (e) { return fail(e); }
}

export async function disconnectGoogleAction(): Promise<Result> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    await admin.from("cr_link_secrets").delete().eq("workspace_id", s.workspaceId);
    await admin.from("cr_link").update({ account_email: null, last_status: "disconnected" }).eq("workspace_id", s.workspaceId);
    revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message: "Google account disconnected." };
  } catch (e) { return fail(e); }
}

export async function setAutoSyncAction(on: boolean): Promise<Result> {
  try {
    const s = await owner();
    const admin = createAdminClient();
    await admin.from("cr_link").upsert({ workspace_id: s.workspaceId, auto_push: on, updated_at: new Date().toISOString() });
    revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message: on ? "Auto-sync on" : "Auto-sync off" };
  } catch (e) { return fail(e); }
}

export async function syncAction(mode: "both" | "pull" | "push"): Promise<Result> {
  try {
    const s = await owner();
    let message: string;
    if (mode === "pull") { const r = await pullFromSheet(s.workspaceId, s.userId); message = `Pulled: ${r.inserted} new, ${r.updated} updated, ${r.deleted} removed${r.skipped ? `, ${r.skipped} kept (unsynced gulel edits)` : ""}.`; }
    else if (mode === "push") { const r = await pushToSheet(s.workspaceId, s.userId); message = `Wrote ${r.rows} rows to Google Sheets.${r.warnings.length ? ` ${r.warnings[0]}` : ""}`; }
    else { const r = await syncNow(s.workspaceId, s.userId); message = `Synced: ${r.pulled.inserted + r.pulled.updated + r.pulled.deleted} change(s) from the sheet, ${r.pushed.rows} rows written back.`; }
    revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message };
  } catch (e) { return fail(e); }
}

/** Load an .xlsx into gulel. Optionally create a Google Sheet from the same file and link it. */
export async function importWorkbookAction(form: FormData): Promise<Result<{ inserted: number; updated: number; deleted: number; warnings: string[]; sheetUrl?: string }>> {
  try {
    const s = await owner();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "Choose the central repository .xlsx file." };
    if (file.size > 15 * 1024 * 1024) return { ok: false, error: "File is larger than 15 MB." };
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellFormula: false, cellDates: false });
    const parsed = parseWorkbook((name) => {
      const ws = wb.Sheets[name];
      return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][]) : undefined;
    });
    if (!parsed.rows.length) return { ok: false, error: `No rows found. ${parsed.warnings.slice(0, 3).join("; ")}` };
    const replace = form.get("replace") === "on";
    const res = await mergeParsed(s.workspaceId, parsed, "import", s.userId, { deleteMissing: replace });
    let sheetUrl: string | undefined;
    if (form.get("createSheet") === "on") {
      const created = await createSheetFromXlsx(s.workspaceId, buf, file.name.replace(/\.xlsx$/i, ""));
      const admin = createAdminClient();
      await admin.from("cr_link").upsert({ workspace_id: s.workspaceId, spreadsheet_id: created.id, spreadsheet_url: created.webViewLink, last_status: "linked", last_error: null, updated_at: new Date().toISOString() });
      await admin.from("cr_changes").update({ pushed_at: new Date().toISOString() }).eq("workspace_id", s.workspaceId).is("pushed_at", null);
      sheetUrl = created.webViewLink;
    }
    after(() => autoPush(s.workspaceId, s.userId)); // links organisations and people into gulel, then syncs
    revalidatePath("/central", "layout");
    return { ok: true, data: { ...res, sheetUrl }, message: `Imported: ${res.inserted} new, ${res.updated} updated${replace ? `, ${res.deleted} removed` : ""}.` };
  } catch (e) { return fail(e); }
}

/* ---------------------------------------------------------------- API tokens for external agents */

export async function createApiTokenAction(label: string, canWrite: boolean): Promise<Result<{ token: string }>> {
  try {
    const s = await getSession();
    if (s.role !== "owner") return { ok: false, error: "Only the workspace owner can create API tokens." };
    const name = label.trim().slice(0, 60) || "Agent";
    const token = `cr_${randomBytes(24).toString("base64url")}`;
    const db = await createClient();
    const { error } = await db.from("cr_api_tokens").insert({
      workspace_id: s.workspaceId, label: name, token_hash: createHash("sha256").update(token).digest("hex"), token_hint: `${token.slice(0, 6)}…${token.slice(-4)}`, can_write: canWrite, created_by: s.userId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/central/sync");
    return { ok: true, data: { token }, message: "Token created. Copy it now; it won't be shown again." };
  } catch (e) { return fail(e); }
}

export async function revokeApiTokenAction(id: string): Promise<Result> {
  try {
    const s = await getSession();
    if (s.role !== "owner") return { ok: false, error: "Only the workspace owner can revoke API tokens." };
    const db = await createClient();
    const { error } = await db.from("cr_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", s.workspaceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/central/sync");
    return { ok: true, data: undefined, message: "Token revoked." };
  } catch (e) { return fail(e); }
}

/* ---------------------------------------------------------------- link to gulel, find LinkedIn, qualify */

export async function qualifyRepositoryAction(requalify = false): Promise<Result<{ total: number; finding: number; qualifying: number; skipped: number }>> {
  try {
    const s = await writer();
    const { queueRepositoryQualification } = await import("@/lib/central/enrich");
    const r = await queueRepositoryQualification(s.workspaceId, s.userId, { requalify });
    after(() => kickTick());
    revalidatePath("/central");
    revalidatePath("/organisations");
    return { ok: true, data: { total: r.total, finding: r.finding, qualifying: r.qualifying, skipped: r.skipped }, message: r.finding + r.qualifying ? `Queued ${r.finding} LinkedIn searches and ${r.qualifying} qualifications across ${r.total} organisations.` : `All ${r.total} organisations are linked and already qualified.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function linkRepositoryAction(): Promise<Result<{ created: number; linked: number; contacts: number; errors: string[] }>> {
  try {
    const s = await writer();
    const { reconcile } = await import("@/lib/central/bridge");
    const r = await reconcile(s.workspaceId);
    after(() => autoPush(s.workspaceId, s.userId));
    revalidatePath("/central");
    revalidatePath("/organisations");
    return { ok: true, data: { created: r.orgsCreated, linked: r.orgsLinked, contacts: r.contactsCreated + r.contactsLinked, errors: r.errors }, message: `Organisations: ${r.orgsCreated} created, ${r.orgsLinked} matched by name, ${r.orgsUpdated} updated. People: ${r.contactsCreated} created, ${r.contactsLinked} matched.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- saved board views
export interface SavedView { id: string; sheet: string; name: string; view: Record<string, unknown>; shared: boolean; mine: boolean; updated_at: string }

/** Views for a sheet: yours plus the ones teammates shared. */
export async function listViewsAction(sheet: string): Promise<Result<SavedView[]>> {
  try {
    const s = await getSession();
    const db = await createClient();
    const { data, error } = await db.from("cr_saved_views").select("id, sheet, name, view, shared, created_by, updated_at").eq("workspace_id", s.workspaceId).eq("sheet", sheet).order("name");
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []).map((v) => ({ id: v.id, sheet: v.sheet, name: v.name, view: v.view as Record<string, unknown>, shared: v.shared, mine: v.created_by === s.userId, updated_at: v.updated_at })) };
  } catch (e) { return fail(e); }
}

export async function saveViewAction(input: { id?: string; sheet: string; name: string; view: Record<string, unknown>; shared: boolean }): Promise<Result<SavedView>> {
  try {
    const s = await getSession();
    const name = input.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "Give the view a name." };
    if (JSON.stringify(input.view).length > 50_000) return { ok: false, error: "This view is too large to save." };
    const db = await createClient();
    const row = { workspace_id: s.workspaceId, sheet: input.sheet, name, view: input.view, shared: !!input.shared, created_by: s.userId, updated_at: new Date().toISOString() };
    const q = input.id ? db.from("cr_saved_views").update(row).eq("id", input.id).eq("created_by", s.userId) : db.from("cr_saved_views").insert(row);
    const { data, error } = await q.select("id, sheet, name, view, shared, updated_at").single();
    if (error) return { ok: false, error: input.id ? "Only the person who saved a view can change it. Save it as a new view instead." : error.message };
    return { ok: true, data: { ...data, view: data.view as Record<string, unknown>, mine: true } };
  } catch (e) { return fail(e); }
}

export async function deleteViewAction(id: string): Promise<Result> {
  try {
    const s = await getSession();
    const { error, count } = await (await createClient()).from("cr_saved_views").delete({ count: "exact" }).eq("id", id).eq("created_by", s.userId);
    if (error) return { ok: false, error: error.message };
    if (!count) return { ok: false, error: "Only the person who saved a view can delete it." };
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
