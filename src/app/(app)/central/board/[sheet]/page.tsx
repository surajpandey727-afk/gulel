import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { SHEETS } from "@/lib/central/schema";
import { loadStore } from "@/lib/central/store";
import { getLinkState, linkProps } from "@/lib/central/link";
import { syncNow } from "@/lib/central/sync";
import { Board } from "@/components/central/board";

export const dynamic = "force-dynamic";



export async function generateMetadata({ params }: { params: Promise<{ sheet: string }> }) {
  const { sheet } = await params;
  return { title: sheet.replace(/_/g, " ") };
}

export default async function BoardPage({ params, searchParams }: { params: Promise<{ sheet: string }>; searchParams: Promise<{ q?: string }> }) {
  const { sheet } = await params;
  const { q } = await searchParams;
  if (!SHEETS.some((s) => s.name === sheet)) notFound();
  const s = await getSession();
  const db = await createClient();
  const [store, link, notes, files] = await Promise.all([
    loadStore(db, s.workspaceId),
    getLinkState(db, s.workspaceId),
    db.from("notes").select("organisations!inner(cr_key)").eq("workspace_id", s.workspaceId).is("deleted_at", null).is("archived_at", null).not("organisation_id", "is", null).not("organisations.cr_key", "is", null).limit(5000),
    db.from("organisation_files").select("organisations!inner(cr_key)").eq("workspace_id", s.workspaceId).is("deleted_at", null).not("organisations.cr_key", "is", null).limit(5000),
  ]);
  const orgFiles: Record<string, number> = {};
  for (const f of (files.data ?? []) as unknown as { organisations: { cr_key: string | null } | null }[]) {
    const k = f.organisations?.cr_key;
    if (k) orgFiles[k] = (orgFiles[k] ?? 0) + 1;
  }
  const orgNotes: Record<string, number> = {};
  for (const n of (notes.data ?? []) as unknown as { organisations: { cr_key: string | null } | null }[]) {
    const k = n.organisations?.cr_key;
    if (k) orgNotes[k] = (orgNotes[k] ?? 0) + 1;
  }
  const counts = new Map<string, number>();
  for (const r of store.rows) counts.set(r.sheet, (counts.get(r.sheet) ?? 0) + 1);

  // Opening a board pulls fresh sheet edits in the background when the last sync is older than 2 minutes.
  const last = [link?.last_pull_at, link?.last_push_at].filter(Boolean).sort().at(-1);
  if (link?.spreadsheet_id && link.auto_push && s.role !== "viewer" && (!last || Date.now() - Date.parse(last) > 120_000)) {
    after(() => syncNow(s.workspaceId, s.userId).catch(() => {}));
  }

  return <Board key={sheet} sheet={sheet} initial={store} canWrite={s.role !== "viewer"} link={linkProps(link)} initialQuery={q ?? ""} orgNotes={orgNotes} orgFiles={orgFiles} counts={Object.fromEntries(counts)} />;
}
