import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel, EmptyState } from "@/components/neo/surface";
import { Receipt } from "lucide-react";
import { FinancesTable } from "./finances-table";

export const metadata = { title: "Finances" };

export default async function CentralFinancesPage() {
  const s = await getSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("finances")
    .select("id, type, item, currency, quantity, unit_amount, total_amount, status, invoice_date, received_amount, received_date, pending_amount, notes, projects(name, organisations(trading_name))")
    .eq("workspace_id", s.workspaceId)
    .order("created_at", { ascending: false });

  const finances = (data ?? [] as unknown) as Array<{
    id: string; type: string; item: string; currency: string;
    quantity: number; unit_amount: number; total_amount: number;
    status: string; invoice_date: string | null;
    received_amount: number | null; received_date: string | null;
    pending_amount: number | null; notes: string | null;
    projects: { name: string; organisations: { trading_name: string } | null } | null;
  }>;

  if (finances.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No financial records"
          body="Track receivables and expenses per project. Import from the Central Repository sheet or add manually."
          icon={<Receipt className="h-5 w-5" />}
        />
      </Panel>
    );
  }

  const receivables = finances.filter((f) => f.type === "receivable");
  const expenses = finances.filter((f) => f.type === "expense");
  const totalReceivable = receivables.reduce((s, f) => s + (f.total_amount ?? 0), 0);
  const totalReceived = receivables.reduce((s, f) => s + (f.received_amount ?? 0), 0);
  const totalExpenses = expenses.reduce((s, f) => s + (f.total_amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="Total receivable" value={totalReceivable} />
        <SummaryTile label="Received" value={totalReceived} />
        <SummaryTile label="Pending" value={totalReceivable - totalReceived} />
        <SummaryTile label="Expenses" value={totalExpenses} />
      </div>
      <FinancesTable finances={finances} />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-neo neo-raised-sm p-4">
      <span className="eyebrow">{label}</span>
      <span className="text-lg font-semibold tabular text-ink">{value.toLocaleString()}</span>
    </div>
  );
}
