import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { PageHeader } from "@/components/neo/surface";
import { TaskList } from "./task-list";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const s = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("id, title, kind, status, due_at, source, notes, organisation_id, conversation_id, draft_id, organisations(trading_name)").eq("workspace_id", s.workspaceId).in("status", ["open", "snoozed"]).order("due_at", { ascending: true, nullsFirst: false }).limit(300);
  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups, reminders and next actions. System reminders never send anything — a follow-up still needs its own draft and approval." />
      <TaskList tasks={(data ?? []) as never} />
    </>
  );
}
