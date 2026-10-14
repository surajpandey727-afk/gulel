import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/jobs/worker";

export const maxDuration = 300;

/** Called by pg_cron (pg_net) or any scheduler with `Authorization: Bearer $JOBS_SECRET`. */
export async function POST(req: NextRequest) {
  const secret = process.env.JOBS_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const results = await tick("cron");
  return NextResponse.json({ processed: results.length, results });
}
