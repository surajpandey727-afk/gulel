import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function enqueueJob(
  workspaceId: string,
  type: string,
  payload: Record<string, unknown> = {},
  opts?: { maxAttempts?: number; timeoutSeconds?: number },
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("jobs")
    .insert({
      workspace_id: workspaceId,
      type,
      payload,
      max_attempts: opts?.maxAttempts ?? 3,
      timeout_seconds: opts?.timeoutSeconds ?? 300,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}
