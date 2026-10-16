import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { lookupLinkedInOrg } from "@/lib/discovery/linkedin-lookup";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { linkedinUrl } = await req.json();
  if (!linkedinUrl?.includes("linkedin.com/company/"))
    return NextResponse.json({ ok: false, error: "Enter a LinkedIn company page URL (e.g. linkedin.com/company/acme)" });

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return NextResponse.json({ ok: false, error: "No workspace found" });

  try {
    const data = await lookupLinkedInOrg(member.workspace_id, user.id, linkedinUrl);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Lookup failed" });
  }
}
