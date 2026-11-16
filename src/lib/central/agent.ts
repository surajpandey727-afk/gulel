import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE, untrusted } from "@/lib/ai/agents/shared";
import { SHEETS } from "./schema";
import { buildIndex, inputColumns } from "./compute";
import { applyOps, loadStore, type OpResult } from "./store";
import type { Op, RowData, Store } from "./types";

const SHEET_NAMES = SHEETS.map((s) => s.name) as [string, ...string[]];

export const MunshiSchema = z.object({
  summary: z.string(),
  ops: z.array(z.object({
    op: z.enum(["insert", "update", "delete"]),
    sheet: z.enum(SHEET_NAMES),
    key: z.string().nullable(),
    fields: z.array(z.object({ column: z.string(), value: z.string().nullable() })),
    reason: z.string(),
  })),
  questions: z.array(z.string()),
});
export type MunshiOutput = z.infer<typeof MunshiSchema>;

const SYSTEM = `You are Munshi, the record keeper of the nishaan-a Central Repository (a relational workbook mirrored in gulel and Google Sheets).
${NISHAANA_CONTEXT}
You turn the founder's instruction into precise row operations. Rules:
- Only use sheets and column keys from the schema. Formula columns do not exist for you; never set them.
- Dropdown (ref) columns take the item ID from the reference lists (e.g. Stage "S3", Owner "NH"). Entity columns take the record ID (e.g. "ORG-012", "CON-004", "P-002", "PA-001", "PR-03").
- One data point per cell. Never pack qualifiers like "(to be qualified)" into a name; use the dedicated column (Qualification, Secondary role, Preferred name, Role confirmed, Legal name confirmed, Scope).
- Pipeline and Partners rows go in the _India or _Global sheet matching the organisation's country market.
- To add a new organisation or contact that a pipeline row needs, insert it first in the same batch and reference its new ID. Leave key null on insert to auto-generate the next ID, unless you must reference it later in the batch: then set the ID column explicitly to the next free number following the sheet's pattern.
- update/delete use "key" = the row's ID (ProjectServices: "PROJECT_ID|SERVICE_ID"). For update include only the columns that change.
- Dates are YYYY-MM-DD. Today is ${new Date().toISOString().slice(0, 10)}.
- Never invent facts the instruction does not give. If something essential is ambiguous (which record, which value), make no op for it and ask in "questions".
- Prefer the smallest set of changes that fully does what was asked. Explain each op in "reason".
${UNTRUSTED_DATA_RULE}`;

export function schemaBrief() {
  return SHEETS.map((s) => ({
    sheet: s.name,
    description: s.description,
    columns: inputColumns(s).map((c) => ({ key: c.key, header: c.header, type: c.type, ...(c.required ? { required: true } : {}), ...(c.list ? { list: c.list } : {}), ...(c.entity ? { entity: c.entity } : {}), ...(c.choices ? { choices: c.choices } : {}) })),
  }));
}

export function snapshotFor(store: Store) {
  const idx = buildIndex(store);
  const refs: Record<string, string> = {};
  for (const [list, items] of idx.refList) refs[list] = items.map((i) => `${i.item_id}=${i.name}${i.is_open === false ? " (closed)" : ""}`).join(", ");
  const rows: Record<string, RowData[]> = {};
  for (const s of SHEETS) {
    rows[s.name] = (idx.bySheet.get(s.name) ?? []).map((r) => Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== null && v !== "")));
  }
  return { reference_lists: refs, rows };
}

export function toOps(out: MunshiOutput): Op[] {
  return out.ops.map((o) => {
    const data = Object.fromEntries(o.fields.map((f) => [f.column, f.value]));
    if (o.op === "insert") return { op: "insert", sheet: o.sheet, data };
    if (o.op === "update") return { op: "update", sheet: o.sheet, key: o.key ?? "", data };
    return { op: "delete", sheet: o.sheet, key: o.key ?? "" };
  });
}

export interface Proposal { summary: string; questions: string[]; ops: Op[]; reasons: string[]; validation: OpResult[]; valid: boolean; error?: string; model: string }

export async function proposeChanges(db: SupabaseClient, workspaceId: string, userId: string | null, instruction: string): Promise<Proposal> {
  const store = await loadStore(db, workspaceId);
  const res = await runStructured({
    workspaceId, agent: "munshi", userId, system: SYSTEM, schema: MunshiSchema, maxTokens: 16000,
    cachedContext: `Schema:\n${JSON.stringify(schemaBrief())}\n\nRepository data:\n${untrusted("central_repository", snapshotFor(store))}`,
    input: `Instruction from the founder: ${instruction}`,
  });
  const ops = toOps(res.data);
  const check = await applyOps({ db, workspaceId, actorId: userId, via: "agent" }, ops, { dryRun: true });
  return { summary: res.data.summary, questions: res.data.questions, ops, reasons: res.data.ops.map((o) => o.reason), validation: check.results, valid: check.ok, error: check.error, model: res.model };
}
