"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { addOrgToCentral } from "@/lib/central/bridge";
import { autoPush } from "@/lib/central/sync";
import { repoNotesFor, type RepoNote } from "@/lib/orgs/records";
import { addNote, createUpload, deleteFile, deleteNote, editNote, fileUrl, listFiles, listNotes, recordFile, resolveOrg, setArchived, setDeleted, type FileRow, type NoteRow } from "@/lib/orgs/records";

type R<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: (e as Error).message || "Something went wrong." });

async function writer() {
  const s = await getSession();
  if (s.role === "viewer") throw new Error("Viewers can't change records.");
  return s;
}

function refresh(orgId?: string | null) {
  if (orgId) revalidatePath(`/organisations/${orgId}`);
  revalidatePath("/organisations");
  revalidatePath("/people", "layout");
}

// ---------------------------------------------------------------- notes
export async function addNoteAction(input: { organisationId?: string | null; contactId?: string | null; body: string }): Promise<R<NoteRow[]>> {
  try {
    const s = await writer();
    const db = await createClient();
    await addNote(db, s.workspaceId, { ...input, via: "ui", userId: s.userId });
    refresh(input.organisationId);
    return { ok: true, data: await listNotes(db, s.workspaceId, { orgIds: input.organisationId ? [input.organisationId] : [], contactId: input.contactId ?? undefined }), message: "Note added" };
  } catch (e) { return fail(e); }
}

export async function editNoteAction(id: string, body: string): Promise<R> {
  try { const s = await writer(); await editNote(await createClient(), s.workspaceId, id, body); refresh(); return { ok: true, data: undefined, message: "Note saved" }; } catch (e) { return fail(e); }
}

export async function deleteNoteAction(id: string): Promise<R> {
  try { const s = await writer(); await deleteNote(await createClient(), s.workspaceId, id); refresh(); return { ok: true, data: undefined, message: "Note deleted" }; } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------- files
export async function startUploadAction(orgId: string, name: string, size: number): Promise<R<{ path: string; token: string }>> {
  try {
    const s = await writer();
    const org = await resolveOrg(await createClient(), s.workspaceId, orgId);
    if (!org) throw new Error("Organisation not found.");
    return { ok: true, data: await createUpload(s.workspaceId, org.id, name, size) };
  } catch (e) { return fail(e); }
}

export async function finishUploadAction(orgId: string, path: string, name: string, mime: string | null): Promise<R<FileRow[]>> {
  try {
    const s = await writer();
    await recordFile(s.workspaceId, { orgId, path, name, mime, via: "ui", userId: s.userId });
    refresh(orgId);
    return { ok: true, data: await listFiles(await createClient(), s.workspaceId, [orgId]), message: "Uploaded" };
  } catch (e) { return fail(e); }
}

export async function fileUrlAction(fileId: string, download = false): Promise<R<string>> {
  try { const s = await getSession(); return { ok: true, data: await fileUrl(await createClient(), s.workspaceId, fileId, download) }; } catch (e) { return fail(e); }
}

export async function deleteFileAction(fileId: string): Promise<R> {
  try { const s = await writer(); await deleteFile(await createClient(), s.workspaceId, fileId); refresh(); return { ok: true, data: undefined, message: "File removed" }; } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------- archive / delete / link
export async function archiveOrgAction(orgId: string, archived: boolean): Promise<R> {
  try {
    const s = await writer();
    const linked = await setArchived(s.workspaceId, orgId, archived, s.userId);
    if (linked) after(() => autoPush(s.workspaceId, s.userId));
    refresh(orgId); revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message: archived ? "Archived. Reinstate it any time." : "Reinstated" };
  } catch (e) { return fail(e); }
}

export async function deleteOrgAction(orgId: string, restore = false): Promise<R> {
  try {
    const s = await writer();
    const linked = await setDeleted(s.workspaceId, orgId, !restore, s.userId);
    if (linked) after(() => autoPush(s.workspaceId, s.userId));
    refresh(orgId); revalidatePath("/central", "layout");
    return { ok: true, data: undefined, message: restore ? "Restored" : "Deleted. Restore it from the Central Repository trash or the Deleted filter." };
  } catch (e) { return fail(e); }
}

export async function addOrgToCentralAction(orgId: string): Promise<R<string>> {
  try {
    const s = await writer();
    const key = await addOrgToCentral(s.workspaceId, orgId, s.userId);
    after(() => autoPush(s.workspaceId, s.userId));
    refresh(orgId); revalidatePath("/central", "layout");
    return { ok: true, data: key, message: `Added to the Central Repository as ${key}` };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------- the same organisation, seen from the board
export interface OrgContext {
  id: string; name: string; crKey: string | null; website: string | null; linkedin: string | null; archived: boolean;
  qualification: { band: string; score: number; at: string } | null;
  notes: NoteRow[]; files: FileRow[]; repoNotes: RepoNote[];
}

export async function orgContextAction(ref: string): Promise<R<OrgContext | null>> {
  try {
    const s = await getSession();
    const db = await createClient();
    const org = await resolveOrg(db, s.workspaceId, ref);
    if (!org) return { ok: true, data: null };
    const [{ data: o }, { data: li }, { data: q }, notes, files, repoNotes] = await Promise.all([
      db.from("organisations").select("website, archived_at").eq("id", org.id).single(),
      db.from("contact_channels").select("value").eq("organisation_id", org.id).eq("channel", "linkedin").is("contact_id", null).limit(1).maybeSingle(),
      db.from("lead_qualifications").select("band, score, override_score, created_at").eq("organisation_id", org.id).eq("is_current", true).maybeSingle(),
      listNotes(db, s.workspaceId, { orgIds: [org.id] }),
      listFiles(db, s.workspaceId, [org.id]),
      repoNotesFor(db, s.workspaceId, org.cr_key),
    ]);
    return { ok: true, data: {
      id: org.id, name: org.trading_name, crKey: org.cr_key, website: o?.website ?? null, linkedin: li?.value ?? null, archived: !!o?.archived_at,
      qualification: q ? { band: q.band, score: Number(q.override_score ?? q.score), at: q.created_at } : null, notes, files, repoNotes,
    } };
  } catch (e) { return fail(e); }
}
