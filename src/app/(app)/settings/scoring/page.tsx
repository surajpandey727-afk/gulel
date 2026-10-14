import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { ScoringEditor } from "./scoring-editor";

export const metadata = { title: "Scoring model" };

export default async function ScoringPage() {
  const s = await getSession();
  const supabase = await createClient();
  const { data: models } = await supabase.from("scoring_models").select("id, version_no, weights, qualified_threshold, freshness_half_life_days, is_active, notes, created_at").eq("workspace_id", s.workspaceId).order("version_no", { ascending: false });
  const active = models?.find((m) => m.is_active);
  return <ScoringEditor active={active as never} history={(models ?? []) as never} isOwner={s.role === "owner"} />;
}
