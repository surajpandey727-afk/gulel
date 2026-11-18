import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readPrefs, type Prefs } from "./prefs";

export async function loadPrefs(userId: string): Promise<Prefs> {
  const db = await createClient();
  const { data } = await db.from("user_preferences").select("preferences").eq("user_id", userId).maybeSingle();
  return readPrefs((data?.preferences as Record<string, unknown> | null)?.display);
}
