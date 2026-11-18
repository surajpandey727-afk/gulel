"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PREFS, readPrefs, type Prefs } from "@/lib/prefs";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Save some of your display preferences (merged over what is stored). "reset" puts everything back to defaults. */
export async function savePrefsAction(patch: Partial<Prefs> | "reset"): Promise<R<Prefs>> {
  try {
    const s = await getSession();
    const db = await createClient();
    const { data } = await db.from("user_preferences").select("preferences").eq("user_id", s.userId).maybeSingle();
    const all = (data?.preferences ?? {}) as Record<string, unknown>;
    const next = patch === "reset" ? DEFAULT_PREFS : readPrefs({ ...readPrefs(all.display), ...patch });
    if (JSON.stringify(next).length > 200_000) throw new Error("Too many saved layouts. Reset some board layouts and try again.");
    const { error } = await db.from("user_preferences").upsert({ user_id: s.userId, preferences: { ...all, display: next } }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    if (patch === "reset" || "orgSort" in patch) revalidatePath("/organisations");
    return { ok: true, data: next };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
