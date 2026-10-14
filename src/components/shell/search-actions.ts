"use server";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit { type: "organisation" | "person" | "draft" | "conversation"; id: string; label: string; sub: string; href: string }

/** Workspace-scoped (RLS) quick search across the main records. */
export async function globalSearch(q: string): Promise<SearchHit[]> {
  const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 80);
  if (term.length < 2) return [];
  const s = await getSession();
  const supabase = await createClient();
  const like = `%${term}%`;
  const [orgs, people, emails, drafts] = await Promise.all([
    supabase.from("organisations").select("id, trading_name, primary_market, sector").eq("workspace_id", s.workspaceId).is("deleted_at", null).or(`trading_name.ilike.${like},legal_name.ilike.${like},primary_domain.ilike.${like}`).limit(8),
    supabase.from("contacts").select("id, full_name, contact_organisations(title, organisations(trading_name))").eq("workspace_id", s.workspaceId).is("deleted_at", null).ilike("full_name", like).limit(8),
    supabase.from("contact_channels").select("contact_id, value, contacts(full_name)").eq("workspace_id", s.workspaceId).ilike("value", like).not("contact_id", "is", null).limit(5),
    supabase.from("outreach_drafts").select("id, channel, status, organisations!inner(trading_name)").eq("workspace_id", s.workspaceId).ilike("organisations.trading_name", like).limit(5),
  ]);
  const hits: SearchHit[] = [];
  for (const o of orgs.data ?? []) hits.push({ type: "organisation", id: o.id, label: o.trading_name, sub: `${o.primary_market} · ${o.sector ?? "sector unknown"}`, href: `/organisations/${o.id}` });
  const seen = new Set<string>();
  for (const p of people.data ?? []) {
    seen.add(p.id);
    const co = (p.contact_organisations as unknown as Array<{ title: string | null; organisations: { trading_name: string } }>)[0];
    hits.push({ type: "person", id: p.id, label: p.full_name, sub: [co?.title, co?.organisations?.trading_name].filter(Boolean).join(" · "), href: `/people/${p.id}` });
  }
  for (const e of emails.data ?? []) {
    if (!e.contact_id || seen.has(e.contact_id)) continue;
    hits.push({ type: "person", id: e.contact_id, label: (e.contacts as unknown as { full_name: string } | null)?.full_name ?? e.value, sub: e.value, href: `/people/${e.contact_id}` });
  }
  for (const d of drafts.data ?? []) hits.push({ type: "draft", id: d.id, label: `Draft · ${(d.organisations as unknown as { trading_name: string }).trading_name}`, sub: `${d.channel} · ${d.status.replace(/_/g, " ")}`, href: `/outreach/${d.id}` });
  return hits;
}
