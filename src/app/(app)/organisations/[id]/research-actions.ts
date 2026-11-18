"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { researchSection, SECTIONS, type RunRow, type Section } from "@/lib/research/section";

type R<T> = { ok: true; data: T } | { ok: false; error: string };

/** Research one dossier section on its own. Never triggers other sections or a full requalification. */
export async function researchSectionAction(orgId: string, section: Section): Promise<R<RunRow>> {
  try {
    const s = await getSession();
    if (s.role === "viewer") throw new Error("Viewers can't run research.");
    if (!SECTIONS.includes(section)) throw new Error("Unknown section.");
    const db = await createClient();
    const { data: org } = await db.from("organisations").select("id").eq("id", orgId).eq("workspace_id", s.workspaceId).is("deleted_at", null).maybeSingle();
    if (!org) throw new Error("Organisation not found.");
    const run = await researchSection(s.workspaceId, s.userId, orgId, section);
    revalidatePath(`/organisations/${orgId}`);
    return { ok: true, data: run };
  } catch (e) { return { ok: false, error: (e as Error).message || "Research failed." }; }
}
