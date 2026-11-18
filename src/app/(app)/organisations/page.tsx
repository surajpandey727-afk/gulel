import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/components/neo/cn";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { resolveFilters, type SearchParams, relTime } from "@/lib/filters";
import { BAND_LABEL } from "@/lib/scoring/model";
import { priorityNumbers } from "@/lib/central/order";
import type { Row } from "@/lib/central/types";
import { EmptyState } from "@/components/neo/surface";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { GlobalFilters } from "@/components/shell/filters";
import { SearchBox } from "@/components/shell/search-box";
import { ButtonLink } from "@/components/neo/button";
import { NewOrganisationButton } from "./new-organisation";
import { BulkDiscoverButton } from "./bulk-discover";
import { EnrichAllButton } from "./enrich-all";
import { OrgTable, type OrgListRow } from "./org-table";
import { loadPrefs } from "@/lib/prefs-server";
import { DuplicatesButton } from "./merge-dialog";

export const metadata = { title: "Organisations" };

const SORTS = [
  { value: "priority", label: "Priority" },
  { value: "updated", label: "Recently updated" },
  { value: "score", label: "Score" },
  { value: "name", label: "Name" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

export default async function OrganisationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const f = await resolveFilters(Promise.resolve(sp));
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const view = sp.view === "archived" || sp.view === "deleted" ? sp.view : "active";
  const session = await getSession();
  const prefs = await loadPrefs(session.userId);
  const sort: Sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as Sort) : prefs.orgSort;
  const supabase = await createClient();
  const ws = session.workspaceId;

  let query = supabase
    .from("organisations")
    .select("id, trading_name, primary_market, sector, relationship_status, updated_at, is_demo, needs, cr_key, archived_at, lead_qualifications(score, override_score, band, coverage, is_current), contact_organisations(count), notes(count), organisation_files(count), contact_channels(channel, value, contact_id)")
    .eq("workspace_id", ws)
    .is("notes.deleted_at", null).is("notes.archived_at", null).is("organisation_files.deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (view === "deleted") query = query.not("deleted_at", "is", null);
  else {
    query = query.is("deleted_at", null);
    query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  }
  if (f.market) query = query.eq("primary_market", f.market);
  if (q) query = query.ilike("trading_name", `%${q}%`);

  const count = (fn: (b: ReturnType<typeof base>) => ReturnType<typeof base>) => fn(base()).then((r) => r.count ?? 0);
  const base = () => {
    let b = supabase.from("organisations").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    if (f.market) b = b.eq("primary_market", f.market);
    return b;
  };
  const [{ data: orgs }, { data: repo }, nActive, nArchived, nDeleted] = await Promise.all([
    query,
    supabase.from("cr_rows").select("id, sheet, row_key, position, data->>archived").eq("workspace_id", ws).eq("sheet", "Organisations").is("deleted_at", null).limit(5000),
    count((b) => b.is("deleted_at", null).is("archived_at", null)),
    count((b) => b.is("deleted_at", null).not("archived_at", "is", null)),
    count((b) => b.not("deleted_at", "is", null)),
  ]);

  // Priority = row order of the Central Repository's Organisations sheet (archived rows carry no number).
  const repoRows = (repo ?? []).map((r) => ({ id: r.id, sheet: r.sheet, row_key: r.row_key, position: r.position, data: { archived: (r as { archived?: string | null }).archived ?? null }, color: null })) as Row[];
  const prioById = priorityNumbers(repoRows, "Organisations", (r) => String(r.data.archived ?? "").toUpperCase() === "Y");
  const prioByKey = new Map(repoRows.map((r) => [r.row_key, prioById.get(r.id) ?? null]));

  const rows: OrgListRow[] = (orgs ?? []).map((o) => {
    const cur = (o.lead_qualifications as Array<{ score: number; override_score: number | null; band: string; coverage: number; is_current: boolean }>).find((x) => x.is_current);
    const linkedin = (o.contact_channels as Array<{ channel: string; value: string; contact_id: string | null }>).find((c) => c.channel === "linkedin" && !c.contact_id)?.value ?? null;
    const n = (x: unknown) => (x as Array<{ count: number }>)[0]?.count ?? 0;
    return {
      id: o.id, name: o.trading_name, crKey: o.cr_key, isDemo: o.is_demo, market: o.primary_market, sector: o.sector,
      score: cur ? Math.round(Number(cur.override_score ?? cur.score)) : null, band: cur ? BAND_LABEL[cur.band] : null,
      coverage: cur ? Math.round(Number(cur.coverage) * 100) : null, contacts: n(o.contact_organisations), relationship: o.relationship_status,
      updated: relTime(o.updated_at), updatedAt: o.updated_at, linkedin, priority: view === "deleted" ? null : (o.cr_key ? prioByKey.get(o.cr_key) ?? null : null),
      notes: n(o.notes), files: n(o.organisation_files),
    } as OrgListRow & { updatedAt: string };
  });
  const by: Record<Sort, (a: OrgListRow & { updatedAt: string }, b: OrgListRow & { updatedAt: string }) => number> = {
    priority: (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.name.localeCompare(b.name),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  (rows as Array<OrgListRow & { updatedAt: string }>).sort(by[sort]);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
    for (const [k, v] of Object.entries(patch)) { if (v === null) p.delete(k); else p.set(k, v); }
    const s = p.toString();
    return s ? `/organisations?${s}` : "/organisations";
  };
  const counts = { active: nActive, archived: nArchived, deleted: nDeleted };

  return (
    <>
      <AnimatedPageHeader title="Organisations" description="One canonical record per company, with a profile per market."
        actions={<><GlobalFilters showRange={false} />{session.role !== "viewer" && <DuplicatesButton />}<EnrichAllButton /><BulkDiscoverButton /><NewOrganisationButton /></>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search organisations…" />
        <nav aria-label="Organisation status" className="flex items-center gap-1 rounded-full neo-inset-sm p-1">
          {(["active", "archived", "deleted"] as const).map((v) => (
            <Link key={v} href={href({ view: v === "active" ? null : v })} aria-current={view === v ? "page" : undefined}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize transition-shadow", view === v ? "neo-raised-sm text-ink" : "text-ink-3 hover:text-ink")}>
              {v === "active" ? "Working" : v}
              <span className={cn("tabular rounded-full px-1.5 text-[0.625rem]", view === v ? "bg-oxblood/10 text-oxblood" : "bg-ink-3/10 text-ink-3")}>{counts[v]}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort organisations" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full neo-inset-sm p-1 [scrollbar-width:none]">
          <span className="pl-2 pr-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">Sort</span>
          {SORTS.map((s) => (
            <Link key={s.value} href={href({ sort: s.value === prefs.orgSort ? null : s.value })} aria-current={sort === s.value ? "true" : undefined}
              className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-shadow", sort === s.value ? "neo-raised-sm text-ink" : "text-ink-3 hover:text-ink")}>{s.label}</Link>
          ))}
        </nav>
        <span className="text-xs text-ink-3">{rows.length} shown{sort === "priority" && view === "active" && session.role !== "viewer" ? " · drag to reprioritise" : ""}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Building2 className="h-5 w-5" />} title={q ? "No matches" : view === "archived" ? "Nothing archived" : view === "deleted" ? "Nothing deleted" : "No organisations yet"}
          body={q ? "Try a shorter name, or clear the market filter." : view === "archived" ? "Archive an organisation to take it out of your working lists without losing anything." : view === "deleted" ? "Deleted organisations wait here until you restore or permanently delete them." : "Import your workbook of UK and India companies, or add one manually."}
          action={view === "active" && !q ? <div className="flex gap-2"><ButtonLink href="/data" variant="primary" size="sm">Import workbook</ButtonLink><NewOrganisationButton small /></div> : undefined} />
      ) : (
        <OrgTable rows={rows} view={view} reorderable={sort === "priority" && view === "active"} canWrite={session.role !== "viewer"} isOwner={session.role === "owner"} />
      )}
    </>
  );
}
