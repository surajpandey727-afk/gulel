"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export async function addTaskAction(title: string, due: string | null) {
  const s = await getSession();
  if (!title.trim()) return;
  const supabase = await createClient();
  await supabase.from("tasks").insert({ workspace_id: s.workspaceId, title: title.trim().slice(0, 300), kind: "other", due_at: due ? new Date(due).toISOString() : null, created_by: s.userId });
  revalidatePath("/tasks");
}

export async function setTaskStatusAction(id: string, status: "done" | "dismissed") {
  const s = await getSession();
  const supabase = await createClient();
  await supabase.from("tasks").update({ status, completed_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath("/tasks");
  revalidatePath("/overview");
}
