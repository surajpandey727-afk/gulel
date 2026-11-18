import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseCompanyName } from "@/lib/import/normalise";
import { pushOrgToCentral } from "@/lib/central/bridge";
import { isRich, normaliseRichInput, richToText } from "@/lib/notes/rich";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
export type NoteVia = "ui" | "agent" | "api" | "inbox";
export type FileVia = "ui" | "agent" | "api";

export interface NoteRow { id: string; body: string; organisation_id: string | null; contact_id: string | null; via: string; created_at: string; updated_at: string; created_by: string | null; author: string | null; archived_at: string | null }
export interface FileRow { id: string; name: string; size_bytes: number; mime_type: string | null; via: string; uploaded_label: string | null; created_at: string; organisation_id: string; tags: string[]; notes: string | null }

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
/** Notes for organisations / a person. Archived notes are included (flagged) so the UI can show them on request. */
export async function listNotes(db: Db, workspaceId: string, where: { orgIds?: string[]; contactId?: string }): Promise<NoteRow[]> {
  const ors: string[] = [];
  if (where.orgIds?.length) ors.push(`organisation_id.in.(${where.orgIds.join(",")})`);
  if (where.contactId) ors.push(`contact_id.eq.${where.contactId}`);
  if (!ors.length) return [];
  const { data, error } = await db.from("notes").select("id, body, organisation_id, contact_id, via, created_at, updated_at, created_by, archived_at")
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
  const body = cleanNoteBody(n.body);
  if (!body) throw new Error("Write something first.");
  if (!n.organisationId && !n.contactId) throw new Error("A note needs an organisation or a person.");
  const { data, error } = await db.from("notes").insert({ workspace_id: workspaceId, organisation_id: n.organisationId ?? null, contact_id: n.contactId ?? null, body, via: n.via, created_by: n.userId }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function editNote(db: Db, workspaceId: string, id: string, body: string) {
  const b = cleanNoteBody(body);
  if (!b) throw new Error("A note can't be empty. Delete it instead.");
  const { error } = await db.from("notes").update({ body: b }).eq("id", id).eq("workspace_id", workspaceId).is("deleted_at", null);
  if (error) throw new Error(error.message);
}

/** Rich (HTML) bodies are sanitised; plain text is kept as plain text. Limits: 20,000 characters of text, 200 kB stored. */
export function cleanNoteBody(body: string): string {
  const raw = String(body ?? "");
  const b = isRich(raw) || /<(strong|em|u|span|br|ul|ol|li|h[2-4])\b/i.test(raw) ? normaliseRichInput(raw) : raw.trim();
  if (richToText(b).length > 20000) throw new Error("Notes are limited to 20,000 characters.");
  if (b.length > 200000) throw new Error("This note has too much formatting to save. Clear some formatting and try again.");
  return b;
}

export async function archiveNote(db: Db, workspaceId: string, id: string, archived: boolean) {
  const { error } = await db.from("notes").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).eq("workspace_id", workspaceId).is("deleted_at", null);
  if (error) throw new Error(error.message);
}

export async function deleteNote(db: Db, workspaceId: string, id: string) {
  const { error } = await db.from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- files
export async function listFiles(db: Db, workspaceId: string, orgIds: string[]): Promise<FileRow[]> {
  if (!orgIds.length) return [];
  const { data, error } = await db.from("organisation_files").select("id, name, size_bytes, mime_type, via, uploaded_label, created_at, organisation_id, tags, notes")
    .eq("workspace_id", workspaceId).in("organisation_id", orgIds).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as FileRow[]).map((f) => ({ ...f, tags: f.tags ?? [] }));
}

/** Open string tags: trimmed, de-duplicated (case-insensitive), at most 12 of up to 40 characters. */
export function cleanTags(tags: unknown): string[] {
  const out: string[] = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const v = String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 12);
}

