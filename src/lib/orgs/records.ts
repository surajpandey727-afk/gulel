import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseCompanyName } from "@/lib/import/normalise";
import { pushOrgToCentral } from "@/lib/central/bridge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
export type NoteVia = "ui" | "agent" | "api" | "inbox";
export type FileVia = "ui" | "agent" | "api";

export interface NoteRow { id: string; body: string; organisation_id: string | null; contact_id: string | null; via: string; created_at: string; updated_at: string; created_by: string | null; author: string | null }
export interface FileRow { id: string; name: string; size_bytes: number; mime_type: string | null; via: string; uploaded_label: string | null; created_at: string; organisation_id: string }

export const BUCKET = "org-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts a gulel id, a Central Repository ID (ORG-030) or the organisation's name. */
export async function resolveOrg(db: Db, workspaceId: string, ref: string): Promise<{ id: string; trading_name: string; cr_key: string | null } | null> {
  const v = ref.trim();
  if (!v) return null;
  const base = () => db.from("organisations").select("id, trading_name, cr_key").eq("workspace_id", workspaceId).is("deleted_at", null);
  if (UUID.test(v)) return (await base().eq("id", v).maybeSingle()).data;
  if (/^ORG-\d+$/i.test(v)) return (await base().eq("cr_key", v.toUpperCase()).maybeSingle()).data;
  const { data } = await base().eq("normalised_name", normaliseCompanyName(v)).limit(2);
  return data?.length === 1 ? data[0] : null;
}

// ---------------------------------------------------------------- notes
export async function listNotes(db: Db, workspaceId: string, where: { orgIds?: string[]; contactId?: string }): Promise<NoteRow[]> {
  const ors: string[] = [];
  if (where.orgIds?.length) ors.push(`organisation_id.in.(${where.orgIds.join(",")})`);
  if (where.contactId) ors.push(`contact_id.eq.${where.contactId}`);
  if (!ors.length) return [];
  const { data, error } = await db.from("notes").select("id, body, organisation_id, contact_id, via, created_at, updated_at, created_by")
    .eq("workspace_id", workspaceId).is("deleted_at", null).or(ors.join(",")).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map((n) => n.created_by).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const admin = createAdminClient();
    await Promise.all(ids.slice(0, 20).map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const u = data?.user;
      if (u) names.set(id, (u.user_metadata?.full_name as string | undefined) || u.email?.split("@")[0] || "Team member");
    }));
  }
  return (data ?? []).map((n) => ({ ...n, author: n.created_by ? names.get(n.created_by) ?? "Team member" : n.via === "agent" ? "AI agent" : n.via === "api" ? "API" : null }));
}

