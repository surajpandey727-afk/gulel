import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { cn } from "@/components/neo/cn";
import { SHEETS } from "@/lib/central/schema";
import { loadStore } from "@/lib/central/store";
import { getLinkState, linkProps } from "@/lib/central/link";
import { syncNow } from "@/lib/central/sync";
import { Board } from "@/components/central/board";

export const dynamic = "force-dynamic";

const TAB_GROUPS: { label: string; sheets: { name: string; label: string }[] }[] = [
  { label: "Pipeline", sheets: [{ name: "Pipeline_India", label: "India" }, { name: "Pipeline_Global", label: "Global" }] },
  { label: "Partners", sheets: [{ name: "Partners_India", label: "India" }, { name: "Partners_Global", label: "Global" }] },
  { label: "Delivery", sheets: [{ name: "Projects", label: "Projects" }, { name: "ProjectServices", label: "Services" }, { name: "Finances", label: "Finances" }, { name: "Credentials", label: "Credentials" }] },
  { label: "People", sheets: [{ name: "Organisations", label: "Organisations" }, { name: "Contacts", label: "Contacts" }, { name: "Freelancers", label: "Freelancers" }] },
  { label: "Activity", sheets: [{ name: "Interactions", label: "Interactions" }, { name: "Tasks", label: "Tasks" }] },
];

export async function generateMetadata({ params }: { params: Promise<{ sheet: string }> }) {
  const { sheet } = await params;
  return { title: sheet.replace(/_/g, " ") };
}

export default async function BoardPage({ params, searchParams }: { params: Promise<{ sheet: string }>; searchParams: Promise<{ q?: string }> }) {
  const { sheet } = await params;
  const { q } = await searchParams;
  if (!SHEETS.some((s) => s.name === sheet)) notFound();
  const s = await getSession();
  const db = await createClient();
  const [store, link] = await Promise.all([loadStore(db, s.workspaceId), getLinkState(db, s.workspaceId)]);
  const counts = new Map<string, number>();
  for (const r of store.rows) counts.set(r.sheet, (counts.get(r.sheet) ?? 0) + 1);

  // Opening a board pulls fresh sheet edits in the background when the last sync is older than 2 minutes.
  const last = [link?.last_pull_at, link?.last_push_at].filter(Boolean).sort().at(-1);
  if (link?.spreadsheet_id && link.auto_push && s.role !== "viewer" && (!last || Date.now() - Date.parse(last) > 120_000)) {
    after(() => syncNow(s.workspaceId, s.userId).catch(() => {}));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav aria-label="Sheets" className="flex gap-x-5 gap-y-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {TAB_GROUPS.map((g) => (
          <div key={g.label} className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3">{g.label}</span>
            {g.sheets.map((t) => {
              const active = t.name === sheet;
              return (
                <Link key={t.name} href={`/central/board/${t.name}`} aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all", active ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:text-ink")}>
                  {t.label}<span className={cn("tabular text-[0.625rem]", active ? "text-oxblood/70" : "text-ink-3")}>{counts.get(t.name) ?? 0}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Board key={sheet} sheet={sheet} initial={store} canWrite={s.role !== "viewer"} link={linkProps(link)} initialQuery={q ?? ""} />
    </div>
  );
}
