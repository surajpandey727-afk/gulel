import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { Copilot } from "@/components/copilot/copilot";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const supabase = await createClient();

  const [{ data: settings }, approvals, inbox] = await Promise.all([
    supabase.from("workspace_settings").select("onboarding").eq("workspace_id", session.workspaceId).single(),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("workspace_id", session.workspaceId).eq("status", "pending"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", session.workspaceId).eq("needs_review", true),
  ]);

  // First use: capture the founder's writing style before anything else.
  const onboarding = (settings?.onboarding ?? {}) as { voice?: "completed" | "skipped" };
  const path = (await headers()).get("x-pathname") ?? "";
  if (!onboarding.voice && !path.startsWith("/onboarding")) redirect("/onboarding/voice");

  const badges = { "/approvals": approvals.count ?? 0, "/inbox": inbox.count ?? 0 };
  return (
    <div className="flex min-h-dvh">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-28 pt-6 md:px-8 lg:pb-10">
          {children}
        </main>
      </div>
      <MobileNav badges={badges} />
      <Suspense>
        <Copilot />
      </Suspense>
    </div>
  );
}
