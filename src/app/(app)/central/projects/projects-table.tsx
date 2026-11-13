"use client";

import { cn } from "@/components/neo/cn";

type Project = {
  id: string; name: string; scope: string | null; region: string | null;
  status: string; start_date: string | null; end_date: string | null;
  fee_amount: number | null; fee_currency: string | null;
  has_nda: boolean; has_testimonial: boolean; notes: string | null;
  owner_user_id: string | null;
  organisations: { trading_name: string } | null;
  opportunities: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-warning/10 text-warning",
  active: "bg-positive/10 text-positive",
  completed: "bg-oxblood/10 text-oxblood",
  cancelled: "bg-danger/10 text-danger",
  on_hold: "bg-ink-3/10 text-ink-3",
};

export function ProjectsTable({ projects }: { projects: Project[] }) {
  return (
    <div className="overflow-x-auto rounded-neo neo-raised">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3">
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Scope</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Region</th>
            <th className="px-4 py-3">Start</th>
            <th className="px-4 py-3">End</th>
            <th className="px-4 py-3 text-right">Fee</th>
            <th className="px-4 py-3 text-center">NDA</th>
            <th className="px-4 py-3 text-center">Testimonial</th>
            <th className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-hairline/50 transition-colors hover:bg-raised/50">
              <td className="px-4 py-3 font-medium text-ink">{p.organisations?.trading_name ?? "—"}</td>
              <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
              <td className="max-w-[240px] truncate px-4 py-3 text-ink-2">{p.scope ?? "—"}</td>
              <td className="px-4 py-3">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_COLORS[p.status] ?? "bg-ink-3/10 text-ink-3")}>
                  {p.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-2">{p.region ?? "—"}</td>
              <td className="px-4 py-3 tabular text-ink-2">{p.start_date ?? "—"}</td>
              <td className="px-4 py-3 tabular text-ink-2">{p.end_date ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular font-medium text-ink">
                {p.fee_amount != null ? `${p.fee_currency ?? ""} ${p.fee_amount.toLocaleString()}` : "—"}
              </td>
              <td className="px-4 py-3 text-center">{p.has_nda ? <Check /> : <Dash />}</td>
              <td className="px-4 py-3 text-center">{p.has_testimonial ? <Check /> : <Dash />}</td>
              <td className="max-w-[200px] truncate px-4 py-3 text-ink-3">{p.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Check() {
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-positive/10 text-xs text-positive">✓</span>;
}

function Dash() {
  return <span className="text-ink-3">—</span>;
}
