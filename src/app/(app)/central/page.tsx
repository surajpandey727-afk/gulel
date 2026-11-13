import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel, EmptyState } from "@/components/neo/surface";
import { Layers, FolderKanban, Receipt, Award, RefreshCw } from "lucide-react";
import { CentralDashboardCharts } from "./dashboard-charts";

export const metadata = { title: "Central Repository" };

export default async function CentralDashboardPage() {
  const s = await getSession();
  const supabase = await createClient();

  const [
    { data: opps },
    { data: projects },
    { data: finances },
    { data: credentials },
    { data: syncLogs },
  ] = await Promise.all([
    supabase.from("opportunities").select("id, stage, market, currency, value_amount, track").eq("workspace_id", s.workspaceId),
    supabase.from("projects").select("id, status, fee_amount, fee_currency").eq("workspace_id", s.workspaceId),
    supabase.from("finances").select("id, type, status, currency, total_amount, received_amount, pending_amount").eq("workspace_id", s.workspaceId),
    supabase.from("credentials").select("id, type, status").eq("workspace_id", s.workspaceId),
    supabase.from("sync_log").select("id, entity, direction, rows_synced, status, started_at").eq("workspace_id", s.workspaceId).order("started_at", { ascending: false }).limit(5),
  ]);

  const pipeline = opps ?? [];
  const proj = projects ?? [];
  const fin = finances ?? [];
  const creds = credentials ?? [];
  const logs = syncLogs ?? [];

  const openOpps = pipeline.filter((o) => !["won", "lost", "parked"].includes(o.stage));
  const wonOpps = pipeline.filter((o) => o.stage === "won");
  const totalPipelineValue = openOpps.reduce((s, o) => s + (o.value_amount ?? 0), 0);
  const activeProjects = proj.filter((p) => p.status === "active");
  const totalReceivable = fin.filter((f) => f.type === "receivable").reduce((s, f) => s + (f.total_amount ?? 0), 0);
  const totalReceived = fin.filter((f) => f.type === "receivable").reduce((s, f) => s + (f.received_amount ?? 0), 0);
  const totalPending = totalReceivable - totalReceived;
  const totalExpenses = fin.filter((f) => f.type === "expense").reduce((s, f) => s + (f.total_amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <KpiTile label="Open pipeline" value={openOpps.length} sub={`${formatCurrency(totalPipelineValue)} value`} icon={Layers} />
        <KpiTile label="Won" value={wonOpps.length} icon={Layers} />
        <KpiTile label="Active projects" value={activeProjects.length} icon={FolderKanban} />
        <KpiTile label="Receivable" value={formatCurrency(totalReceivable)} sub={`${formatCurrency(totalPending)} pending`} icon={Receipt} />
        <KpiTile label="Expenses" value={formatCurrency(totalExpenses)} icon={Receipt} />
        <KpiTile label="Credentials" value={creds.length} sub={`${creds.filter((c) => c.status === "permission_given").length} approved`} icon={Award} />
      </div>

      <CentralDashboardCharts pipeline={pipeline} projects={proj} finances={fin} />

      {/* Sync status */}
      <Panel title="Sync history" eyebrow="Google Sheet sync" id="sync">
        {logs.length === 0 ? (
          <EmptyState title="No sync runs yet" body="Connect your Google Sheet to start bidirectional synchronisation." icon={<RefreshCw className="h-5 w-5" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs font-medium uppercase tracking-wider text-ink-3">
                  <th className="pb-2 pr-4">Entity</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">Rows</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-hairline/50">
                    <td className="py-2 pr-4 font-medium capitalize">{log.entity}</td>
                    <td className="py-2 pr-4 text-ink-2">{log.direction === "sheet_to_gulel" ? "Sheet → gulel" : "gulel → Sheet"}</td>
                    <td className="py-2 pr-4 tabular">{log.rows_synced}</td>
                    <td className="py-2 pr-4"><SyncBadge status={log.status} /></td>
                    <td className="py-2 text-ink-3">{new Date(log.started_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function KpiTile({ label, value, sub, icon: Icon }: { label: string; value: React.ReactNode; sub?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col gap-1 rounded-neo neo-raised-sm p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-3" aria-hidden />
        <span className="eyebrow">{label}</span>
      </div>
      <span className="text-xl font-semibold tabular text-ink">{value}</span>
      {sub && <span className="text-xs text-ink-3">{sub}</span>}
    </div>
  );
}

function SyncBadge({ status }: { status: string }) {
  const cls = status === "completed" ? "bg-positive/10 text-positive" : status === "failed" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

function formatCurrency(n: number) {
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}
