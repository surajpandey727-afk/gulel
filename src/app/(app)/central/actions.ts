"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const CENTRAL = "/central";

// ── Projects ────────────────────────────────────────────────────────
export async function addProjectAction(data: {
  name: string; organisation_id: string; opportunity_id?: string;
  scope?: string; region?: string; status?: string;
  start_date?: string; end_date?: string;
  fee_amount?: number; fee_currency?: string;
  has_nda?: boolean; has_testimonial?: boolean; notes?: string;
}) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({
    workspace_id: s.workspaceId,
    ...data,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    fee_amount: data.fee_amount ?? null,
    created_by: s.userId,
  });
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Project created" };
}

export async function updateProjectAction(id: string, data: Record<string, unknown>) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(data).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Project updated" };
}

export async function deleteProjectAction(id: string) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Project deleted" };
}

// ── Finances ────────────────────────────────────────────────────────
export async function addFinanceAction(data: {
  project_id?: string; organisation_id: string;
  type: string; item: string; currency: string;
  quantity: number; unit_amount: number; status?: string;
  invoice_date?: string; received_amount?: number;
  received_date?: string; notes?: string;
}) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("finances").insert({
    workspace_id: s.workspaceId,
    ...data,
    invoice_date: data.invoice_date || null,
    received_date: data.received_date || null,
    created_by: s.userId,
  });
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Finance record created" };
}

export async function updateFinanceAction(id: string, data: Record<string, unknown>) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("finances").update(data).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Finance record updated" };
}

export async function deleteFinanceAction(id: string) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("finances").delete().eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Finance record deleted" };
}

// ── Credentials ─────────────────────────────────────────────────────
export async function addCredentialAction(data: {
  name: string; type: string; organisation_id?: string;
  project_id?: string; sector?: string; status?: string;
  permission_notes?: string;
}) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("credentials").insert({
    workspace_id: s.workspaceId,
    ...data,
    created_by: s.userId,
  });
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Credential created" };
}

export async function updateCredentialAction(id: string, data: Record<string, unknown>) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("credentials").update(data).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Credential updated" };
}

export async function deleteCredentialAction(id: string) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("credentials").delete().eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Credential deleted" };
}

// ── Opportunities (pipeline) ────────────────────────────────────────
export async function updateOpportunityAction(id: string, data: Record<string, unknown>) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").update(data).eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  revalidatePath("/pipeline");
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Opportunity updated" };
}

export async function deleteOpportunityAction(id: string) {
  const s = await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").delete().eq("id", id).eq("workspace_id", s.workspaceId);
  revalidatePath(CENTRAL);
  revalidatePath("/pipeline");
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Opportunity deleted" };
}
