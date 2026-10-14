import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel } from "@/components/neo/surface";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { SecurityActions, RemoveSuppression } from "./security-actions";
import { signOut } from "@/app/login/actions";

export const metadata = { title: "Security & data" };

export default async function SecurityPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ data: sup }, { data: audit }, demo] = await Promise.all([
    supabase.from("suppression_entries").select("id, kind, value, reason, notes, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(200),
    supabase.from("audit_logs").select("id, actor_type, actor_id, action, entity_type, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(40),
    supabase.from("organisations").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspaceId).eq("is_demo", true),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Session" eyebrow={s.email ?? ""} actions={<form action={signOut}><button className="text-sm text-oxblood hover:underline" type="submit">Sign out</button></form>}>
        <p className="text-sm text-ink-2">Role: <strong className="capitalize">{s.role}</strong>. Workspace isolation is enforced by Postgres row-level security. Provider keys and OAuth tokens are encrypted server-side and are never readable from the browser.</p>
      </Panel>
      <Panel title="Central suppression list" eyebrow="Checked before drafting and again before every send">
        {(sup ?? []).length ? (
          <Table><thead><tr><Th>Kind</Th><Th>Value</Th><Th>Reason</Th><Th>Added</Th><Th /></tr></thead>
            <tbody>{(sup ?? []).map((e) => <Tr key={e.id}><Td className="capitalize">{e.kind}</Td><Td className="font-mono text-xs">{e.value}</Td><Td>{e.reason.replace(/_/g, " ")}{e.notes && <span className="block text-xs text-ink-3">{e.notes}</span>}</Td><Td className="text-xs">{new Date(e.created_at).toLocaleDateString("en-GB")}</Td><Td>{s.role === "owner" && <RemoveSuppression id={e.id} />}</Td></Tr>)}</tbody></Table>
        ) : <p className="text-sm text-ink-3">No suppressions.</p>}
      </Panel>
      <Panel title="Demo data" eyebrow="Segregated from live records">
        <SecurityActions demoCount={demo.count ?? 0} isOwner={s.role === "owner"} />
      </Panel>
      <Panel title="Audit log" eyebrow="Latest 40 events">
        <ul className="flex flex-col gap-1 text-xs">{(audit ?? []).map((a) => <li key={a.id} className="flex flex-wrap gap-2"><span className="font-mono text-ink-2">{a.action}</span><span className="text-ink-3">{a.actor_type}{a.entity_type ? ` · ${a.entity_type}` : ""}</span><span className="ml-auto text-ink-3">{new Date(a.created_at).toLocaleString("en-GB")}</span></li>)}</ul>
      </Panel>
    </div>
  );
}
