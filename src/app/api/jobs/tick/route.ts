import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/jobs/worker";

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

/** Called by pg_cron (pg_net) or any scheduler with `Authorization: Bearer $JOBS_SECRET`. */
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const results = await tick("cron");
  return NextResponse.json({ processed: results.length, results });
}

/** Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  if (!checkSecret(req) && !checkCronSecret(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const results = await tick("cron");
  return NextResponse.json({ processed: results.length, results });
}
