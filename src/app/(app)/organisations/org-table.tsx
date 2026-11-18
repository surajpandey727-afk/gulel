"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Archive, ArchiveRestore, Combine, ExternalLink, FileText, GripVertical, MoreHorizontal, RotateCcw, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/components/neo/cn";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { Button } from "@/components/neo/button";
import { Modal, Tip } from "@/components/neo/controls";
import { refreshSoon } from "@/components/orgs/refresh";
import { useRowDrag, type DropTarget } from "@/components/central/use-row-drag";
import { bulkOrgAction, orgDependentsAction, placeOrgAction, purgeOrgAction, type OrgLifecycle } from "./records-actions";
import type { OrgDependents } from "@/lib/orgs/records";
import { MergeDialog } from "./merge-dialog";
import { usePrefs } from "@/components/shell/prefs-provider";
import { ORG_COLUMNS, DEFAULT_PREFS, type OrgColumn } from "@/lib/prefs";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";

const RIGHT = new Set<OrgColumn>(["score", "coverage", "people"]);
const CELL_CLS: Record<OrgColumn, string> = {
  linkedin: "px-3", market: "px-3", sector: "max-w-40 truncate px-3 text-ink-2", score: "tabular px-3 text-right font-semibold text-ink",
  band: "px-3 text-ink-2", coverage: "tabular px-3 text-right text-ink-2", people: "tabular px-3 text-right text-ink-2",
  relationship: "px-3 capitalize text-ink-2", updated: "whitespace-nowrap px-3 text-xs text-ink-3",
};
function cell(k: OrgColumn, o: OrgListRow): React.ReactNode {
  switch (k) {
    case "linkedin": return o.linkedin ? <a href={o.linkedin} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-oxblood">Open<ExternalLink className="h-3 w-3" aria-hidden /></a> : <span className="text-xs text-ink-3">—</span>;
    case "market": return <MarketBadge market={o.market} />;
    case "sector": return o.sector ?? "—";
    case "score": return o.score ?? "—";
    case "band": return o.band ?? <span className="text-ink-3">Not qualified</span>;
    case "coverage": return o.coverage !== null ? `${o.coverage}%` : "—";
    case "people": return o.contacts;
    case "relationship": return o.relationship.replace(/_/g, " ");
    case "updated": return o.updated;
  }
}

