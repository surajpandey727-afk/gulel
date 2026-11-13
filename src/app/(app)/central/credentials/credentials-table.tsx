"use client";

import { cn } from "@/components/neo/cn";

type Credential = {
  id: string; name: string; type: string; sector: string | null;
  status: string; permission_notes: string | null;
  projects: { name: string } | null;
  organisations: { trading_name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  locked: "bg-warning/10 text-warning",
  received: "bg-positive/10 text-positive",
  permission_given: "bg-positive/20 text-positive",
  draft: "bg-ink-3/10 text-ink-3",
  retired: "bg-danger/10 text-danger",
};

export function CredentialsTable({ credentials }: { credentials: Credential[] }) {
  return (
    <div className="overflow-x-auto rounded-neo neo-raised">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3">
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Permission notes</th>
            <th className="px-4 py-3">Project</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map((c) => (
            <tr key={c.id} className="border-b border-hairline/50 transition-colors hover:bg-raised/50">
              <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-oxblood/8 px-2 py-0.5 text-xs font-medium capitalize text-oxblood">
                  {c.type.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-2">{c.organisations?.trading_name ?? "—"}</td>
              <td className="px-4 py-3 text-ink-2">{c.sector ?? "—"}</td>
              <td className="px-4 py-3">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_COLORS[c.status] ?? "bg-ink-3/10 text-ink-3")}>
                  {c.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="max-w-[240px] truncate px-4 py-3 text-ink-3">{c.permission_notes ?? "—"}</td>
              <td className="px-4 py-3 text-ink-2">{c.projects?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
