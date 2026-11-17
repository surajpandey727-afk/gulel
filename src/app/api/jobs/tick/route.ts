import { NextResponse, after, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/jobs/worker";
import { kickTick } from "@/lib/jobs/enqueue";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncNow } from "@/lib/central/sync";

export const maxDuration = 300;

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.JOBS_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

function checkCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/** Two-way sync for linked Central Repository sheets not synced in the last 5 minutes. */
async function syncCentral() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await admin.from("cr_link").select("workspace_id, last_pull_at").not("spreadsheet_id", "is", null).eq("auto_push", true);
  const due = (data ?? []).filter((l) => !l.last_pull_at || l.last_pull_at < cutoff);
  const out = [];
  for (const l of due) {
    try { await syncNow(l.workspace_id, null); out.push({ workspace: l.workspace_id, ok: true }); }
    catch (e) { out.push({ workspace: l.workspace_id, ok: false, error: (e as Error).message }); }
  }
  return out;
}

/**
 * Work through the queue for most of this invocation's time budget, then, if work remains, hand over to a fresh
 * invocation via after() (which the platform keeps alive), so long queues drain without a scheduler.
 */
async function drain() {
  const started = Date.now();
  const results: Awaited<ReturnType<typeof tick>> = [];
  let last = 0;
  do {
    const r = await tick("cron");
    results.push(...r);
    last = r.length;
  } while (last > 0 && Date.now() - started < 150_000);
  if (last > 0) after(() => kickTick());
  return results;
}

/** Called by pg_cron (pg_net) or any scheduler with `Authorization: Bearer $JOBS_SECRET`. */
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const results = await drain();
  const central = await syncCentral().catch(() => []);
  return NextResponse.json({ processed: results.length, results, central });
}

/** Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  if (!checkSecret(req) && !checkCronSecret(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const results = await drain();
  const central = await syncCentral().catch(() => []);
  return NextResponse.json({ processed: results.length, results, central });
}