/** Show, hide and reorder the list's columns, and set row density. Saved to your profile and applied at once. */
export function ColumnsMenu() {
  const { prefs, setPrefs } = usePrefs();
  const cols = prefs.orgColumns;
  const hidden = ORG_COLUMNS.filter((c) => !cols.includes(c.key));
  const move = (k: OrgColumn, d: -1 | 1) => { const i = cols.indexOf(k), j = i + d; if (j < 0 || j >= cols.length) return; const n = [...cols]; [n[i], n[j]] = [n[j], n[i]]; setPrefs({ orgColumns: n }, { quiet: true }); };
  return (
    <Popover.Root>
      <Tip content="Columns and density">
        <Popover.Trigger asChild>
          <button type="button" aria-label="Columns and density" className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-sunken/70 hover:text-oxblood data-[state=open]:text-oxblood"><Columns3 className="h-4 w-4" /></button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-64 rounded-neo bg-canvas p-2 normal-case tracking-normal neo-raised">
          <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">Columns · in order</p>
          <ul className="flex flex-col">
            {cols.map((k, i) => (
              <li key={k} className="flex items-center gap-2 rounded-neo-sm px-2 py-1 text-xs text-ink hover:bg-sunken/60">
                <input type="checkbox" checked disabled={cols.length === 1} onChange={() => setPrefs({ orgColumns: cols.filter((c) => c !== k) }, { quiet: true })} aria-label={`Hide ${k}`} className="accent-[var(--brand-oxblood)]" />
                <span className="flex-1">{ORG_COLUMNS.find((c) => c.key === k)!.label}</span>
                <button type="button" onClick={() => move(k, -1)} disabled={i === 0} aria-label="Move up" className="grid h-5 w-5 place-items-center rounded text-ink-3 hover:text-oxblood disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => move(k, 1)} disabled={i === cols.length - 1} aria-label="Move down" className="grid h-5 w-5 place-items-center rounded text-ink-3 hover:text-oxblood disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
              </li>
            ))}
            {hidden.map((c) => (
              <li key={c.key} className="flex items-center gap-2 rounded-neo-sm px-2 py-1 text-xs text-ink-3 hover:bg-sunken/60">
                <input type="checkbox" checked={false} onChange={() => setPrefs({ orgColumns: [...cols, c.key] }, { quiet: true })} aria-label={`Show ${c.label}`} className="accent-[var(--brand-oxblood)]" />{c.label}
              </li>
            ))}
          </ul>
          <div className="my-1.5 border-t border-hairline" />
          <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-3">Row density</p>
          <div className="flex gap-1 px-1">
            {(["comfortable", "compact"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setPrefs({ orgDensity: d }, { quiet: true })} className={cn("flex-1 rounded-full px-2 py-1 text-xs capitalize", prefs.orgDensity === d ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:bg-sunken/60")}>{d}</button>
            ))}
          </div>
          <div className="my-1.5 border-t border-hairline" />
          <button type="button" onClick={() => setPrefs({ orgColumns: DEFAULT_PREFS.orgColumns, orgDensity: DEFAULT_PREFS.orgDensity }, { quiet: true })} className="w-full rounded-neo-sm px-2 py-1.5 text-left text-xs text-oxblood hover:bg-sunken/60">Reset columns</button>
          <a href="/settings/preferences" className="block rounded-neo-sm px-2 py-1.5 text-xs text-ink-2 hover:bg-sunken/60">All preferences…</a>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface OrgListRow {
  id: string; name: string; crKey: string | null; isDemo: boolean; market: string | null; sector: string | null;
  score: number | null; band: string | null; coverage: number | null; contacts: number; relationship: string; updated: string;
  linkedin: string | null; priority: number | null; notes: number; files: number;
}

type View = "active" | "archived" | "deleted";

/**
 * The organisations list. In priority order you can drag a row (or focus its grip and use the arrow keys) to reprioritise;
 * the number column is the same priority the board and the Google Sheet use. Row menus and the selection bar handle
 * archive, delete, restore and permanent deletion, each with a confirmation that says what stays and what goes.
 */
export function OrgTable({ rows: initial, view, reorderable, canWrite, isOwner }: { rows: OrgListRow[]; view: View; reorderable: boolean; canWrite: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [view]);
  const [confirm, setConfirm] = useState<{ action: OrgLifecycle; ids: string[] } | null>(null);
  const [purge, setPurge] = useState<OrgListRow | null>(null);
  const [merging, setMerging] = useState(false);
  const { prefs } = usePrefs();
  const cols = prefs.orgColumns;
  const pad = prefs.orgDensity === "compact" ? "py-1.5" : "py-3";
  const tableRef = useRef<HTMLDivElement>(null);
  const [announce, setAnnounce] = useState("");

  const draggable = useMemo(() => rows.filter((r) => r.priority !== null).map((r) => r.id), [rows]);
  const onDrop = (t: DropTarget) => {
    const before = rows;
    // Optimistic: reorder now and renumber the visible priorities in their new order.
    const ranked = rows.filter((r) => r.priority !== null);
    const nums = ranked.map((r) => r.priority!).sort((a, b) => a - b);
    const moved = ranked.find((r) => r.id === t.id)!;
    const rest = ranked.filter((r) => r.id !== t.id);
    rest.splice(t.to, 0, moved);
    const next = [...rest.map((r, i) => ({ ...r, priority: nums[i] })), ...rows.filter((r) => r.priority === null)];
    setRows(next);
    setAnnounce(`${moved.name} moved to priority ${nums[t.to]}`);
    void placeOrgAction(t.id, t.afterId, t.beforeId).then((r) => {
      if (!r.ok) { setRows(before); toast.error(r.error); return; }
      refreshSoon(router);
    });
  };
  const drag = useRowDrag({ containerRef: tableRef, onDrop, enabled: reorderable && canWrite });

  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = [...selected];

  return (
    <>
      {canWrite && ids.length > 0 && (
        <div role="region" aria-label="Selection actions" className="sticky top-2 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-full bg-canvas px-3 py-2 neo-raised">
          <span className="px-1 text-xs font-medium text-ink">{ids.length} selected</span>
          <span className="h-4 w-px bg-hairline" aria-hidden />
          {view === "active" && <Button size="sm" onClick={() => setConfirm({ action: "archive", ids })}><Archive className="h-3.5 w-3.5" aria-hidden />Archive</Button>}
          {view === "archived" && <Button size="sm" onClick={() => setConfirm({ action: "reinstate", ids })}><ArchiveRestore className="h-3.5 w-3.5" aria-hidden />Reinstate</Button>}
          {view !== "deleted" && ids.length >= 2 && ids.length <= 6 && <Button size="sm" onClick={() => setMerging(true)}><Combine className="h-3.5 w-3.5" aria-hidden />Merge</Button>}
          {view !== "deleted" && <Button size="sm" variant="danger" onClick={() => setConfirm({ action: "delete", ids })}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</Button>}
          {view === "deleted" && <Button size="sm" onClick={() => setConfirm({ action: "restore", ids })}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Restore</Button>}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-sunken/70 hover:text-ink" aria-label="Clear selection"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div ref={tableRef} className="relative hidden overflow-x-auto rounded-neo neo-inset-sm md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {canWrite && <th className="w-9 py-2.5 pl-4"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="accent-[var(--brand-oxblood)]" /></th>}
              <th className="w-14 px-2 py-2.5 text-left text-[0.7rem] font-medium uppercase tracking-[0.06em] text-ink-3">
                <Tip content={reorderable ? "Priority: drag a row, or focus its grip and press the up or down arrow" : "Priority from the Central Repository. Sort by priority to reorder"}><span className="cursor-help">#</span></Tip>
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-[0.7rem] font-medium uppercase tracking-[0.06em] text-ink-3">Organisation</th>
              {cols.map((k) => (
                <th key={k} className={cn("whitespace-nowrap px-3 py-2.5 text-left text-[0.7rem] font-medium uppercase tracking-[0.06em] text-ink-3", RIGHT.has(k) && "text-right")}>{ORG_COLUMNS.find((c) => c.key === k)!.label}</th>
              ))}
              <th className="w-10 pr-2 text-right"><ColumnsMenu /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const canMove = reorderable && canWrite && o.priority !== null;
              return (
                <tr key={o.id} data-row-id={o.id} style={drag.rowStyle(o.id)} aria-selected={selected.has(o.id)}
                  className={cn("group border-t border-hairline/60 transition-colors hover:bg-raised/70", selected.has(o.id) && "bg-sunken/60", drag.dragging === o.id && "bg-raised")}>
                  {canWrite && <td className={cn(pad, "pl-4")}><input type="checkbox" checked={selected.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} aria-label={`Select ${o.name}`} className="accent-[var(--brand-oxblood)]" /></td>}
                  <td className={cn(pad, "px-2")}>
                    <span className="flex items-center gap-1">
                      {reorderable && canWrite && (
                        o.priority !== null ? (
                          <button type="button" {...drag.handleProps(o.id, draggable)} aria-label={`Priority ${o.priority}, ${o.name}. Drag, or press the up or down arrow, to reorder`}
                            className={cn("grid h-6 w-4 touch-none place-items-center rounded text-ink-3 opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood", canMove ? "cursor-grab active:cursor-grabbing" : "")}>
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                        ) : <span className="w-4" />
                      )}
                      {o.priority !== null
                        ? <span className="tabular min-w-5 text-right font-mono text-xs font-semibold text-ink-2">{o.priority}</span>
                        : <Tip content={o.crKey ? "Archived in the Central Repository" : "Not in the Central Repository yet, so no priority. Open it and add it to prioritise"}><span className="min-w-5 cursor-help text-right text-xs text-ink-3">–</span></Tip>}
                    </span>
                  </td>
                  <td className={cn(pad, "max-w-72 px-3")}>
                    <span className="flex items-center gap-2">
                      <Link href={`/organisations/${o.id}`} className="truncate font-medium text-ink hover:text-oxblood">{o.name}</Link>
                      {o.isDemo && <Badge tone="muted" icon={false}>demo</Badge>}
                      {o.crKey && <span className="font-mono text-[0.6875rem] text-ink-3">{o.crKey}</span>}
                      {o.notes > 0 && <Tip content={`${o.notes} note${o.notes > 1 ? "s" : ""}`}><span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-warning"><StickyNote className="h-3 w-3" aria-hidden />{o.notes}</span></Tip>}
                      {o.files > 0 && <Tip content={`${o.files} document${o.files > 1 ? "s" : ""}`}><span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-ink-3"><FileText className="h-3 w-3" aria-hidden />{o.files}</span></Tip>}
                    </span>
                  </td>
                  {cols.map((k) => <td key={k} className={cn(pad, CELL_CLS[k])}>{cell(k, o)}</td>)}
                  <td className="pr-3">{canWrite && <RowMenu o={o} view={view} isOwner={isOwner} onAction={(action) => setConfirm({ action, ids: [o.id] })} onPurge={() => setPurge(o)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {drag.indicatorTop !== null && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 z-40 h-0.5 bg-oxblood" style={{ top: drag.indicatorTop - 1 }}>
            <span className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full bg-oxblood" />
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((o) => (
          <li key={o.id} className="flex items-center gap-2">
            <Link href={`/organisations/${o.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-neo-lg neo-raised-sm p-4">
              <span className="tabular grid h-12 w-12 shrink-0 place-items-center rounded-full neo-inset-sm font-semibold text-oxblood">{o.score ?? "—"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.priority !== null && <span className="mr-1.5 font-mono text-xs text-ink-3">#{o.priority}</span>}{o.name}</span>
                <span className="block truncate text-xs text-ink-3">{o.sector ?? "Sector unknown"} · {o.contacts} people</span>
              </span>
              <MarketBadge market={o.market} />
            </Link>
            {canWrite && <RowMenu o={o} view={view} isOwner={isOwner} onAction={(action) => setConfirm({ action, ids: [o.id] })} onPurge={() => setPurge(o)} />}
          </li>
        ))}
      </ul>

      {confirm && <ConfirmLifecycle {...confirm} rows={rows} onClose={(changed) => { setConfirm(null); if (changed) { setSelected(new Set()); refreshSoon(router); } }} />}
      {merging && (
        <MergeDialog
          groups={[{ reason: "Selected organisations", orgs: rows.filter((o) => selected.has(o.id))
            .map((o) => ({ id: o.id, name: o.name, market: o.market, crKey: o.crKey, domain: null, contacts: o.contacts, notes: o.notes, files: o.files, evidence: 0, score: o.score, archived: view === "archived" }))
            .sort((a, b) => Number(!!b.crKey) - Number(!!a.crKey) || (b.contacts + b.notes + b.files) - (a.contacts + a.notes + a.files)) }]}
          onClose={(changed) => { setMerging(false); if (changed) setSelected(new Set()); }}
        />
      )}
      {purge && <PurgeDialog org={purge} onClose={(changed) => { setPurge(null); if (changed) refreshSoon(router); }} />}
    </>
  );
}

function RowMenu({ o, view, isOwner, onAction, onPurge }: { o: OrgListRow; view: View; isOwner: boolean; onAction: (a: OrgLifecycle) => void; onPurge: () => void }) {
  const item = "flex w-full cursor-pointer select-none items-center gap-2 rounded-neo-sm px-2.5 py-1.5 text-xs text-ink-2 outline-none data-[highlighted]:bg-sunken/70 data-[highlighted]:text-ink";
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" aria-label={`Actions for ${o.name}`} className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-sunken/70 hover:text-oxblood data-[state=open]:bg-sunken/70 data-[state=open]:text-oxblood"><MoreHorizontal className="h-4 w-4" /></button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-neo bg-canvas p-1.5 neo-raised">
          <Menu.Item asChild className={item}><Link href={`/organisations/${o.id}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden />Open dossier</Link></Menu.Item>
          <Menu.Separator className="my-1 h-px bg-hairline" />
          {view === "active" && <Menu.Item className={item} onSelect={() => onAction("archive")}><Archive className="h-3.5 w-3.5" aria-hidden />Archive</Menu.Item>}
          {view === "archived" && <Menu.Item className={item} onSelect={() => onAction("reinstate")}><ArchiveRestore className="h-3.5 w-3.5" aria-hidden />Reinstate</Menu.Item>}
          {view !== "deleted" && <Menu.Item className={cn(item, "text-oxblood data-[highlighted]:text-oxblood")} onSelect={() => onAction("delete")}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</Menu.Item>}
          {view === "deleted" && <Menu.Item className={item} onSelect={() => onAction("restore")}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Restore</Menu.Item>}
          {view === "deleted" && isOwner && <Menu.Item className={cn(item, "text-oxblood data-[highlighted]:text-oxblood")} onSelect={onPurge}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete permanently…</Menu.Item>}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

const COPY: Record<OrgLifecycle, { title: string; verb: string; body: string; danger?: boolean }> = {
  archive: { title: "Archive", verb: "Archive", body: "Archived organisations leave your working lists, the board's default view and the qualification queue. Everything stays attached and you can reinstate them any time from Archived." },
  reinstate: { title: "Reinstate", verb: "Reinstate", body: "Brings them back into your working lists and the board, with everything they had." },
  delete: { title: "Delete", verb: "Delete", danger: true, body: "Moves them to Deleted: out of gulel's lists, the Central Repository and the Google Sheet. Nothing is erased yet; restore from Deleted at any time. If pipeline or partner rows still point at one, it can't be deleted: archive it instead." },
  restore: { title: "Restore", verb: "Restore", body: "Puts them back in your working lists, the Central Repository and the Google Sheet." },
};

function ConfirmLifecycle({ action, ids, rows, onClose }: { action: OrgLifecycle; ids: string[]; rows: OrgListRow[]; onClose: (changed: boolean) => void }) {
  const [pending, start] = useTransition();
  const [deps, setDeps] = useState<OrgDependents | null>(null);
  const names = ids.map((id) => rows.find((r) => r.id === id)?.name ?? "Organisation");
  const c = COPY[action];
  useEffect(() => {
    if (ids.length !== 1 || (action !== "delete" && action !== "archive")) return;
    void orgDependentsAction(ids[0]).then((r) => { if (r.ok) setDeps(r.data); });
  }, [ids, action]);
  const go = () => start(async () => {
    const r = await bulkOrgAction(ids, action);
    if (!r.ok) return void toast.error(r.error);
    if (r.data.failed.length) toast.error(r.data.failed.slice(0, 3).map((f) => `${rows.find((x) => x.id === f.id)?.name ?? "One"}: ${f.error}`).join("\n"));
    if (r.data.done) toast.success(r.message);
    onClose(r.data.done > 0);
  });
  const blocked = action === "delete" && (deps?.repoRefs.length ?? 0) > 0;
  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose(false); }} title={`${c.title} ${ids.length === 1 ? names[0] : `${ids.length} organisations`}?`}
      footer={<>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        {blocked && <Button onClick={() => start(async () => { const r = await bulkOrgAction(ids, "archive"); if (r.ok && r.data.done) { toast.success(r.message); onClose(true); } else toast.error(r.ok ? r.data.failed[0]?.error ?? "Could not archive" : r.error); })}><Archive className="h-3.5 w-3.5" aria-hidden />Archive instead</Button>}
        <Button variant={c.danger ? "danger" : "primary"} loading={pending} disabled={blocked} onClick={go}>{c.verb}</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        <p>{c.body}</p>
        {ids.length > 1 && <p className="text-xs text-ink-3">{names.slice(0, 6).join(", ")}{names.length > 6 ? ` and ${names.length - 6} more` : ""}</p>}
        {deps && (
          <div className="rounded-neo neo-inset-sm p-3 text-xs">
            <p className="eyebrow mb-1.5">Attached to {names[0]}</p>
            <p>{[`${deps.contacts} people`, `${deps.notes} notes`, `${deps.files} documents`, `${deps.evidence} research items`, `${deps.qualifications} qualifications`, `${deps.drafts} drafts`].join(" · ")}</p>
            <p className="mt-1 text-ink-3">{action === "archive" ? "All of it stays attached." : "All of it stays attached and comes back on restore."}</p>
            {deps.repoRefs.length > 0 && (
              <p className="mt-2 text-oxblood">Referenced by {deps.repoRefs.length} Central Repository row{deps.repoRefs.length > 1 ? "s" : ""}: {deps.repoRefs.slice(0, 5).map((r) => `${r.sheet.replace(/_/g, " ")} ${r.key ?? ""}`).join(", ")}{deps.repoRefs.length > 5 ? "…" : ""}.{action === "delete" ? " Archive it, or change those rows first." : ""}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function PurgeDialog({ org, onClose }: { org: OrgListRow; onClose: (changed: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const [deps, setDeps] = useState<OrgDependents | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { void orgDependentsAction(org.id).then((r) => { if (r.ok) setDeps(r.data); }); }, [org.id]);
  const ok = typed.trim().toLowerCase() === org.name.trim().toLowerCase();
  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose(false); }} title={`Delete ${org.name} permanently?`} description="This can't be undone."
      footer={<><Button onClick={() => onClose(false)}>Keep it in Deleted</Button><Button variant="danger" disabled={!ok} loading={pending} onClick={() => start(async () => {
        const r = await purgeOrgAction(org.id, typed);
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.message);
        onClose(true);
      })}>Delete permanently</Button></>}>
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        {deps ? (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-neo neo-inset-sm p-3"><p className="eyebrow mb-1 text-oxblood">Erased</p><p>{deps.notes} notes · {deps.files} documents · {deps.evidence} research items · {deps.qualifications} qualifications</p></div>
            <div className="rounded-neo neo-inset-sm p-3"><p className="eyebrow mb-1">Kept, unlinked</p><p>{deps.contacts} people · {deps.drafts} drafts · {deps.conversations} conversations</p></div>
          </div>
        ) : <p className="text-xs text-ink-3">Checking what is attached…</p>}
        {deps && deps.repoRefs.length > 0 && <p className="text-xs text-oxblood">Blocked: {deps.repoRefs.length} Central Repository row(s) still point at it.</p>}
        <p className="text-xs text-ink-3">The audit log keeps a record that it existed and what was removed. To keep everything, restore it instead.</p>
        <label className="flex flex-col gap-1 text-xs">
          <span>Type <span className="font-semibold text-ink">{org.name}</span> to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="h-10 rounded-full px-4 text-sm text-ink outline-none neo-inset-sm focus-visible:ring-2 focus-visible:ring-oxblood/30" />
        </label>
      </div>
    </Modal>
  );
}