export async function updateFileMeta(db: Db, workspaceId: string, fileId: string, patch: { tags?: string[]; notes?: string | null }) {
  const row: Record<string, unknown> = {};
  if (patch.tags !== undefined) row.tags = cleanTags(patch.tags);
  if (patch.notes !== undefined) {
    const n = patch.notes ? cleanNoteBody(patch.notes) : "";
    if (n.length > 60000) throw new Error("Document notes are limited in length. Shorten the note and try again.");
    row.notes = n || null;
  }
  if (!Object.keys(row).length) return;
  const { error } = await db.from("organisation_files").update(row).eq("id", fileId).eq("workspace_id", workspaceId).is("deleted_at", null);
  if (error) throw new Error(error.message);
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

export async function recordFile(workspaceId: string, f: { orgId: string; path: string; name: string; mime: string | null; via: FileVia; userId: string | null; label?: string | null; tags?: string[]; notes?: string | null }) {
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
    ...(f.tags ? { tags: cleanTags(f.tags) } : {}), ...(f.notes ? { notes: f.notes.slice(0, 10000) } : {}),
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

// ---------------------------------------------------------------- what an organisation still carries (shown before archive / delete)
export interface OrgDependents {
  contacts: number; notes: number; files: number; evidence: number; qualifications: number; drafts: number; conversations: number;
  /** Central Repository rows (pipeline, partners, projects, contacts…) that point at this organisation. */
  repoRefs: { sheet: string; key: string | null }[];
}

export async function orgDependents(db: Db, workspaceId: string, orgId: string): Promise<OrgDependents> {
  const count = async (table: string) => {
    const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("organisation_id", orgId);
    return count ?? 0;
  };
  const [{ data: org }, contacts, notes, files, evidence, qualifications, drafts, conversations] = await Promise.all([
    db.from("organisations").select("cr_key").eq("id", orgId).eq("workspace_id", workspaceId).maybeSingle(),
    db.from("contact_organisations").select("contact_id", { count: "exact", head: true }).eq("organisation_id", orgId).then((r) => r.count ?? 0),
    count("notes"), count("organisation_files"), count("evidence_items"), count("lead_qualifications"), count("outreach_drafts"), count("conversations"),
  ]);
  let repoRefs: OrgDependents["repoRefs"] = [];
  if (org?.cr_key) {
    const { data } = await db.from("cr_rows").select("sheet, row_key").eq("workspace_id", workspaceId).eq("data->>org_id", org.cr_key).neq("sheet", "Organisations").is("deleted_at", null).limit(50);
    repoRefs = (data ?? []).map((r) => ({ sheet: r.sheet as string, key: r.row_key as string | null }));
  }
  return { contacts, notes, files, evidence, qualifications, drafts, conversations, repoRefs };
}

/**
 * Permanent deletion. Only for an organisation already in Deleted. Research, notes, files, scores and links go with it;
 * people stay (unlinked), drafts and conversations stay (no longer attached). An audit entry keeps what was removed.
 */
export async function purgeOrg(workspaceId: string, orgId: string, userId: string | null, confirmName: string) {
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("id, trading_name, cr_key, deleted_at").eq("id", orgId).eq("workspace_id", workspaceId).maybeSingle();
  if (!org) throw new Error("Organisation not found.");
  if (!org.deleted_at) throw new Error("Delete it first (it moves to Deleted), then delete permanently from there.");
  if (confirmName.trim().toLowerCase() !== String(org.trading_name).trim().toLowerCase()) throw new Error("Type the organisation's name exactly to confirm.");
  const deps = await orgDependents(admin, workspaceId, orgId);
  if (deps.repoRefs.length) throw new Error(`Still referenced by ${deps.repoRefs.length} Central Repository row(s): ${deps.repoRefs.slice(0, 4).map((r) => `${r.sheet.replace(/_/g, " ")} ${r.key ?? ""}`).join(", ")}. Remove those references first.`);
  const { data: files } = await admin.from("organisation_files").select("path").eq("organisation_id", orgId);
  const paths = (files ?? []).map((f) => f.path as string);
  for (let i = 0; i < paths.length; i += 100) await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  const { error } = await admin.from("organisations").delete().eq("id", orgId).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  await admin.from("audit_logs").insert({
    workspace_id: workspaceId, actor_type: userId ? "user" : "system", actor_id: userId, action: "organisation.purged", entity_type: "organisation", entity_id: orgId,
    metadata: { name: org.trading_name, cr_key: org.cr_key, removed: { notes: deps.notes, files: deps.files, evidence: deps.evidence, qualifications: deps.qualifications }, kept: { contacts: deps.contacts, drafts: deps.drafts, conversations: deps.conversations } },
  });
}

// ---------------------------------------------------------------- duplicates and merging
export interface DupOrg { id: string; name: string; market: string | null; crKey: string | null; domain: string | null; contacts: number; notes: number; files: number; evidence: number; score: number | null; archived: boolean }
export interface DupGroup { reason: string; orgs: DupOrg[] }

const STOP = new Set(["the", "and", "co", "company", "group", "studio", "studios", "india", "uk", "ltd", "limited", "pvt", "private", "llp", "inc"]);
const core = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");

/** Possible duplicates among live organisations: same name, same website domain, or one name being the start of the other. */
export async function findDuplicates(db: Db, workspaceId: string): Promise<DupGroup[]> {
  const { data } = await db.from("organisations")
    .select("id, trading_name, normalised_name, primary_domain, primary_market, cr_key, archived_at, contact_organisations(count), notes(count), organisation_files(count), evidence_items(count), lead_qualifications(score, override_score, is_current)")
    .eq("workspace_id", workspaceId).is("deleted_at", null).is("notes.deleted_at", null).is("organisation_files.deleted_at", null).limit(2000);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const n = (x: unknown) => (x as Array<{ count: number }> | null)?.[0]?.count ?? 0;
  const orgs: (DupOrg & { core: string })[] = rows.map((o) => {
    const q = (o.lead_qualifications as Array<{ score: number; override_score: number | null; is_current: boolean }>).find((x) => x.is_current);
    return {
      id: o.id as string, name: o.trading_name as string, market: o.primary_market as string | null, crKey: o.cr_key as string | null, domain: o.primary_domain as string | null,
      contacts: n(o.contact_organisations), notes: n(o.notes), files: n(o.organisation_files), evidence: n(o.evidence_items),
      score: q ? Math.round(Number(q.override_score ?? q.score)) : null, archived: !!o.archived_at, core: core(String(o.normalised_name ?? o.trading_name)),
    };
  });
  // Union-find over the three matching rules; the reason records the strongest one.
  const parent = new Map(orgs.map((o) => [o.id, o.id]));
  const reason = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const join = (a: string, b: string, why: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); if (!reason.has(find(a))) reason.set(find(a), why); };
  const by = (key: (o: DupOrg & { core: string }) => string | null, why: string) => {
    const m = new Map<string, string>();
    for (const o of orgs) { const k = key(o); if (!k) continue; if (m.has(k)) join(m.get(k)!, o.id, why); else m.set(k, o.id); }
  };
  by((o) => (o.core.length >= 3 ? o.core : null), "Same name");
  by((o) => o.domain, "Same website");
  const sorted = [...orgs].filter((o) => o.core.length >= 4).sort((a, b) => a.core.length - b.core.length);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    if (sorted[j].core !== sorted[i].core && sorted[j].core.startsWith(`${sorted[i].core} `)) join(sorted[i].id, sorted[j].id, "Similar name");
  }
  const groups = new Map<string, DupOrg[]>();
  for (const o of orgs) { const r = find(o.id); if (!groups.has(r)) groups.set(r, []); const { core: _c, ...rest } = o; void _c; groups.get(r)!.push(rest); }
  return [...groups.entries()].filter(([, g]) => g.length > 1).map(([r, g]) => ({
    reason: reason.get(r) ?? "Similar",
    // Suggested keeper first: in the Central Repository, then the most attached.
    orgs: g.sort((a, b) => Number(!!b.crKey) - Number(!!a.crKey) || (b.contacts + b.notes + b.files + b.evidence) - (a.contacts + a.notes + a.files + a.evidence)),
  })).sort((a, b) => a.orgs[0].name.localeCompare(b.orgs[0].name));
}

/** Merge each of `dropIds` into `keepId` (everything attached moves; the duplicates are retired, not erased). */
export async function mergeOrgs(workspaceId: string, keepId: string, dropIds: string[], userId: string | null) {
  const admin = createAdminClient();
  const moved: Record<string, number> = {};
  for (const drop of [...new Set(dropIds)].filter((d) => d !== keepId)) {
    const { data, error } = await admin.rpc("merge_organisations", { p_ws: workspaceId, p_keep: keepId, p_drop: drop, p_actor: userId });
    if (error) throw new Error(error.message);
    for (const [k, v] of Object.entries((data ?? {}) as Record<string, number>)) moved[k] = (moved[k] ?? 0) + v;
  }
  // If the kept record inherited a repository ID, make the board row carry the kept name.
  const { data: keep } = await admin.from("organisations").select("trading_name, cr_key").eq("id", keepId).single();
  let linked = false;
  if (keep?.cr_key) { const r = await pushOrgToCentral(workspaceId, keepId, { trading_name: keep.trading_name }, userId); linked = r.linked; }
  return { moved, linked };
}
