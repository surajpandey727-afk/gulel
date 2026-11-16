import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckSquare, Handshake, Layers, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel, EmptyState } from "@/components/neo/surface";
import { ButtonLink } from "@/components/neo/button";
import { cn } from "@/components/neo/cn";
import { buildIndex, computeRow, entityName, rowIssues } from "@/lib/central/compute";
import { SHEETS } from "@/lib/central/schema";
import { loadStore } from "@/lib/central/store";
import { PALETTE, labelColor } from "@/components/central/palette";
import { repositoryProgress } from "@/lib/central/enrich";
import { QualifyPanel } from "./qualify-panel";

export const metadata = { title: "Central Repository" };
export const dynamic = "force-dynamic";

const CUR: Record<string, string> = { GBP: "£", INR: "₹", USD: "$", EUR: "€", AUD: "A$" };
const money = (cur: string, n: number) => `${CUR[cur] ?? `${cur} `}${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function CentralDashboard() {
  const s = await getSession();
  const db = await createClient();
  const store = await loadStore(db, s.workspaceId);
  if (!store.rows.length) {
    return (
      <Panel>
        <EmptyState title="The repository is empty" body="Import the central repository workbook and connect Google Sheets to start." icon={<Layers className="h-5 w-5" />}
          action={<ButtonLink href="/central/sync" variant="primary" size="sm">Go to Sync &amp; access</ButtonLink>} />
      </Panel>
    );
  }
  const idx = buildIndex(store);
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const rows = (n: string) => idx.bySheet.get(n) ?? [];
  const isOpenStage = (list: string, id: unknown) => idx.refs.get(list)?.get(String(id ?? ""))?.is_open !== false;

  const pipe = [...rows("Pipeline_India"), ...rows("Pipeline_Global")];
  const partners = [...rows("Partners_India"), ...rows("Partners_Global")];
  const openPipe = pipe.filter((r) => isOpenStage("Stage", r.data.stage_id));
  const openPartners = partners.filter((r) => isOpenStage("PStage", r.data.stage_id));
  const tasks = rows("Tasks");
  const openTasks = tasks.filter((r) => isOpenStage("TaskStatus", r.data.status_id));
  const overdueTasks = openTasks.filter((r) => r.data.due && String(r.data.due) < today);
  const projects = rows("Projects");
  const activeProjects = projects.filter((r) => r.data.status_id === "AC");

  const fin = new Map<string, { total: number; received: number; pending: number; expense: number }>();
  for (const f of rows("Finances")) {
    const all = computeRow(idx, f);
    const cur = String(f.data.currency_id ?? "—");
    const e = fin.get(cur) ?? { total: 0, received: 0, pending: 0, expense: 0 };
    if (f.data.status_id === "CX") continue;
    if (f.data.type_id === "RC") { e.total += Number(all.total) || 0; e.received += Number(f.data.received) || 0; e.pending += Number(all.pending) || 0; }
    else e.expense += Number(all.total) || 0;
    fin.set(cur, e);
  }

  const due = [
    ...pipe.filter((r) => isOpenStage("Stage", r.data.stage_id) && r.data.next_date && String(r.data.next_date) <= in7).map((r) => ({ r, date: String(r.data.next_date), what: String(r.data.next_action ?? "Next action"), kind: "Opportunity" })),
    ...partners.filter((r) => isOpenStage("PStage", r.data.stage_id) && r.data.next_date && String(r.data.next_date) <= in7).map((r) => ({ r, date: String(r.data.next_date), what: String(r.data.next_action ?? "Next action"), kind: "Partner" })),
    ...openTasks.filter((r) => r.data.due && String(r.data.due) <= in7).map((r) => ({ r, date: String(r.data.due), what: String(r.data.task ?? ""), kind: "Task" })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  const repoOrgs = rows("Organisations").filter((r) => String(r.data.archived ?? "").toUpperCase() !== "Y").length;
  const progress = { total: repoOrgs, ...(await repositoryProgress(s.workspaceId)) };
  const issues = SHEETS.map((d) => ({ sheet: d.name, n: rows(d.name).filter((r) => rowIssues(idx, r).length).length })).filter((x) => x.n);
  const stages = idx.refList.get("Stage") ?? [];
  const pstages = idx.refList.get("PStage") ?? [];
  const byStage = stages.map((st) => ({ st, india: rows("Pipeline_India").filter((r) => r.data.stage_id === st.item_id).length, global: rows("Pipeline_Global").filter((r) => r.data.stage_id === st.item_id).length }));
  const byPStage = pstages.map((st) => ({ st, n: partners.filter((r) => r.data.stage_id === st.item_id).length }));
  const maxStage = Math.max(1, ...byStage.map((x) => x.india + x.global));
  const maxP = Math.max(1, ...byPStage.map((x) => x.n));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi href="/central/board/Pipeline_India" icon={Layers} label="Open opportunities" value={openPipe.length} sub={`${rows("Pipeline_India").length} India · ${rows("Pipeline_Global").length} Global`} />
        <Kpi href="/central/board/Partners_India" icon={Handshake} label="Active partner talks" value={openPartners.length} sub={`${partners.length} partners in total`} />
        <Kpi href="/central/board/Projects" icon={Layers} label="Active projects" value={activeProjects.length} sub={`${projects.length} projects`} />
        <Kpi href="/central/board/Tasks" icon={CheckSquare} label="Open tasks" value={openTasks.length} sub={overdueTasks.length ? `${overdueTasks.length} overdue` : "none overdue"} tone={overdueTasks.length ? "danger" : undefined} />
        <Kpi href="/central/board/Finances" icon={Receipt} label="Pending receivables" value={[...fin].filter(([, v]) => v.pending).map(([c, v]) => money(c, v.pending)).join(" · ") || "—"} sub="excludes cancelled" />
        <Kpi href="/central/board/Pipeline_India" icon={AlertTriangle} label="Rows to fix" value={issues.reduce((a, b) => a + b.n, 0)} sub="fail the row check" tone={issues.length ? "warning" : undefined} />
      </div>

      <QualifyPanel p={progress} canWrite={s.role !== "viewer"} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Client pipeline by stage" eyebrow="India · Global" id="stages">
          <ul className="flex flex-col gap-2">
            {byStage.map(({ st, india, global }) => (
              <li key={st.item_id} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 truncate text-ink-2">{st.name}</span>
                <div className="flex h-5 flex-1 items-center gap-0.5">
                  {india > 0 && <div className={cn("h-full rounded-sm", PALETTE[labelColor(st)].bar)} style={{ width: `${(india / maxStage) * 100}%` }} title={`India: ${india}`} />}
                  {global > 0 && <div className={cn("h-full rounded-sm opacity-50", PALETTE[labelColor(st)].bar)} style={{ width: `${(global / maxStage) * 100}%` }} title={`Global: ${global}`} />}
                </div>
                <span className="w-16 shrink-0 text-right tabular text-ink-3">{india} · {global}</span>
                <span className="w-6 shrink-0 text-right font-medium tabular text-ink">{india + global}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.6875rem] text-ink-3">Solid bar India, faded bar Global.</p>
        </Panel>

        <Panel title="Partner pipeline by stage" eyebrow="Studios, agencies & freelancers" id="pstages">
          <ul className="flex flex-col gap-2">
            {byPStage.map(({ st, n }) => (
              <li key={st.item_id} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 truncate text-ink-2">{st.name}</span>
                <div className="flex h-5 flex-1 items-center">{n > 0 && <div className={cn("h-full rounded-sm", PALETTE[labelColor(st)].bar)} style={{ width: `${(n / maxP) * 100}%` }} />}</div>
                <span className="w-6 shrink-0 text-right font-medium tabular text-ink">{n}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Due in the next 7 days" eyebrow="Next actions & tasks" id="due">
          {due.length === 0 ? <p className="text-sm text-ink-3">Nothing due this week.</p> : (
            <ul className="flex flex-col gap-2">
              {due.map(({ r, date, what, kind }) => (
                <li key={`${r.id}-${kind}`}>
                  <Link href={`/central/board/${r.sheet}?q=${encodeURIComponent(r.row_key ?? "")}`} className="flex items-start gap-3 rounded-neo-sm neo-inset-sm px-3 py-2 text-sm hover:text-oxblood">
                    <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs tabular", date < today ? "font-medium text-danger" : "text-ink-2")}><CalendarClock className="h-3.5 w-3.5" aria-hidden />{fmt(date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{what}</span>
                      <span className="block truncate text-xs text-ink-3">{kind} · {kind === "Task" ? String(computeRow(idx, r).ref_name ?? "") : entityName(idx, r)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Finances" eyebrow="By currency" id="finances">
          {fin.size === 0 ? <p className="text-sm text-ink-3">No finance rows yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-hairline text-left text-[0.625rem] uppercase tracking-wider text-ink-3"><th className="py-2">Currency</th><th className="py-2 text-right">Receivable</th><th className="py-2 text-right">Received</th><th className="py-2 text-right">Pending</th><th className="py-2 text-right">Expenses</th></tr></thead>
              <tbody>
                {[...fin].map(([c, v]) => (
                  <tr key={c} className="border-b border-hairline/50">
                    <td className="py-2 font-medium">{c}</td>
                    <td className="py-2 text-right tabular">{money(c, v.total)}</td>
                    <td className="py-2 text-right tabular text-ink-2">{money(c, v.received)}</td>
                    <td className="py-2 text-right font-medium tabular">{money(c, v.pending)}</td>
                    <td className="py-2 text-right tabular text-ink-2">{money(c, v.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {issues.length > 0 && (
        <Panel title="Data quality" eyebrow="Row check" id="quality">
          <div className="flex flex-wrap gap-2">
            {issues.map((x) => (
              <Link key={x.sheet} href={`/central/board/${x.sheet}`} className="inline-flex items-center gap-2 rounded-full neo-raised-sm px-3 py-1.5 text-xs text-ink-2 hover:text-oxblood">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />{x.sheet.replace(/_/g, " ")}<span className="font-medium tabular text-ink">{x.n}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Kpi({ href, icon: Icon, label, value, sub, tone }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: string; tone?: "danger" | "warning" }) {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-neo neo-raised-sm p-4 transition-shadow hover:shadow-[var(--raise-md)]">
      <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-ink-3" aria-hidden /><span className="eyebrow">{label}</span></span>
      <span className="truncate text-xl font-semibold tabular text-ink">{value}</span>
      {sub && <span className={cn("text-xs", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink-3")}>{sub}</span>}
    </Link>
  );
}

