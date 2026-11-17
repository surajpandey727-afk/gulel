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

  // Fire-and-forget: kick the worker so it picks up this job immediately
  kickTick().catch(() => {});

  return data!.id as string;
}

/** Hits the tick endpoint so jobs run without waiting for the cron. */
export async function kickTick() {
  // In production use the platform's own production domain (always reachable, never a stale or local URL).
  const base = (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const secret = process.env.JOBS_SECRET;
  if (!base || !secret) return;
  const url = base.startsWith("http") ? base : `https://${base}`;
  // Don't wait for the whole drain (minutes): the target invocation runs on its own once the request is accepted.
  await fetch(`${url}/api/jobs/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8000) }).catch(() => {});
}
