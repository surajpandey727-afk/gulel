import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clock, DollarSign,
  Gauge, Layers, RotateCcw, TrendingUp, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { StaggerReveal } from "@/components/reactbits/stagger-reveal";
import { Panel, EmptyState } from "@/components/neo/surface";
import { StatusBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { OpsControls, RetryJobBtn } from "./ops-controls";

export const metadata = { title: "Operations · gulel" };

type AgentPerf = {
  agent: string;
  total: number;
  succeeded: number;
  failed: number;
  avg_cost: number;
  total_cost: number;
};

export default async function OperationsPage() {
  const s = await getSession();
  const supabase = await createClient();
  const ws = s.workspaceId;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const [
    { data: jobs },
    { data: costs },
    { data: agentExecs },
    queueDepth,
    failedDepth,
    { data: errors },
    { data: events },
    { data: providers },
    { data: gmail },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, type, status, attempts, max_attempts, last_error, run_after, created_at, updated_at, cost_usd, correlation_id")
      .eq("workspace_id", ws)
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("agent_executions")
      .select("cost_usd")
      .eq("workspace_id", ws)
      .gte("started_at", monthIso),
    supabase
      .from("agent_executions")
      .select("agent, status, cost_usd")
      .eq("workspace_id", ws)
      .gte("started_at", monthIso),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .in("status", ["queued"]),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .in("status", ["failed", "dead_letter"]),
    supabase
      .from("system_errors")
      .select("id, source, message, correlation_id, created_at")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("integration_events")
      .select("id, integration, event, status, created_at")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("provider_connections")
      .select("label, status, last_tested_at, is_enabled")
      .eq("workspace_id", ws),
    supabase
      .from("channel_accounts")
      .select("account_email, status, last_sync_at, last_error")
      .eq("workspace_id", ws),
  ]);

  const monthCost = (costs ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);

  // Aggregate agent performance
  const agentMap = new Map<string, AgentPerf>();
  for (const ex of agentExecs ?? []) {
    const key = ex.agent ?? "unknown";
    const p = agentMap.get(key) ?? { agent: key, total: 0, succeeded: 0, failed: 0, avg_cost: 0, total_cost: 0 };
    p.total++;
    if (ex.status === "succeeded") p.succeeded++;
    else p.failed++;
    p.total_cost += Number(ex.cost_usd ?? 0);
    agentMap.set(key, p);
  }
  const agentPerf = Array.from(agentMap.values())
    .map((p) => ({ ...p, avg_cost: p.total > 0 ? p.total_cost / p.total : 0 }))
    .sort((a, b) => b.total - a.total);

  const jobsArr = jobs ?? [];
  const succeededToday = jobsArr.filter((j) => j.status === "succeeded").length;

  const services = [
    ...(providers ?? []).map((p) => ({
      name: `AI · ${p.label}`,
      status: p.is_enabled ? p.status : "disabled",
      detail: p.last_tested_at ? `tested ${new Date(p.last_tested_at).toLocaleString("en-GB")}` : "never tested",
    })),
    ...(gmail ?? []).map((g) => ({
      name: `Gmail · ${g.account_email}`,
      status: g.status,
      detail: g.last_error ?? (g.last_sync_at ? `synced ${new Date(g.last_sync_at).toLocaleString("en-GB")}` : "never synced"),
    })),
  ];

  return (
    <>
      <AnimatedPageHeader
        title="Operations Centre"
        description="System health, agent performance, and background job monitoring"
        actions={<OpsControls />}
      />

      {/* KPI row */}
      <StaggerReveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <KpiCard icon={DollarSign} label="LLM spend this month" value={`$${monthCost.toFixed(2)}`} />
          <KpiCard icon={Layers} label="Queue depth" value={String(queueDepth.count ?? 0)} tone={queueDepth.count && queueDepth.count > 10 ? "warning" : "neutral"} />
          <KpiCard icon={AlertTriangle} label="Failed jobs" value={String(failedDepth.count ?? 0)} tone={failedDepth.count && failedDepth.count > 0 ? "critical" : "neutral"} />
          <KpiCard icon={CheckCircle2} label="Succeeded (recent)" value={String(succeededToday)} tone="positive" />
        </div>
      </StaggerReveal>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Agent performance */}
        <Panel title="Agent performance" eyebrow="THIS MONTH" id="agents">
          {agentPerf.length === 0 ? (
            <p className="text-sm text-ink-3">No agent executions this month.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {agentPerf.map((a) => {
                const rate = a.total > 0 ? (a.succeeded / a.total) * 100 : 0;
                return (
                  <div key={a.agent} className="flex items-center gap-3 rounded-neo neo-inset-sm px-4 py-2.5">
                    <Bot className="h-4 w-4 shrink-0 text-ink-2" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink capitalize">{a.agent}</span>
                        <span className="text-[0.65rem] tabular text-ink-3">{a.total} calls · ${a.total_cost.toFixed(3)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-sunken overflow-hidden">
                        <div
                          className="h-full rounded-full bg-positive transition-all"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[0.6rem] text-ink-3">
                        <span>{a.succeeded} ok · {a.failed} failed</span>
                        <span>{rate.toFixed(0)}% success</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Connected services */}
        <Panel title="Connected services" id="services">
          {services.length === 0 ? (
            <EmptyState title="No services connected" body="Configure providers in Settings." icon={<Zap className="h-5 w-5" />} />
          ) : (
            <ul className="flex flex-col gap-2">
              {services.map((x) => (
                <li key={x.name} className="flex flex-wrap items-center gap-3 rounded-neo neo-inset-sm px-4 py-2.5 text-sm">
                  <span className="flex-1 font-medium text-ink">{x.name}</span>
                  <span className="text-xs text-ink-3">{x.detail}</span>
                  <StatusBadge status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Jobs table */}
      <Panel title="Recent jobs" className="mb-6" id="jobs">
        {jobsArr.length === 0 ? (
          <EmptyState title="No jobs yet" body="Background processing hasn't started." icon={<Clock className="h-5 w-5" />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th className="text-right">Attempts</Th>
                <Th>Error</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {jobsArr.map((j) => (
                <Tr key={j.id}>
                  <Td className="font-mono text-xs">{j.type}</Td>
                  <Td>
                    <StatusBadge
                      status={
                        j.status === "succeeded" ? "approved"
                        : j.status === "queued" || j.status === "running" ? "pending"
                        : "failed"
                      }
                      label={j.status}
                    />
                  </Td>
                  <Td className="tabular text-right text-xs">{j.attempts}/{j.max_attempts}</Td>
                  <Td className="max-w-xs truncate text-xs text-oxblood" title={j.last_error ?? ""}>{j.last_error}</Td>
                  <Td className="text-xs text-ink-3">{new Date(j.updated_at).toLocaleString("en-GB")}</Td>
                  <Td>
                    {["failed", "dead_letter"].includes(j.status) && <RetryJobBtn id={j.id} />}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {/* Errors & events */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="System errors" id="errors">
          {(errors ?? []).length === 0 ? (
            <p className="text-sm text-ink-3">No errors recorded.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-xs">
              {(errors ?? []).map((e) => (
                <li key={e.id} className="rounded-neo neo-inset-sm p-2.5">
                  <span className="font-mono text-ink-2">{e.source}</span>
                  <span className="text-ink-3"> · {new Date(e.created_at).toLocaleString("en-GB")}</span>
                  <p className="mt-1 text-oxblood">{e.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Integration events" id="events">
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-ink-3">No events yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex gap-2">
                  <StatusBadge status={e.status === "ok" ? "approved" : e.status === "warning" ? "pending" : "failed"} label={e.status} />
                  <span className="text-ink">{e.integration} · {e.event}</span>
                  <span className="ml-auto text-ink-3">{new Date(e.created_at).toLocaleString("en-GB")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}) {
  const toneText = { neutral: "text-ink", positive: "text-positive", warning: "text-warning", critical: "text-oxblood" }[tone];
  return (
    <div className="rounded-neo-lg neo-raised p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-ink-3" />
        <p className="text-xs text-ink-3">{label}</p>
      </div>
      <p className={`tabular text-2xl font-semibold ${toneText}`}>{value}</p>
    </div>
  );
}
