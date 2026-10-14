import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, canApprove } from "@/lib/workspace";
import { CHANNELS } from "@/lib/channels/registry";
import { Studio, type StudioData } from "./studio";

export const metadata = { title: "Draft" };

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const supabase = await createClient();
  const { data: d } = await supabase.from("outreach_drafts")
    .select("*, organisations(id, trading_name, primary_market, sector, website, needs), contacts(id, full_name, linkedin_url, subscriber_type, contact_organisations(title, organisation_id)), outreach_strategies(*)")
    .eq("id", id).eq("workspace_id", s.workspaceId).maybeSingle();
  if (!d) notFound();

  const [{ data: versions }, { data: approvals }, { data: qual }, { data: siblings }, { data: gmail }, { data: voice }] = await Promise.all([
    supabase.from("draft_versions").select("id, version_no, source, refine_action, subject, body, recipient_value, strategic_angle, supporting_evidence_ids, quality, created_at, fingerprint, sending_account_id").eq("draft_id", id).order("version_no", { ascending: false }),
    supabase.from("approval_requests").select("id, status, draft_version_id, content_fingerprint, approved_at, expires_at, decision_reason, created_at").eq("draft_id", id).order("created_at", { ascending: false }),
    supabase.from("lead_qualifications").select("score, override_score, band, coverage, explanation").eq("organisation_id", d.organisation_id).eq("is_current", true).maybeSingle(),
    supabase.from("outreach_drafts").select("id, channel").eq("organisation_id", d.organisation_id).eq("contact_id", d.contact_id).neq("id", id),
    supabase.from("channel_accounts").select("account_email, status").eq("workspace_id", s.workspaceId).eq("channel", "gmail").maybeSingle(),
    supabase.from("voice_profiles").select("voice_profile_versions!voice_profiles_active_fk(version_no, source)").eq("workspace_id", s.workspaceId).single(),
  ]);
  const current = versions?.[0];
  const evIds = Array.from(new Set((versions ?? []).flatMap((v) => v.supporting_evidence_ids as string[])));
  const { data: evidence } = await supabase.from("evidence_items").select("id, claim_text, source_name, source_url, published_at, fact_type").in("id", evIds.length ? evIds : ["00000000-0000-0000-0000-000000000000"]);

  const data: StudioData = {
    draft: { id: d.id, channel: d.channel, kind: d.kind, status: d.status, provider_draft_id: d.provider_draft_id, synced: d.provider_draft_synced_version_id === current?.id, follow_up: d.suggested_follow_up_on },
    org: d.organisations as StudioData["org"],
    contact: d.contacts ? { ...(d.contacts as { id: string; full_name: string; linkedin_url: string | null; subscriber_type: string }), title: ((d.contacts as { contact_organisations: Array<{ title: string | null; organisation_id: string }> }).contact_organisations.find((x) => x.organisation_id === d.organisation_id)?.title) ?? null } : null,
    strategy: d.outreach_strategies as StudioData["strategy"],
    versions: (versions ?? []) as StudioData["versions"],
    approvals: (approvals ?? []) as StudioData["approvals"],
    qualification: qual as StudioData["qualification"],
    evidence: (evidence ?? []) as StudioData["evidence"],
    siblings: (siblings ?? []) as StudioData["siblings"],
    gmail: gmail ? { email: gmail.account_email as string, status: gmail.status as string } : null,
    voice: (voice?.voice_profile_versions as unknown as { version_no: number; source: string }) ?? null,
    capabilities: CHANNELS[d.channel as "gmail" | "linkedin"],
    canApprove: canApprove(s.role),
  };
  return <Studio data={data} />;
}
