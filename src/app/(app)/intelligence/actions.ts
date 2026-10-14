"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export async function setTriggerStatusAction(id: string, status: "reviewed" | "dismissed" | "actioned") {
  const s = await getSession();
  const supabase = await createClient();
  const { data: t } = await supabase.from("trigger_events").update({ status }).eq("id", id).eq("workspace_id", s.workspaceId).select("task_id").single();
  if (t?.task_id && status !== "actioned") await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", t.task_id);
  revalidatePath("/intelligence");
  revalidatePath("/tasks");
}
