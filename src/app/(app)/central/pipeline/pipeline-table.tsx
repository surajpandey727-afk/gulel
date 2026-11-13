"use client";

import { useState } from "react";
import { cn } from "@/components/neo/cn";

type Opp = {
  id: string; name: string; stage: string; market: string; currency: string;
  value_amount: number | null; track: string | null; lead_source: string | null;
  next_action: string | null; next_action_due: string | null; last_touch_at: string | null;
  discovery_notes: string | null; owner_user_id: string | null;
  organisations: { trading_name: string } | null;
  contacts: { full_name: string } | null;
};

const TRACK_LABELS: Record<string, string> = {
  direct_client: "Direct", studio_channel: "Studio", existing_account: "Existing",
};

const STAGE_COLORS: Record<string, string> = {
  identified: "bg-ink-3/10 text-ink-3", contacted: "bg-warning/10 text-warning",
  in_conversation: "bg-warning/10 text-warning", discovery: "bg-oxblood/10 text-oxblood",
  meeting: "bg-oxblood/10 text-oxblood", scoping: "bg-oxblood/10 text-oxblood",
  proposal: "bg-positive/10 text-positive", negotiation: "bg-positive/10 text-positive",
  won: "bg-positive/20 text-positive", lost: "bg-danger/10 text-danger",
  nurture: "bg-ink-3/10 text-ink-3", parked: "bg-ink-3/10 text-ink-3",
};

export function PipelineTable({ opps }: { opps: Opp[] }) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? opps : opps.filter((o) => o.stage === filter);
  const stages = [...new Set(opps.map((o) => o.stage))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        <button
          onClick={() => setFilter("all")}
          className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all", filter === "all" ? "neo-raised-sm text-oxblood" : "text-ink-3 hover:text-ink")}
        >
          All ({opps.length})
        </button>
        {stages.map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-all", filter === st ? "neo-raised-sm text-oxblood" : "text-ink-3 hover:text-ink")}
          >
            {st.replace(/_/g, " ")} ({opps.filter((o) => o.stage === st).length})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-neo neo-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3">
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Track</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Next action</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-hairline/50 transition-colors hover:bg-raised/50">
                <td className="px-4 py-3 font-medium text-ink">{o.organisations?.trading_name ?? "—"}</td>
                <td className="px-4 py-3 text-ink-2">{o.contacts?.full_name ?? "—"}</td>
                <td className="px-4 py-3">
                  {o.track ? (
                    <span className="inline-flex rounded-full bg-oxblood/8 px-2 py-0.5 text-xs font-medium text-oxblood">{TRACK_LABELS[o.track] ?? o.track}</span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", STAGE_COLORS[o.stage] ?? "bg-ink-3/10 text-ink-3")}>
                    {o.stage.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-2">{o.market}</td>
                <td className="px-4 py-3 text-right tabular font-medium text-ink">
                  {o.value_amount != null ? `${o.currency} ${o.value_amount.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3 text-ink-3">{o.lead_source ?? "—"}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-ink-2">{o.next_action ?? "—"}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-ink-3">{o.discovery_notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
