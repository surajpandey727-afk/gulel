import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel } from "@/components/neo/surface";
import { StatusBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { OpsActions, RetryJob } from "./ops-actions";

export const metadata = { title: "Operations" };

export default async function OperationsPage() {
  const s = await getSession();
  const supabase = await createClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: providers }, { data: gmail }, { data: jobs }, { data: errors }, { data: events }, { data: costs }, depth] = await Promise.all([
    supabase.from("provider_connections").select("label, status, last_tested_at, is_enabled").eq("workspace_id", s.workspaceId),
    supabase.from("channel_accounts").select("account_email, status, last_sync_at, last_error").eq("workspace_id", s.workspaceId),
    supabase.from("jobs").select("id, type, status, attempts, max_attempts, last_error, run_after, created_at, correlation_id").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(30),
    supabase.from("system_errors").select("id, source, message, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(15),
    supabase.from("integration_events").select("id, integration, event, status, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(15),
    supabase.from("agent_executions").select("cost_usd").eq("workspace_id", s.workspaceId).gte("started_at", monthStart.toISOString()),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspaceId).in("status", ["queued", "failed"]),
  ]);
  const monthCost = (costs ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  const services = [
    ...(providers ?? []).map((p) => ({ name: `AI · ${p.label}`, status: p.is_enabled ? p.status : "disabled", detail: p.last_tested_at ? `tested ${new Date(p.last_tested_at).toLocaleString("en-GB")}` : "never tested" })),
    ...(gmail ?? []).map((g) => ({ name: `Gmail · ${g.account_email}`, status: g.status, detail: g.last_error ?? (g.last_sync_at ? `synced ${new Date(g.last_sync_at).toLocaleString("en-GB")}` : "never synced") })),
    { name: "LinkedIn", status: "permission_restricted", detail: "manual handoff by design" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-neo-lg neo-raised p-4"><p className="text-xs text-ink-3">LLM spend this month</p><p className="tabular text-2xl font-semibold">${monthCost.toFixed(2)}</p></div>
        <div className="rounded-neo-lg neo-raised p-4"><p className="text-xs text-ink-3">Queue depth</p><p className="tabular text-2xl font-semibold">{depth.count ?? 0}</p></div>
        <div className="rounded-neo-lg neo-raised p-4"><p className="text-xs text-ink-3">Failed / dead-letter jobs</p><p className="tabular text-2xl font-semibold">{(jobs ?? []).filter((j) => ["failed", "dead_letter"].includes(j.status)).length}</p></div>
      </div>
      <Panel title="Connected services" actions={<OpsActions />}>
        <ul className="flex flex-col gap-2">{services.map((x) => <li key={x.name} className="flex flex-wrap items-center gap-3 rounded-neo neo-inset-sm px-4 py-2.5 text-sm"><span className="flex-1 font-medium">{x.name}</span><span className="text-xs text-ink-3">{x.detail}</span><StatusBadge status={x.status} /></li>)}</ul>
        <p className="mt-3 text-xs text-ink-3">Background work runs from <code>/api/jobs/tick</code>. In production schedule it every minute with pg_cron + pg_net (see docs/OPERATIONS.md). Locally use “Run worker now”.</p>
      </Panel>
      <Panel title="Jobs">
        <Table>
          <thead><tr><Th>Type</Th><Th>Status</Th><Th className="text-right">Attempts</Th><Th>Error</Th><Th>Created</Th><Th /></tr></thead>
          <tbody>{(jobs ?? []).map((j) => (
            <Tr key={j.id}><Td className="font-mono text-xs">{j.type}</Td><Td><StatusBadge status={j.status === "succeeded" ? "approved" : j.status === "queued" || j.status === "running" ? "pending" : "failed"} label={j.status} /></Td>
              <Td className="tabular text-right">{j.attempts}/{j.max_attempts}</Td><Td className="max-w-sm truncate text-xs text-oxblood" title={j.last_error ?? ""}>{j.last_error}</Td><Td className="text-xs">{new Date(j.created_at).toLocaleString("en-GB")}</Td>
              <Td>{["failed", "dead_letter"].includes(j.status) && <RetryJob id={j.id} />}</Td></Tr>
          ))}</tbody>
        </Table>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Errors">{(errors ?? []).length ? <ul className="flex flex-col gap-2 text-xs">{(errors ?? []).map((e) => <li key={e.id} className="rounded-neo neo-inset-sm p-2.5"><span className="font-mono">{e.source}</span> · {new Date(e.created_at).toLocaleString("en-GB")}<p className="mt-1 text-oxblood">{e.message}</p></li>)}</ul> : <p className="text-sm text-ink-3">No errors recorded.</p>}</Panel>
        <Panel title="Integration events">{(events ?? []).length ? <ul className="flex flex-col gap-1.5 text-xs">{(events ?? []).map((e) => <li key={e.id} className="flex gap-2"><StatusBadge status={e.status === "ok" ? "approved" : e.status === "warning" ? "pending" : "failed"} label={e.status} /><span>{e.integration} · {e.event}</span><span className="ml-auto text-ink-3">{new Date(e.created_at).toLocaleString("en-GB")}</span></li>)}</ul> : <p className="text-sm text-ink-3">No events yet.</p>}</Panel>
      </div>
    </div>
  );
}
