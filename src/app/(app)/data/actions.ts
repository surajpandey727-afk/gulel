"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { buildPreview, commitBatch, previewMapping, revertBatch, uploadWorkbook } from "@/lib/import/service";
import type { ImportField } from "@/lib/import/mapping";
import { createClient } from "@/lib/supabase/server";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const wrap = async <T,>(fn: () => Promise<T>): Promise<R<T>> => {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: (e as Error).message }; }
};

export async function uploadAction(form: FormData) {
  const s = await getSession();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false as const, error: "Choose a file to upload." };
  return wrap(() => uploadWorkbook(s.workspaceId, s.userId, file));
}

export async function mappingAction(batchId: string, sheet: string) {
  const s = await getSession();
  return wrap(() => previewMapping(s.workspaceId, batchId, sheet));
}

export async function previewAction(batchId: string, sheet: string, mapping: Record<string, ImportField | null>) {
  const s = await getSession();
  return wrap(async () => {
    const stats = await buildPreview(s.workspaceId, batchId, sheet, mapping);
    const supabase = await createClient();
    const { data: rows } = await supabase.from("import_rows").select("id, row_number, action, status, errors, warnings, normalised").eq("batch_id", batchId).order("row_number").limit(300);
    return { stats, rows: rows ?? [] };
  });
}

export async function commitAction(batchId: string, rejectProposed: string[]) {
  const s = await getSession();
  const r = await wrap(() => commitBatch(s.workspaceId, s.userId, batchId, rejectProposed));
  revalidatePath("/data");
  revalidatePath("/organisations");
  return r;
}

export async function revertAction(batchId: string) {
  const s = await getSession();
  const r = await wrap(() => revertBatch(s.workspaceId, s.userId, batchId));
  revalidatePath("/data");
  revalidatePath("/organisations");
  return r;
}