export async function addNote(db: Db, workspaceId: string, n: { organisationId?: string | null; contactId?: string | null; body: string; via: NoteVia; userId: string | null }) {
  const body = n.body.trim();
  if (!body) throw new Error("Write something first.");
  if (body.length > 20000) throw new Error("Notes are limited to 20,000 characters.");
  if (!n.organisationId && !n.contactId) throw new Error("A note needs an organisation or a person.");
  const { data, error } = await db.from("notes").insert({ workspace_id: workspaceId, organisation_id: n.organisationId ?? null, contact_id: n.contactId ?? null, body, via: n.via, created_by: n.userId }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function editNote(db: Db, workspaceId: string, id: string, body: string) {
  const b = body.trim();
  if (!b) throw new Error("A note can't be empty. Delete it instead.");
  const { error } = await db.from("notes").update({ body: b }).eq("id", id).eq("workspace_id", workspaceId).is("deleted_at", null);
  if (error) throw new Error(error.message);
}

export async function deleteNote(db: Db, workspaceId: string, id: string) {
  const { error } = await db.from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- files
export async function listFiles(db: Db, workspaceId: string, orgIds: string[]): Promise<FileRow[]> {
  if (!orgIds.length) return [];
  const { data, error } = await db.from("organisation_files").select("id, name, size_bytes, mime_type, via, uploaded_label, created_at, organisation_id")
    .eq("workspace_id", workspaceId).in("organisation_id", orgIds).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FileRow[];
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "file";
export const filePath = (workspaceId: string, orgId: string, name: string) => `${workspaceId}/${orgId}/${crypto.randomUUID()}/${safeName(name)}`;

/** Browser upload: returns a one-time signed URL; the browser PUTs the file straight to storage, then calls recordFile. */
export async function createUpload(workspaceId: string, orgId: string, name: string, size: number) {
  if (size > MAX_FILE_BYTES) throw new Error("Files are limited to 50 MB.");
  const path = filePath(workspaceId, orgId, name);
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, token: data.token };
}

export async function recordFile(workspaceId: string, f: { orgId: string; path: string; name: string; mime: string | null; via: FileVia; userId: string | null; label?: string | null }) {
  if (!f.path.startsWith(`${workspaceId}/${f.orgId}/`)) throw new Error("That upload doesn't belong to this organisation.");
  const admin = createAdminClient();
  const dir = f.path.split("/").slice(0, -1).join("/");
  const { data: listed, error: le } = await admin.storage.from(BUCKET).list(dir);
  if (le) throw new Error(le.message);
  const obj = listed?.find((o) => o.name === f.path.split("/").pop());
  if (!obj) throw new Error("The upload didn't finish. Try again.");
  const { data, error } = await admin.from("organisation_files").upsert({
    workspace_id: workspaceId, organisation_id: f.orgId, name: safeName(f.name), path: f.path, size_bytes: Number(obj.metadata?.size ?? 0),
    mime_type: f.mime || (obj.metadata?.mimetype as string | undefined) || null, via: f.via, uploaded_by: f.userId, uploaded_label: f.label ?? null,
  }, { onConflict: "path" }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Server-side upload (AI agent / API): bytes in, recorded file out. */
export async function uploadFileBytes(workspaceId: string, orgId: string, name: string, bytes: Uint8Array, mime: string | null, via: FileVia, label: string | null) {
  if (!bytes.byteLength) throw new Error("The file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Files are limited to 50 MB.");
  const path = filePath(workspaceId, orgId, name);
  const { error } = await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: mime ?? "application/octet-stream", upsert: false });
  if (error) throw new Error(error.message);
  return recordFile(workspaceId, { orgId, path, name, mime, via, userId: null, label });
}

export async function fileUrl(db: Db, workspaceId: string, fileId: string, download = false) {
  const { data: f } = await db.from("organisation_files").select("path, name").eq("id", fileId).eq("workspace_id", workspaceId).is("deleted_at", null).maybeSingle();
  if (!f) throw new Error("File not found.");
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(f.path, 300, download ? { download: f.name } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteFile(db: Db, workspaceId: string, fileId: string) {
  const { error } = await db.from("organisation_files").update({ deleted_at: new Date().toISOString() }).eq("id", fileId).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- archive / delete (kept identical on both sides)
export async function setArchived(workspaceId: string, orgId: string, archived: boolean, userId: string | null) {
  const repo = await pushOrgToCentral(workspaceId, orgId, { archived }, userId);
  if (!repo.ok) throw new Error(`Central Repository: ${repo.error}`);
  const admin = createAdminClient();
  const { error } = await admin.from("organisations").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", orgId).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: userId ? "user" : "system", actor_id: userId, action: archived ? "organisation.archived" : "organisation.reinstated", entity_type: "organisation", entity_id: orgId });
  return repo.linked;
}

export async function setDeleted(workspaceId: string, orgId: string, deleted: boolean, userId: string | null) {
  const repo = await pushOrgToCentral(workspaceId, orgId, deleted ? { delete: true } : { restore: true }, userId);
  if (!repo.ok) throw new Error(deleted ? `${repo.error}. Archive it instead, or remove those references first.` : `Central Repository: ${repo.error}`);
  const admin = createAdminClient();
  const { error } = await admin.from("organisations").update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", orgId).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.code === "23505" ? "Another organisation now uses this domain or repository ID." : error.message);
  await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: userId ? "user" : "system", actor_id: userId, action: deleted ? "organisation.deleted" : "organisation.restored", entity_type: "organisation", entity_id: orgId });
  return repo.linked;
}

// ---------------------------------------------------------------- notes written in the Central Repository / Google Sheet
export interface RepoNote { sheet: string; key: string; label: string; note: string }

/** Notes columns from the repository rows about this organisation (its own row, plus pipeline/partner/contact rows that point at it). */
export async function repoNotesFor(db: Db, workspaceId: string, crKey: string | null): Promise<RepoNote[]> {
  if (!crKey) return [];
  const [{ data: own }, { data: refs }] = await Promise.all([
    db.from("cr_rows").select("sheet, row_key, data").eq("workspace_id", workspaceId).eq("sheet", "Organisations").eq("row_key", crKey).is("deleted_at", null),
    db.from("cr_rows").select("sheet, row_key, data").eq("workspace_id", workspaceId).eq("data->>org_id", crKey).is("deleted_at", null),
  ]);
  const out: RepoNote[] = [];
  const seen = new Set<string>();
  for (const r of [...(own ?? []), ...(refs ?? [])]) {
    const id = `${r.sheet}:${r.row_key}`;
    if (seen.has(id)) continue; // an Organisations row also carries its own org_id
    seen.add(id);
    const d = r.data as Record<string, unknown>;
    const note = typeof d.notes === "string" ? d.notes.trim() : "";
    if (!note) continue;
    const label = String(d.opportunity ?? d.name ?? d.organisation ?? r.row_key ?? "");
    out.push({ sheet: r.sheet as string, key: r.row_key as string, label, note });
  }
  return out;
}
