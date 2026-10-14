import { createClient } from "@/lib/supabase/server";
import { getSession, canApprove } from "@/lib/workspace";
import { PageHeader } from "@/components/neo/surface";
import { ApprovalQueue, type QueueItem } from "./queue";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string; focus?: string }> }) {
  const { status = "pending", focus } = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const statuses = status === "approved" ? ["approved"] : status === "done" ? ["consumed", "rejected", "invalidated", "expired"] : ["pending", "snoozed"];
  const { data } = await supabase.from("approval_requests")
    .select("id, status, channel, recipient_value, subject, created_at, approved_at, expires_at, decision_reason, content_fingerprint, draft_id, draft_versions!approval_requests_draft_version_id_fkey(body, version_no, quality, strategic_angle, supporting_evidence_ids), outreach_drafts!inner(organisation_id, contact_id, organisations!inner(trading_name, primary_market), contacts(full_name, verification_status))")
    .eq("workspace_id", s.workspaceId).in("status", statuses).order("created_at", { ascending: status === "pending" }).limit(200);

  const orgIds = Array.from(new Set((data ?? []).map((a) => (a.outreach_drafts as unknown as { organisation_id: string }).organisation_id)));
  const { data: quals } = await supabase.from("lead_qualifications").select("organisation_id, score, override_score").in("organisation_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]).eq("is_current", true);
  const scoreBy = new Map((quals ?? []).map((q) => [q.organisation_id, Math.round(Number(q.override_score ?? q.score))]));
  const { data: channels } = await supabase.from("contact_channels").select("value, verification_status, email_quality").eq("workspace_id", s.workspaceId).in("value", (data ?? []).map((a) => a.recipient_value));
  const chBy = new Map((channels ?? []).map((c) => [c.value, c]));

  const items: QueueItem[] = (data ?? []).map((a) => {
    const d = a.outreach_drafts as unknown as { organisation_id: string; organisations: { trading_name: string; primary_market: string }; contacts: { full_name: string } | null };
    const v = a.draft_versions as unknown as { body: string; version_no: number; quality: { tone_match?: number; factuality?: { status: string; unsupported_claims?: string[] }; compliance?: { eligible: boolean; reasons: string[]; warnings: string[] } }; strategic_angle: string | null; supporting_evidence_ids: string[] };
    const ch = chBy.get(a.recipient_value);
    const warnings: string[] = [...(v.quality?.compliance?.warnings ?? [])];
    const blockers: string[] = [...(v.quality?.compliance?.reasons ?? [])];
    if (v.quality?.factuality?.status !== "pass") blockers.push("Factuality check has issues — review individually.");
    if (!v.supporting_evidence_ids?.length) blockers.push("No supporting evidence cited.");
    if (ch && ch.verification_status !== "verified") warnings.push("Recipient email is not verified.");
    if (ch?.email_quality === "role_generic") warnings.push("Generic role inbox — lower response likelihood.");
    return {
      id: a.id, status: a.status, channel: a.channel as "gmail" | "linkedin", recipient: a.recipient_value, subject: a.subject, createdAt: a.created_at, approvedAt: a.approved_at, expiresAt: a.expires_at,
      draftId: a.draft_id, organisationId: d.organisation_id, organisation: d.organisations.trading_name, market: d.organisations.primary_market, contact: d.contacts?.full_name ?? null,
      body: v.body, version: v.version_no, angle: v.strategic_angle, tone: v.quality?.tone_match ?? null, score: scoreBy.get(d.organisation_id) ?? null,
      warnings, blockers, fingerprint: a.content_fingerprint, reason: a.decision_reason,
    };
  });

  return (
    <>
      <PageHeader title="Approvals" description="Every external communication is deliberately authorised. Approval binds to the exact content, recipient, channel and sending account." />
      <ApprovalQueue items={items} status={status} focus={focus ?? null} canApprove={canApprove(s.role)} />
    </>
  );
}
