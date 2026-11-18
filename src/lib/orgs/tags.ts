import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanTags } from "./records";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
export interface DocTag { id: string; name: string; color: string; uses: number }

export const TAG_COLORS = ["green", "moss", "olive", "amber", "red", "taupe", "cream", "grey"] as const;
const AUTO = ["moss", "olive", "taupe", "amber", "cream", "grey", "red"] as const;
/** A stable colour per new tag name, so different tags read apart at a glance. */
export function autoTagColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AUTO[Math.abs(h) % AUTO.length];
}

/** The workspace's shared tag list, with how many live documents use each. */
export async function listTags(db: Db, workspaceId: string): Promise<DocTag[]> {
  const [{ data: tags }, { data: files }] = await Promise.all([
    db.from("doc_tags").select("id, name, color").eq("workspace_id", workspaceId).order("name"),
    db.from("organisation_files").select("tags").eq("workspace_id", workspaceId).is("deleted_at", null).limit(5000),
  ]);
  const uses = new Map<string, number>();
  for (const f of files ?? []) for (const t of (f.tags as string[] | null) ?? []) uses.set(t.toLowerCase(), (uses.get(t.toLowerCase()) ?? 0) + 1);
  return (tags ?? []).map((t) => ({ id: t.id as string, name: t.name as string, color: t.color as string, uses: uses.get(String(t.name).toLowerCase()) ?? 0 }));
}

/** Add any tags not yet on the shared list (case-insensitive). Never throws: a tag still saves on the document. */
export async function ensureTags(workspaceId: string, names: string[], userId: string | null) {
  const clean = cleanTags(names);
  if (!clean.length) return;
  const admin = createAdminClient();
  const { data: have } = await admin.from("doc_tags").select("name").eq("workspace_id", workspaceId);
  const known = new Set((have ?? []).map((t) => String(t.name).toLowerCase()));
  const add = clean.filter((t) => !known.has(t.toLowerCase())).map((name) => ({ workspace_id: workspaceId, name, color: /^qualification$/i.test(name) ? "green" : autoTagColor(name), created_by: userId }));
  if (add.length) await admin.from("doc_tags").insert(add).then(() => undefined, () => undefined);
}

export async function saveTag(db: Db, workspaceId: string, input: { id?: string; name: string; color: string }, userId: string | null) {
  const name = cleanTags([input.name])[0];
  if (!name) throw new Error("Give the tag a name.");
  const color = (TAG_COLORS as readonly string[]).includes(input.color) ? input.color : autoTagColor(name);
  if (input.id) {
    const { data: old } = await db.from("doc_tags").select("name").eq("id", input.id).eq("workspace_id", workspaceId).maybeSingle();
    if (!old) throw new Error("Tag not found.");
    const { error } = await db.from("doc_tags").update({ name, color }).eq("id", input.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(/doc_tags_name_uq|duplicate/i.test(error.message) ? `There is already a tag called “${name}”.` : error.message);
    // A rename carries through to every document using the old name.
    if (old.name !== name) await renameOnFiles(workspaceId, old.name as string, name);
    return;
  }
  const { error } = await db.from("doc_tags").insert({ workspace_id: workspaceId, name, color, created_by: userId });
  if (error) throw new Error(/doc_tags_name_uq|duplicate/i.test(error.message) ? `There is already a tag called “${name}”.` : error.message);
}

async function renameOnFiles(workspaceId: string, from: string, to: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("organisation_files").select("id, tags").eq("workspace_id", workspaceId).is("deleted_at", null).contains("tags", [from]);
  for (const f of data ?? []) {
    const next = cleanTags((f.tags as string[]).map((t) => (t === from ? to : t)));
    await admin.from("organisation_files").update({ tags: next }).eq("id", f.id);
  }
}

/** Remove a tag from the shared list. Documents keep the text unless `fromDocuments` is set. */
export async function deleteTag(db: Db, workspaceId: string, id: string, fromDocuments: boolean) {
  const { data: t } = await db.from("doc_tags").select("name").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!t) throw new Error("Tag not found.");
  const { error } = await db.from("doc_tags").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  if (fromDocuments) {
    const admin = createAdminClient();
    const { data } = await admin.from("organisation_files").select("id, tags").eq("workspace_id", workspaceId).is("deleted_at", null).contains("tags", [t.name]);
    for (const f of data ?? []) await admin.from("organisation_files").update({ tags: (f.tags as string[]).filter((x) => x !== t.name) }).eq("id", f.id);
  }
}
