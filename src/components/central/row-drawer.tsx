"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Copy, History, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Drawer } from "@/components/neo/controls";
import { Input, Select, Textarea } from "@/components/neo/field";
import { cn } from "@/components/neo/cn";
import { SHEETS } from "@/lib/central/schema";
import { computeRow, displayValue, entityName, rowIssues, type Index } from "@/lib/central/compute";
import type { CellValue, ColumnDef, Row, SheetDef, Store } from "@/lib/central/types";
import { rowHistoryAction } from "@/app/(app)/central/actions";
import { CellView, optionsFor } from "./cells";
import { OrgContextPanel } from "./org-context";

const VIA: Record<string, string> = { ui: "gulel", agent: "Munshi", sheet: "Google Sheet", api: "API", import: "Import" };

export function RowDrawer({ open, onOpenChange, rowId, store, idx, def, canWrite, onSet, onDelete, onDuplicate }: {
  open: boolean; onOpenChange: (o: boolean) => void; rowId: string | null; store: Store; idx: Index; def: SheetDef; canWrite: boolean;
  onSet: (row: Row, key: string, v: CellValue) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void;
}) {
  const row = rowId ? store.rows.find((r) => r.id === rowId) ?? null : null;
  const [history, setHistory] = useState<Awaited<ReturnType<typeof rowHistoryAction>> | null>(null);
  useEffect(() => { setHistory(null); if (open && rowId) void rowHistoryAction(rowId).then(setHistory); }, [open, rowId, row?.updated_at]);
  if (!row) return <Drawer open={open} onOpenChange={onOpenChange} title="Item"><p className="text-sm text-ink-3">This row no longer exists.</p></Drawer>;

  const all = computeRow(idx, row);
  const issues = rowIssues(idx, row);
  const title = entityName(idx, row) || row.row_key || "Item";
  const related = relatedRows(idx, row);
  const orgKey = row.sheet === "Organisations" ? row.row_key : typeof row.data.org_id === "string" && /^ORG-/.test(row.data.org_id) ? row.data.org_id : null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <span className="font-mono">{row.row_key ?? "no ID"}</span><span>·</span><span>{def.name.replace(/_/g, " ")}</span>
          {canWrite && (
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" onClick={() => onDuplicate(row.id)}><Copy className="h-3.5 w-3.5" aria-hidden />Duplicate</Button>
              <Button size="sm" variant="danger" onClick={() => onDelete(row.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</Button>
            </span>
          )}
        </div>

        {issues.length > 0 && (
          <div className="rounded-neo-sm bg-warning/10 px-3 py-2.5 text-xs text-warning">
            <div className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />Row check</div>
            <ul className="list-disc pl-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        )}

        {orgKey && (
          <section className="rounded-neo neo-raised-sm p-4">
            <OrgContextPanel orgKey={orgKey} canWrite={canWrite} />
          </section>
        )}

        <section className="flex flex-col gap-3">
          {def.columns.filter((c) => c.type !== "formula").map((c) => (
            <FieldEditor key={`${row.id}:${c.key}:${String(row.data[c.key] ?? "")}`} c={c} row={row} idx={idx} disabled={!canWrite} onSet={(v) => onSet(row, c.key, v)} invalid={issues.some((i) => i.endsWith(c.header))} />
          ))}
        </section>

        <section>
          <h3 className="eyebrow mb-2">Calculated</h3>
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-sm">
            {def.columns.filter((c) => c.type === "formula" && c.key !== "row_check" && all[c.key] !== "" && all[c.key] !== null).map((c) => (
              <div key={c.key} className="contents">
                <dt className="truncate text-xs text-ink-3">{c.header}</dt>
                <dd className="min-w-0 truncate"><CellView c={c} value={all[c.key]} row={row} idx={idx} isOpen /></dd>
              </div>
            ))}
          </dl>
        </section>

        {related.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2 flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" aria-hidden />Linked records</h3>
            <ul className="flex flex-col gap-1.5">
              {related.map((r) => (
                <li key={`${r.row.id}:${r.via}`}>
                  <Link href={`/central/board/${r.row.sheet}?q=${encodeURIComponent(r.row.row_key ?? "")}`} className="flex items-center gap-2 rounded-neo-sm neo-inset-sm px-3 py-2 text-sm hover:text-oxblood">
                    <span className="shrink-0 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3">{r.row.sheet.replace(/_/g, " ")}</span>
                    <span className="truncate text-ink">{entityName(idx, r.row) || r.row.row_key}</span>
                    <span className="ml-auto shrink-0 text-[0.625rem] text-ink-3">{r.via}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="eyebrow mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" aria-hidden />History</h3>
          {!history && <p className="text-xs text-ink-3">Loading…</p>}
          {history && !history.ok && <p className="text-xs text-danger">{history.error}</p>}
          {history?.ok && history.data.length === 0 && <p className="text-xs text-ink-3">No recorded changes yet.</p>}
          <ol className="flex flex-col gap-2">
            {history?.ok && history.data.map((h) => (
              <li key={h.id} className="rounded-neo-sm neo-inset-sm px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-ink-2">
                  <span className="font-medium capitalize text-ink">{h.action}</span>
                  <span>via {VIA[h.via] ?? h.via}{h.actor ? ` · ${h.actor}` : ""}</span>
                  <span className="ml-auto text-ink-3">{new Date(h.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                {h.action === "update" && <Diff def={def} idx={idx} row={row} before={h.before} after={h.after} />}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Drawer>
  );
}

function Diff({ def, idx, row, before, after }: { def: SheetDef; idx: Index; row: Row; before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = Object.keys({ ...(before ?? {}), ...(after ?? {}) }).filter((k) => (before?.[k] ?? null) !== (after?.[k] ?? null));
  if (!keys.length) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {keys.map((k) => {
        const c = def.columns.find((x) => x.key === k);
        const show = (v: unknown) => (c ? displayValue(idx, c, (v as CellValue) ?? null, row) : String(v ?? "")) || "∅";
        return <li key={k} className="truncate text-ink-3"><span className="text-ink-2">{c?.header ?? k}:</span> <s>{show(before?.[k])}</s> → <span className="text-ink">{show(after?.[k])}</span></li>;
      })}
    </ul>
  );
}

function FieldEditor({ c, row, idx, disabled, onSet, invalid }: { c: ColumnDef; row: Row; idx: Index; disabled: boolean; onSet: (v: CellValue) => void; invalid: boolean }) {
  const cur = row.data[c.key] === null || row.data[c.key] === undefined ? "" : String(row.data[c.key]);
  const [v, setV] = useState(cur);
  const label = <span className="text-xs font-medium text-ink-2">{c.header.replace(/ ID$/, c.type === "id" ? " ID" : "")}{c.required && <span className="text-danger"> *</span>}</span>;
  const commit = (next: string) => { if (next.trim() !== cur) onSet(next.trim() === "" ? null : next); };
  if (c.type === "ref" || c.type === "choice" || c.type === "entity") {
    const opts = optionsFor(c, row, idx);
    return (
      <label className="flex flex-col gap-1.5">{label}
        <Select value={cur} disabled={disabled} aria-invalid={invalid} onChange={(e) => onSet(e.target.value || null)} className="h-10">
          <option value="">—</option>
          {cur && !opts.some((o) => o.value === cur) && <option value={cur}>{cur} (invalid)</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}{o.hint && o.hint !== o.label ? ` · ${o.hint}` : ""}</option>)}
        </Select>
      </label>
    );
  }
  if (c.type === "longtext") {
    return <label className="flex flex-col gap-1.5">{label}<Textarea value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => commit(v)} className="min-h-20" /></label>;
  }
  return (
    <label className="flex flex-col gap-1.5">{label}
      <Input
        value={v} disabled={disabled} aria-invalid={invalid} onChange={(e) => setV(e.target.value)} onBlur={() => commit(v)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        type={c.type === "date" ? "date" : c.type === "number" ? "number" : c.type === "email" ? "email" : c.type === "url" ? "url" : "text"}
        className={cn("h-10", c.type === "id" && "font-mono uppercase")}
      />
    </label>
  );
}

/** Rows in any sheet that point at this row through an entity column. */
function relatedRows(idx: Index, row: Row) {
  if (!row.row_key) return [];
  const fam = row.sheet.replace(/_(India|Global)$/, "");
  const out: { row: Row; via: string }[] = [];
  for (const def of SHEETS) {
    for (const r of idx.bySheet.get(def.name) ?? []) {
      for (const c of def.columns) {
        if (c.type !== "entity" || String(r.data[c.key] ?? "") !== row.row_key) continue;
        const e = c.entity;
        const t = String(r.data.ref_type_id ?? "");
        const hit = e === row.sheet || (e === "@opportunity" && fam === "Pipeline") || (e === "@partner" && fam === "Partners")
          || (e === "@any" && ((t === "PL" && fam === "Pipeline") || (t === "PA" && fam === "Partners") || (t === "PJ" && row.sheet === "Projects")));
        if (hit) out.push({ row: r, via: c.header.replace(/ ID$/, "") });
      }
    }
  }
  return out.slice(0, 60);
}
