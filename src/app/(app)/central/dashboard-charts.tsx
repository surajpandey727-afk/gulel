"use client";

import { Panel } from "@/components/neo/surface";

type Opp = { id: string; stage: string; market: string; currency: string; value_amount: number | null; track: string | null };
type Project = { id: string; status: string; fee_amount: number | null; fee_currency: string | null };
type Finance = { id: string; type: string; status: string; currency: string; total_amount: number | null; received_amount: number | null; pending_amount: number | null };

const STAGE_ORDER = ["identified", "contacted", "in_conversation", "discovery", "meeting", "scoping", "proposal", "negotiation", "won", "lost", "nurture", "parked"];
const STAGE_LABELS: Record<string, string> = {
  identified: "Identified", contacted: "Contacted", in_conversation: "In conversation", discovery: "Discovery",
  meeting: "Meeting", scoping: "Scoping", proposal: "Proposal", negotiation: "Negotiation",
  won: "Won", lost: "Lost", nurture: "Nurture", parked: "Parked",
};

export function CentralDashboardCharts({ pipeline, projects: _projects, finances }: { pipeline: Opp[]; projects: Project[]; finances: Finance[] }) {
  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage] ?? stage,
    count: pipeline.filter((o) => o.stage === stage).length,
  })).filter((s) => s.count > 0);

  const maxCount = Math.max(...byStage.map((s) => s.count), 1);

  const byTrack = [
    { key: "direct_client", label: "Direct client", count: pipeline.filter((o) => o.track === "direct_client").length },
    { key: "studio_channel", label: "Studio channel", count: pipeline.filter((o) => o.track === "studio_channel").length },
    { key: "existing_account", label: "Existing account", count: pipeline.filter((o) => o.track === "existing_account").length },
    { key: "unset", label: "Not set", count: pipeline.filter((o) => !o.track).length },
  ].filter((t) => t.count > 0);

  const byRegion = [
    { key: "UK", count: pipeline.filter((o) => o.market === "UK").length },
    { key: "IN", count: pipeline.filter((o) => o.market === "IN").length },
    { key: "Global", count: pipeline.filter((o) => o.market === "Global").length },
  ].filter((r) => r.count > 0);

  const finByStatus = [
    { key: "proposed", label: "Proposed", count: finances.filter((f) => f.status === "proposed").length },
    { key: "invoiced", label: "Invoiced", count: finances.filter((f) => f.status === "invoiced").length },
    { key: "paid", label: "Paid", count: finances.filter((f) => f.status === "paid").length },
  ].filter((s) => s.count > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Pipeline by stage" eyebrow="Funnel" id="funnel">
        <div className="flex flex-col gap-2">
          {byStage.map((s) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-ink-2">{s.label}</span>
              <div className="flex h-5 flex-1 items-center">
                <div
                  className="h-full rounded-sm bg-oxblood/80 transition-all"
                  style={{ width: `${(s.count / maxCount) * 100}%`, minWidth: "4px" }}
                />
              </div>
              <span className="w-6 text-right text-xs font-medium tabular text-ink">{s.count}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Pipeline by track" eyebrow="Segmentation" id="track">
        <div className="flex flex-col gap-3">
          {byTrack.map((t) => (
            <div key={t.key} className="flex items-center justify-between rounded-neo-sm neo-inset-sm px-4 py-2.5">
              <span className="text-sm font-medium text-ink">{t.label}</span>
              <span className="text-lg font-semibold tabular text-oxblood">{t.count}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Pipeline by region" eyebrow="Geography" id="region">
        <div className="flex gap-4">
          {byRegion.map((r) => (
            <div key={r.key} className="flex flex-1 flex-col items-center gap-1 rounded-neo-sm neo-inset-sm py-4">
              <span className="text-2xl font-bold tabular text-ink">{r.count}</span>
              <span className="text-xs text-ink-3">{r.key}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Finance summary" eyebrow="Status" id="finance-summary">
        {finByStatus.length === 0 ? (
          <p className="text-sm text-ink-3">No financial records yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {finByStatus.map((s) => (
              <div key={s.key} className="flex items-center justify-between rounded-neo-sm neo-inset-sm px-4 py-2.5">
                <span className="text-sm font-medium capitalize text-ink">{s.label}</span>
                <span className="text-lg font-semibold tabular text-oxblood">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
