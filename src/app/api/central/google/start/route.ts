import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/workspace";
import { SHEETS_STATE_COOKIE, sheetsAuthUrl, sheetsConfigured } from "@/lib/central/google";

export async function GET() {
  const s = await getSession();
  const base = process.env.NEXT_PUBLIC_APP_URL!;
  if (s.role !== "owner" && s.role !== "analyst") return NextResponse.redirect(new URL("/central/sync?google=forbidden", base));
  if (!sheetsConfigured()) return NextResponse.redirect(new URL("/central/sync?google=not_configured", base));
  const state = randomBytes(24).toString("hex");
  (await cookies()).set(SHEETS_STATE_COOKIE, `${state}.${s.workspaceId}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(sheetsAuthUrl(state, s.email ?? undefined));
}
