import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { PoliciesForm } from "./policies-form";

export const metadata = { title: "Approval & pricing" };

export default async function PoliciesPage() {
  const s = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("workspace_settings").select("daily_send_cap, min_hours_between_org_sends, approval_ttl_hours, require_compliance_check, tracking_pixels_enabled, pricing_ranges").eq("workspace_id", s.workspaceId).single();
  return <PoliciesForm initial={data as never} isOwner={s.role === "owner"} />;
}
