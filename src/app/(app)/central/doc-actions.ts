"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyMentions } from "@/lib/notify/mentions";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { deleteTag, ensureTags, listTags, saveTag, type DocTag } from "@/lib/orgs/tags";
import { createUpload, deleteFile, fileUrl, listFiles, recordFile, resolveOrg, updateFileMeta, type FileRow } from "@/lib/orgs/records";

/**
 * Documents against a Central Repository row. Files belong to the row's organisation (ORG-xxx), so the same
 * documents show on every board row for that company, in the board drawer and on the gulel organisation page.
 */
type R<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: (e as Error).message || "Something went wrong." });

export interface DocsBundle { org: { id: string; name: string; key: string | null }; files: FileRow[]; tags: DocTag[] }

async function writer() {
  const s = await getSession();
  if (s.role === "viewer") throw new Error("Viewers can't change documents.");
  return s;
}

async function orgFor(ref: string) {
  const s = await getSession();
  const db = await createClient();
  const org = await resolveOrg(db, s.workspaceId, ref);
  if (!org) throw new Error(`${ref} isn't linked to a gulel organisation yet. Sync the repository and try again.`);
  return { s, db, org };
}

export async function docsAction(orgKey: string): Promise<R<DocsBundle>> {
  try {
    const { s, db, org } = await orgFor(orgKey);
    const [files, tags] = await Promise.all([listFiles(db, s.workspaceId, [org.id]), listTags(db, s.workspaceId)]);
    return { ok: true, data: { org: { id: org.id, name: org.trading_name, key: org.cr_key }, files, tags } };
  } catch (e) { return fail(e); }
}

export async function startDocUploadAction(orgId: string, name: string, size: number): Promise<R<{ path: string; token: string }>> {
  try {
    const s = await writer();
    if (!(await resolveOrg(await createClient(), s.workspaceId, orgId))) throw new Error("Organisation not found.");
    return { ok: true, data: await createUpload(s.workspaceId, orgId, name, size) };
  } catch (e) { return fail(e); }
}

export async function finishDocUploadAction(orgId: string, path: string, name: string, mime: string | null, tags: string[]): Promise<R<FileRow[]>> {
  try {
    const s = await writer();
    if (!(await resolveOrg(await createClient(), s.workspaceId, orgId))) throw new Error("Organisation not found.");
    await recordFile(s.workspaceId, { orgId, path, name, mime, via: "ui", userId: s.userId, tags });
    await ensureTags(s.workspaceId, tags, s.userId);
    revalidatePath(`/organisations/${orgId}`);
    return { ok: true, data: await listFiles(await createClient(), s.workspaceId, [orgId]), message: "Uploaded" };
  } catch (e) { return fail(e); }
}

export async function updateDocAction(fileId: string, patch: { tags?: string[]; notes?: string | null }): Promise<R> {
  try {
    const s = await writer();
    const db = await createClient();
    const { data: before } = await db.from("organisation_files").select("name, notes, organisation_id, organisations(trading_name)").eq("id", fileId).eq("workspace_id", s.workspaceId).maybeSingle();
    await updateFileMeta(db, s.workspaceId, fileId, patch);
    if (patch.tags) await ensureTags(s.workspaceId, patch.tags, s.userId);
    if (before && patch.notes) {
      const org = (before.organisations as unknown as { trading_name: string } | null)?.trading_name ?? "an organisation";
      after(() => notifyMentions({ workspaceId: s.workspaceId, actorId: s.userId, body: patch.notes!, before: before.notes, where: `${org} (document “${before.name}”)`, link: `/organisations/${before.organisation_id}#files` }));
    }
    return { ok: true, data: undefined, message: "Saved" };
  } catch (e) { return fail(e); }
}

export async function docUrlAction(fileId: string, download = false): Promise<R<string>> {
  try { const s = await getSession(); return { ok: true, data: await fileUrl(await createClient(), s.workspaceId, fileId, download) }; } catch (e) { return fail(e); }
}

export async function docUrlsAction(fileIds: string[]): Promise<R<{ id: string; url: string }[]>> {
  try {
    const s = await getSession();
    const db = await createClient();
    const out: { id: string; url: string }[] = [];
    for (const id of fileIds.slice(0, 100)) out.push({ id, url: await fileUrl(db, s.workspaceId, id) });
    return { ok: true, data: out };
  } catch (e) { return fail(e); }
}

export async function deleteDocAction(fileId: string): Promise<R> {
  try { const s = await writer(); await deleteFile(await createClient(), s.workspaceId, fileId); return { ok: true, data: undefined, message: "Document removed" }; } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------- shared document tags
export async function tagsAction(): Promise<R<DocTag[]>> {
  try { const s = await getSession(); return { ok: true, data: await listTags(await createClient(), s.workspaceId) }; } catch (e) { return fail(e); }
}
export async function saveTagAction(input: { id?: string; name: string; color: string }): Promise<R<DocTag[]>> {
  try { const s = await writer(); const db = await createClient(); await saveTag(db, s.workspaceId, input, s.userId); return { ok: true, data: await listTags(db, s.workspaceId), message: "Tag saved" }; } catch (e) { return fail(e); }
}
export async function deleteTagAction(id: string, fromDocuments: boolean): Promise<R<DocTag[]>> {
  try { const s = await writer(); const db = await createClient(); await deleteTag(db, s.workspaceId, id, fromDocuments); return { ok: true, data: await listTags(db, s.workspaceId), message: "Tag removed" }; } catch (e) { return fail(e); }
}
