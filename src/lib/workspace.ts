import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Market = "UK" | "IN";
export type Role = "owner" | "analyst" | "reviewer" | "viewer";

export interface SessionContext {
  userId: string;
  email: string | null;
  workspaceId: string;
  role: Role;
}

/** Resolves the signed-in user and their active workspace (cached per request). */
export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("active_workspace_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  let query = supabase.from("workspace_members").select("workspace_id, role").eq("user_id", auth.user.id);
  if (prefs?.active_workspace_id) query = query.eq("workspace_id", prefs.active_workspace_id);
  const { data: member } = await query.limit(1).maybeSingle();
  if (!member) throw new Error("No workspace membership for this user");
  return { userId: auth.user.id, email: auth.user.email ?? null, workspaceId: member.workspace_id, role: member.role as Role };
});

export function canApprove(role: Role) {
  return role === "owner" || role === "reviewer";
}
