import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHEETS } from "./schema";
import { buildIndex, computeRow, displayValue, rowIssues, sheetDef } from "./compute";
import { applyOps, loadStore } from "./store";
import { proposeChanges, schemaBrief } from "./agent";
import { autoPush } from "./sync";
import type { Op } from "./types";

/** Shared by the REST API and the MCP endpoint (token callers; workspace already resolved). */
export const service = {
  schema() {
    return { sheets: schemaBrief(), note: "Write input columns only. ref columns take item IDs from reference lists, entity columns take record IDs. Names are also accepted and resolved." };
  },
  async references(workspaceId: string) {
    const store = await loadStore(createAdminClient(), workspaceId);
    const out: Record<string, { id: string; name: string; is_open?: boolean | null }[]> = {};
    for (const r of store.refs.sort((a, b) => a.position - b.position)) (out[r.list] ??= []).push({ id: r.item_id, name: r.name, ...(r.is_open !== null ? { is_open: r.is_open } : {}) });
    return out;
  },
  async rows(workspaceId: string, opts: { sheet?: string; q?: string; limit?: number }) {
    if (opts.sheet && !SHEETS.some((s) => s.name === opts.sheet)) throw new Error(`Unknown sheet. Use one of: ${SHEETS.map((s) => s.name).join(", ")}`);
    const store = await loadStore(createAdminClient(), workspaceId);
    const idx = buildIndex(store);
    const sheets = opts.sheet ? [opts.sheet] : SHEETS.map((s) => s.name);
    const q = opts.q?.toLowerCase().trim();
    const out: Record<string, unknown[]> = {};
    for (const name of sheets) {
      const def = sheetDef(name);
      const rendered = (idx.bySheet.get(name) ?? []).map((r) => ({
        key: r.row_key,
        fields: Object.fromEntries(Object.entries(computeRow(idx, r)).filter(([k, v]) => v !== null && v !== "" && k !== "row_check")),
        labels: Object.fromEntries(def.columns.filter((c) => (c.type === "ref" || c.type === "entity") && r.data[c.key]).map((c) => [c.key, displayValue(idx, c, r.data[c.key], r)])),
        issues: rowIssues(idx, r),
      }));
      out[name] = (q ? rendered.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rendered).slice(0, opts.limit ?? 500);
    }
    return out;
  },
  async apply(workspaceId: string, label: string, ops: Op[], opts: { dryRun?: boolean; force?: boolean }) {
    if (!Array.isArray(ops) || !ops.length) throw new Error("ops must be a non-empty array");
    if (ops.length > 500) throw new Error("At most 500 ops per call");
    const res = await applyOps({ db: createAdminClient(), workspaceId, actorId: null, via: "api", note: label }, ops, opts);
    if (res.ok && !opts.dryRun) await autoPush(workspaceId, null);
    return { ok: res.ok, error: res.error, results: res.results };
  },
  async agent(workspaceId: string, label: string, instruction: string, apply: boolean) {
    const admin = createAdminClient();
    const proposal = await proposeChanges(admin, workspaceId, null, instruction);
    if (!apply || !proposal.valid || !proposal.ops.length) return { applied: false, proposal };
    const res = await applyOps({ db: admin, workspaceId, actorId: null, via: "agent", note: `${label}: ${instruction.slice(0, 200)}` }, proposal.ops);
    if (res.ok) await autoPush(workspaceId, null);
    return { applied: res.ok, error: res.error, proposal, results: res.results };
  },
};
