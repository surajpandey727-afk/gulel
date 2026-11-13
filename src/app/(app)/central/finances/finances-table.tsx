"use client";

import { cn } from "@/components/neo/cn";

type Finance = {
  id: string; type: string; item: string; currency: string;
  quantity: number; unit_amount: number; total_amount: number;
  status: string; invoice_date: string | null;
  received_amount: number | null; received_date: string | null;
  pending_amount: number | null; notes: string | null;
  projects: { name: string; organisations: { trading_name: string } | null } | null;
};

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-warning/10 text-warning",
  invoiced: "bg-oxblood/10 text-oxblood",
  paid: "bg-positive/10 text-positive",
  unconfirmed: "bg-ink-3/10 text-ink-3",
  cancelled: "bg-danger/10 text-danger",
};

export function FinancesTable({ finances }: { finances: Finance[] }) {
  return (
    <div className="overflow-x-auto rounded-neo neo-raised">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3">
            <th className="px-4 py-3">Client / Project</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Unit</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3 text-right">Received</th>
            <th className="px-4 py-3 text-right">Pending</th>
            <th className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {finances.map((f) => (
            <tr key={f.id} className="border-b border-hairline/50 transition-colors hover:bg-raised/50">
              <td className="px-4 py-3">
                <div className="font-medium text-ink">{f.projects?.organisations?.trading_name ?? "—"}</div>
                {f.projects?.name && <div className="text-xs text-ink-3">{f.projects.name}</div>}
              </td>
              <td className="px-4 py-3">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", f.type === "receivable" ? "bg-positive/10 text-positive" : "bg-danger/10 text-danger")}>
                  {f.type}
                </span>
              </td>
              <td className="max-w-[200px] truncate px-4 py-3 text-ink-2">{f.item}</td>
              <td className="px-4 py-3 text-right tabular text-ink-2">{f.quantity}</td>
              <td className="px-4 py-3 text-right tabular text-ink">{f.currency} {f.unit_amount.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular font-medium text-ink">{f.currency} {f.total_amount.toLocaleString()}</td>
              <td className="px-4 py-3">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_COLORS[f.status] ?? "bg-ink-3/10 text-ink-3")}>
                  {f.status}
                </span>
              </td>
              <td className="px-4 py-3 tabular text-ink-2">{f.invoice_date ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular text-ink">{f.received_amount != null ? `${f.currency} ${f.received_amount.toLocaleString()}` : "—"}</td>
              <td className="px-4 py-3 text-right tabular font-medium text-ink">{f.pending_amount != null && f.pending_amount > 0 ? `${f.currency} ${f.pending_amount.toLocaleString()}` : "—"}</td>
              <td className="max-w-[160px] truncate px-4 py-3 text-ink-3">{f.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
