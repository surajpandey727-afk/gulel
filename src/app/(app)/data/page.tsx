import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { fmtDate } from "@/lib/filters";
import { EmptyState, PageHeader, Panel } from "@/components/neo/surface";
import { StatusBadge, Badge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { ImportWizard } from "./import-wizard";
import { RevertButton } from "./revert-button";

export const metadata = { title: "Data Centre" };

export default async function DataPage() {
  const s = await getSession();
  const supabase = await createClient();
  const ws = s.workspaceId;
  const [batches, unverified, generic, noContact, staleEv, failedJobs, proposed] = await Promise.all([
    supabase.from("import_batches").select("id, file_name, sheet_name, status, stats, created_at, committed_at, reverted_at, error").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(20),
    supabase.from("contact_channels").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("channel", "email").neq("verification_status", "verified"),
    supabase.from("contact_channels").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("email_quality", "role_generic"),
    supabase.from("organisations").select("id, trading_name, contact_organisations(count)").eq("workspace_id", ws).is("deleted_at", null).limit(500),
    supabase.from("evidence_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "active").lt("review_by", new Date().toISOString().slice(0, 10)),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("status", ["failed", "dead_letter"]),
    supabase.from("import_rows").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "error"),
  ]);
  const orgsWithoutPeople = (noContact.data ?? []).filter((o) => ((o.contact_organisations as unknown as Array<{ count: number }>)[0]?.count ?? 0) === 0);

  const queue = [
    { label: "Unverified emails", count: unverified.count ?? 0, action: "Verify from a credible source before use", href: "/people?filter=unverified" },
    { label: "Generic role inboxes", count: generic.count ?? 0, action: "Find a named decision-maker instead", href: "/people?filter=generic" },
    { label: "Organisations with no people", count: orgsWithoutPeople.length, action: "Identify the relevant buyer", href: "/organisations" },
    { label: "Evidence past its review date", count: staleEv.count ?? 0, action: "Refresh or supersede stale claims", href: "/organisations" },
    { label: "Failed import rows", count: proposed.count ?? 0, action: "Fix and re-import", href: "#history" },
    { label: "Failed background jobs", count: failedJobs.count ?? 0, action: "Retry or inspect in Settings → Operations", href: "/settings/operations" },
  ];

  return (
    <>
      <PageHeader title="Data Centre" description="Import, de-duplicate, enrich and keep intelligence trustworthy." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Import workbook" eyebrow="XLSX · CSV" className="xl:col-span-2"><ImportWizard /></Panel>
        <Panel title="Data quality queue" eyebrow="Every item has a corrective action">
          <ul className="flex flex-col gap-2">
            {queue.map((q) => (
              <li key={q.label}><Link href={q.href} className="flex items-center gap-3 rounded-neo neo-inset-sm px-3 py-2.5">
                <span className="tabular grid h-9 min-w-9 place-items-center rounded-full neo-raised-sm px-2 text-sm font-semibold text-oxblood">{q.count}</span>
                <span className="min-w-0"><span className="block text-sm font-medium">{q.label}</span><span className="block text-xs text-ink-3">{q.action}</span></span>
              </Link></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">Duplicate detection runs on every import preview. Missing financials and broken-URL checks arrive with Phase 2 enrichment.</p>
        </Panel>
        <Panel title="Import history" eyebrow="Batch lineage" className="xl:col-span-3" id="history">
          {batches.data?.length ? (
            <Table>
              <thead><tr><Th>File</Th><Th>Sheet</Th><Th>Status</Th><Th className="text-right">Rows</Th><Th className="text-right">New orgs</Th><Th className="text-right">Matched</Th><Th className="text-right">Errors</Th><Th>Date</Th><Th /></tr></thead>
              <tbody>{batches.data.map((b) => { const st = (b.stats ?? {}) as Record<string, number>; return (
                <Tr key={b.id}>
                  <Td className="font-medium text-ink">{b.file_name}{b.error && <span className="block text-xs text-warning">{b.error}</span>}</Td><Td>{b.sheet_name ?? "—"}</Td>
                  <Td><StatusBadge status={b.status === "committed" ? "approved" : b.status === "reverted" ? "invalidated" : "pending"} label={b.status} /></Td>
                  <Td className="tabular text-right">{st.rows ?? "—"}</Td><Td className="tabular text-right">{st.create_org ?? "—"}</Td><Td className="tabular text-right">{(st.merge_org ?? 0) + (st.propose_merge ?? 0)}</Td><Td className="tabular text-right">{st.errors ?? "—"}</Td>
                  <Td className="text-xs">{fmtDate(b.created_at)}</Td>
                  <Td>{b.status === "committed" ? <RevertButton batchId={b.id} /> : b.status === "reverted" ? <Badge tone="muted" icon={false}>reverted {fmtDate(b.reverted_at)}</Badge> : null}</Td>
                </Tr>); })}</tbody>
            </Table>
          ) : <EmptyState title="No imports yet" />}
        </Panel>
      </div>
    </>
  );
}
