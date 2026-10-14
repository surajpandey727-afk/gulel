import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/workspace";
import { authUrl, gmailConfigured } from "@/lib/channels/gmail";

export async function GET() {
  const s = await getSession();
  if (s.role !== "owner") return NextResponse.json({ error: "Only the workspace owner can connect Gmail" }, { status: 403 });
  if (!gmailConfigured()) return NextResponse.redirect(new URL("/settings/integrations?gmail=not_configured", process.env.NEXT_PUBLIC_APP_URL));
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("gmail_oauth_state", `${state}.${s.workspaceId}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authUrl(state));
}
