import { SHEETS, REF_LISTS } from "./schema";
import type { CellValue, ColumnDef, EntityTarget, RefItem, Row, RowData, SheetDef, Store } from "./types";

export const SHEET_BY_NAME = new Map(SHEETS.map((s) => [s.name, s]));
export const REF_LIST_BY_NAME = new Map(REF_LISTS.map((l) => [l.list, l]));

export function sheetDef(name: string): SheetDef {
  const s = SHEET_BY_NAME.get(name);
  if (!s) throw new Error(`Unknown sheet "${name}"`);
  return s;
}

export function family(sheet: string) {
  return sheet.replace(/_(India|Global)$/, "");
}

export function sheetMarket(sheet: string): "IN" | "GL" | null {
  return sheet.endsWith("_India") ? "IN" : sheet.endsWith("_Global") ? "GL" : null;
}

export const idColumn = (s: SheetDef) => s.columns.find((c) => c.type === "id") ?? null;
export const inputColumns = (s: SheetDef) => s.columns.filter((c) => c.type !== "formula");
export const colByLetter = (s: SheetDef, letter: string) => s.columns.find((c) => c.letter === letter);
export const colByKey = (s: SheetDef, key: string) => s.columns.find((c) => c.key === key);

const ENTITY_SHEETS: Record<Exclude<EntityTarget, "@any">, string[]> = {
  Organisations: ["Organisations"],
  Contacts: ["Contacts"],
  Freelancers: ["Freelancers"],
  Projects: ["Projects"],
  "@opportunity": ["Pipeline_India", "Pipeline_Global"],
  "@partner": ["Partners_India", "Partners_Global"],
};

export const ENTITY_LABEL: Record<EntityTarget, string> = {
  Organisations: "Organisation", Contacts: "Contact", Freelancers: "Freelancer", Projects: "Project",
  "@opportunity": "Opportunity", "@partner": "Partner", "@any": "Record",
};

/** Business key of a row: the ID column, or for ID-less sheets (ProjectServices) the required inputs joined. */
export function rowKeyOf(sheet: string, data: RowData): string | null {
  const s = sheetDef(sheet);
  const idc = idColumn(s);
  if (idc) {
    const v = data[idc.key];
    return v === null || v === undefined || v === "" ? null : String(v).trim();
  }
  const parts = s.columns.filter((c) => c.required).map((c) => data[c.key] ?? "");
  return parts.every((p) => p === "") ? null : parts.join("|");
}

export interface Index {
  bySheet: Map<string, Row[]>;
  byKey: Map<string, Map<string, Row>>;
  refs: Map<string, Map<string, RefItem>>;
  refList: Map<string, RefItem[]>;
  memo: Map<string, RowData>;
  financeByProject: Map<string, Row[]>;
  projectsByPipeline: Map<string, Row[]>;
  interactions: Row[];
  servicesByProject: Map<string, number>;
}

export function buildIndex(store: Store): Index {
  const bySheet = new Map<string, Row[]>();
  const byKey = new Map<string, Map<string, Row>>();
  for (const s of SHEETS) { bySheet.set(s.name, []); byKey.set(s.name, new Map()); }
  for (const r of store.rows) {
    if (r.deleted_at) continue;
    bySheet.get(r.sheet)?.push(r);
    if (r.row_key) byKey.get(r.sheet)?.set(r.row_key, r);
  }
  for (const list of bySheet.values()) list.sort((a, b) => a.position - b.position);
  const refs = new Map<string, Map<string, RefItem>>();
  const refList = new Map<string, RefItem[]>();
  for (const r of [...store.refs].sort((a, b) => a.position - b.position)) {
    if (!refs.has(r.list)) { refs.set(r.list, new Map()); refList.set(r.list, []); }
    refs.get(r.list)!.set(r.item_id, r);
    refList.get(r.list)!.push(r);
  }
  const financeByProject = new Map<string, Row[]>();
  for (const f of bySheet.get("Finances") ?? []) {
    const p = String(f.data.project_id ?? "");
    if (!p) continue;
    if (!financeByProject.has(p)) financeByProject.set(p, []);
    financeByProject.get(p)!.push(f);
  }
  const projectsByPipeline = new Map<string, Row[]>();
  for (const p of bySheet.get("Projects") ?? []) {
    const k = String(p.data.pipeline_id ?? "");
    if (!k) continue;
    if (!projectsByPipeline.has(k)) projectsByPipeline.set(k, []);
    projectsByPipeline.get(k)!.push(p);
  }
  const servicesByProject = new Map<string, number>();
  for (const s of bySheet.get("ProjectServices") ?? []) {
    const k = String(s.data.project_id ?? "");
    if (k) servicesByProject.set(k, (servicesByProject.get(k) ?? 0) + 1);
  }
  return { bySheet, byKey, refs, refList, memo: new Map(), financeByProject, projectsByPipeline, interactions: bySheet.get("Interactions") ?? [], servicesByProject };
}

export function findEntity(idx: Index, target: EntityTarget, key: string): Row | null {
  if (!key) return null;
  const sheets = target === "@any" ? ["Pipeline_India", "Pipeline_Global", "Partners_India", "Partners_Global", "Projects"] : ENTITY_SHEETS[target];
  for (const s of sheets) {
    const r = idx.byKey.get(s)?.get(key);
    if (r) return r;
  }
  return null;
}

export function entityRows(idx: Index, target: EntityTarget): Row[] {
  const sheets = target === "@any" ? ["Pipeline_India", "Pipeline_Global", "Partners_India", "Partners_Global", "Projects"] : ENTITY_SHEETS[target];
  return sheets.flatMap((s) => idx.bySheet.get(s) ?? []);
}

/** Human label for an entity row (what the sheet's lookup formulas show). */
export function entityName(idx: Index, row: Row): string {
  const f = family(row.sheet);
  if (f === "Pipeline") return String(row.data.opportunity ?? row.row_key ?? "");
  if (f === "Partners") return String(computeRow(idx, row).partner ?? row.row_key ?? "");
  if (row.sheet === "Projects") return String(row.data.project ?? row.row_key ?? "");
  if (row.sheet === "Organisations") return String(row.data.organisation ?? row.row_key ?? "");
  return String(row.data.name ?? row.row_key ?? "");
}

const s = (v: CellValue | undefined) => (v === null || v === undefined ? "" : String(v));
const n = (v: CellValue | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);

function refName(idx: Index, list: string, id: CellValue | undefined): string {
  const k = s(id);
  if (!k) return "";
  return idx.refs.get(list)?.get(k)?.name ?? "#INVALID";
}

function maxInteraction(idx: Index, field: string, key: string | null): string {
  if (!key) return "";
  let best = "";
  for (const i of idx.interactions) if (s(i.data[field]) === key && s(i.data.date) > best) best = s(i.data.date);
  return best;
}

function financeTotal(f: Row) {
  const q = f.data.qty, u = f.data.unit_amount;
  if (q === null || q === undefined || q === "" || u === null || u === undefined || u === "") return null;
  return n(q) * n(u);
}

function receivableSum(idx: Index, projectId: string) {
  let sum = 0;
  for (const f of idx.financeByProject.get(projectId) ?? []) if (s(f.data.type_id) === "RC") sum += financeTotal(f) ?? 0;
  return sum;
}

const DAY = 86400_000;
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(a) - Date.parse(b)) / DAY);
}

/** Every column (input + formula) for a row, formulas evaluated like the workbook. */
export function computeRow(idx: Index, row: Row): RowData {
  const memoKey = row.id;
  const hit = idx.memo.get(memoKey);
  if (hit) return hit;
  const def = sheetDef(row.sheet);
  const out: RowData = { ...row.data };
  idx.memo.set(memoKey, out); // guard cycles
  const fam = family(row.sheet);
  for (const c of def.columns) {
    if (c.type !== "formula") continue;
    out[c.key] = evalFormula(idx, def, row, c, out, fam);
  }
  // Pipeline Value is typed by the team; when blank it falls back to the linked projects' receivables.
  if (fam === "Pipeline" && s(row.data.value) === "") {
    const auto = projectValue(idx, row);
    out.value = auto === 0 ? null : auto;
  }
  return out;
}

/** Receivables of the projects linked to an opportunity (what the sheet's old Value formula summed). */
export function projectValue(idx: Index, row: Row): number {
  if (!row.row_key) return 0;
  let sum = 0;
  for (const p of idx.projectsByPipeline.get(row.row_key) ?? []) if (p.row_key) sum += receivableSum(idx, p.row_key);
  return sum;
}

function evalFormula(idx: Index, def: SheetDef, row: Row, c: ColumnDef, out: RowData, fam: string): CellValue {
  const d = row.data;
  if (c.mirror) {
    const src = colByLetter(def, c.mirror.letter);
    const v = src ? s(out[src.key]) : "";
    if (!v) return "";
    if (c.mirror.list) {
      const item = idx.refs.get(c.mirror.list)?.get(v);
      if (!item) return "#INVALID";
      return c.mirror.field === "IsOpen" ? (item.is_open ? "Y" : "N") : item.name;
    }
    if (c.mirror.sheet) {
      const target = c.mirror.sheet.startsWith("@") ? (c.mirror.sheet as EntityTarget) : (c.mirror.sheet as EntityTarget);
      const r = findEntity(idx, target, v);
      if (!r) return c.header.endsWith("ID") || c.header === "Contact role" ? "" : "#INVALID";
      if (c.mirror.fieldLetter === "name") return entityName(idx, r);
      const tdef = sheetDef(r.sheet);
      const tcol = colByLetter(tdef, c.mirror.fieldLetter!);
      if (!tcol) return "";
      return tcol.type === "formula" ? computeRow(idx, r)[tcol.key] ?? "" : r.data[tcol.key] ?? "";
    }
  }
  const org = (k: CellValue | undefined) => findEntity(idx, "Organisations", s(k));
  const fl = (k: CellValue | undefined) => findEntity(idx, "Freelancers", s(k));
  switch (`${fam}:${c.header}`) {
    case "Pipeline:Last touch": return maxInteraction(idx, "opportunity_id", row.row_key);
    case "Partners:Last touch": return maxInteraction(idx, "partner_id", row.row_key);
    case "Contacts:Last interaction": return maxInteraction(idx, "contact_id", row.row_key);
    case "Freelancers:Last interaction": return maxInteraction(idx, "freelancer_id", row.row_key);
    case "Partners:Partner": {
      if (!s(d.org_id) && !s(d.freelancer_id)) return "";
      return s(d.org_id) ? s(out.organisation) : s(out.freelancer);
    }
    case "Partners:Type": {
      if (s(d.org_id)) { const o = org(d.org_id); return o ? refName(idx, "OrgType", o.data.type_id).replace("#INVALID", "") : ""; }
      return s(d.freelancer_id) ? "Freelancer" : "";
    }
    case "Partners:Country ID": {
      if (s(d.org_id)) return s(org(d.org_id)?.data.country_id);
      if (s(d.freelancer_id)) return s(fl(d.freelancer_id)?.data.country_id);
      return "";
    }
    case "Projects:Industry":
    case "Credentials:Industry": {
      const o = org(d.org_id);
      if (!s(d.org_id)) return "";
      return o ? refName(idx, "Sector", o.data.industry_id).replace("#INVALID", "") : "";
    }
    case "Projects:Fee": {
      if (!row.row_key) return "";
      const sum = receivableSum(idx, row.row_key);
      return sum === 0 ? "" : sum;
    }
    case "Projects:Services (count)": return row.row_key ? idx.servicesByProject.get(row.row_key) ?? 0 : "";
    case "Organisations:Market": {
      const cid = s(d.country_id);
      if (!cid) return "";
      const country = idx.refs.get("Country")?.get(cid);
      if (!country) return "#INVALID";
      return idx.refs.get("Market")?.get(country.market_id ?? "")?.name ?? "#INVALID";
    }
    case "Tasks:Ref name": {
      const k = s(d.ref_id);
      if (!k) return "";
      const t = s(d.ref_type_id);
      const target: EntityTarget | null = t === "PL" ? "@opportunity" : t === "PA" ? "@partner" : t === "PJ" ? "Projects" : null;
      const r = target ? findEntity(idx, target, k) : null;
      return r ? entityName(idx, r) : "#INVALID";
    }
    case "Tasks:Advance/Delay": {
      const due = s(d.due);
      if (!row.row_key || !due) return "";
      const st = s(d.status_id);
      if (st === "CP") return s(d.completed) ? daysBetween(due, s(d.completed)) : "";
      if (st === "CN") return "";
      return daysBetween(due, new Date().toISOString().slice(0, 10));
    }
    case "Finances:Organisation": {
      if (!s(d.project_id)) return "";
      const p = findEntity(idx, "Projects", s(d.project_id));
      const o = p ? org(p.data.org_id) : null;
      return o ? s(o.data.organisation) : "#INVALID";
    }
    case "Finances:Total": { const t = financeTotal(row); return t === null ? "" : t; }
    case "Finances:Pending": {
      const t = financeTotal(row);
      if (t === null || s(d.type_id) !== "RC") return "";
      return t - n(d.received);
    }
  }
  if (c.header === "Row check") {
    const issues = rowIssues(idx, row);
    return row.row_key || Object.values(d).some((v) => v !== "" && v !== null) ? (issues.length ? issues.join("; ") : "OK") : "";
  }
  return "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/i;

/** Data-validation problems for a row, same wording as the workbook's Row check column. */
export function rowIssues(idx: Index, row: Row): string[] {
  const def = sheetDef(row.sheet);
  const d = row.data;
  const out: string[] = [];
  const fam = family(row.sheet);
  for (const c of def.columns) {
    if (c.type === "formula") continue;
    const v = s(d[c.key]).trim();
    if (!v) { if (c.required) out.push(`Missing ${c.header}`); continue; }
    if (c.type === "id") {
      const dupSheets = fam === "Pipeline" ? ["Pipeline_India", "Pipeline_Global"] : fam === "Partners" ? ["Partners_India", "Partners_Global"] : [row.sheet];
      const count = dupSheets.flatMap((sn) => idx.bySheet.get(sn) ?? []).filter((r) => r.row_key === v).length;
      if (count > 1) out.push("Duplicate ID");
    } else if (c.type === "ref" && c.list) {
      if (!idx.refs.get(c.list)?.has(v)) out.push(`Invalid ${c.header}`);
    } else if (c.type === "entity" && c.entity) {
      let target: EntityTarget | null = c.entity;
      if (c.entity === "@any") { const t = s(d.ref_type_id); target = t === "PL" ? "@opportunity" : t === "PA" ? "@partner" : t === "PJ" ? "Projects" : null; }
      if (target && !findEntity(idx, target, v)) out.push(`Invalid ${c.header}`);
    } else if (c.type === "choice" && c.choices && !c.choices.includes(v)) out.push(`Invalid ${c.header}`);
    else if (c.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) out.push(`Invalid ${c.header}`);
    else if (c.type === "number" && (Number.isNaN(Number(v)) || Number(v) < 0)) out.push(`Invalid ${c.header}`);
    else if (c.type === "email" && !EMAIL.test(v)) out.push(`Invalid ${c.header}`);
    else if (c.type === "url" && !URL_RE.test(v)) out.push(`Invalid ${c.header}`);
  }
  const market = sheetMarket(row.sheet);
  if (market && (fam === "Pipeline" || fam === "Partners")) {
    const computed = computeRow(idx, row);
    const cid = s(computed.country_id);
    if (!cid && fam === "Pipeline") out.push("Country missing");
    else if (cid) {
      const ctry = idx.refs.get("Country")?.get(cid);
      if (ctry && ctry.market_id !== market) out.push(`Wrong sheet (country is ${ctry.name})`);
    }
  }
  if (row.sheet === "Partners_India" || row.sheet === "Partners_Global") {
    if (!s(d.org_id) && !s(d.freelancer_id)) out.push("Missing Org ID or Freelancer ID");
  }
  return out;
}

/** Display label for a stored input value (resolves IDs to names). */
export function displayValue(idx: Index, c: ColumnDef, v: CellValue | undefined, row?: Row): string {
  const raw = s(v);
  if (!raw) return "";
  if (c.type === "ref" && c.list) return idx.refs.get(c.list)?.get(raw)?.name ?? raw;
  if (c.type === "entity" && c.entity) {
    let target: EntityTarget | null = c.entity;
    if (c.entity === "@any" && row) { const t = s(row.data.ref_type_id); target = t === "PL" ? "@opportunity" : t === "PA" ? "@partner" : t === "PJ" ? "Projects" : null; }
    const r = target ? findEntity(idx, target, raw) : null;
    return r ? entityName(idx, r) : raw;
  }
  return raw;
}

/** Next ID following the sheet's existing pattern (P-019, ORG-057, PR-08…). */
export function nextRowKey(idx: Index, sheet: string): string | null {
  const def = sheetDef(sheet);
  if (!idColumn(def)) return null;
  const fam = family(sheet);
  const sheets = fam === "Pipeline" ? ["Pipeline_India", "Pipeline_Global"] : fam === "Partners" ? ["Partners_India", "Partners_Global"] : [sheet];
  const keys = sheets.flatMap((sn) => idx.bySheet.get(sn) ?? []).map((r) => r.row_key ?? "");
  let prefix = DEFAULT_PREFIX[fam] ?? sheet.slice(0, 2).toUpperCase() + "-";
  let width = 3;
  let max = 0;
  for (const k of keys) {
    const m = k.match(/^(.*?)(\d+)$/);
    if (!m) continue;
    prefix = m[1];
    width = m[2].length;
    max = Math.max(max, Number(m[2]));
  }
  return prefix + String(max + 1).padStart(width, "0");
}

const DEFAULT_PREFIX: Record<string, string> = {
  Pipeline: "P-", Partners: "PA-", Projects: "PR-", Organisations: "ORG-", Contacts: "CON-", Freelancers: "FL-",
  Interactions: "I-", Tasks: "T-", Finances: "F-", Credentials: "CR-",
};

/** Normalise an incoming value for a column (trims, coerces numbers and dates). Returns an error string on bad input. */
export function coerce(c: ColumnDef, v: unknown): { value: CellValue } | { error: string } {
  if (v === null || v === undefined) return { value: null };
  let str = typeof v === "number" ? String(v) : String(v).trim();
  if (str === "") return { value: null };
  switch (c.type) {
    case "number": {
      const num = Number(str.replace(/,/g, ""));
      if (Number.isNaN(num)) return { error: `${c.header} must be a number` };
      if (num < 0) return { error: `${c.header} cannot be negative` };
      return { value: num };
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return { value: str.slice(0, 10) };
      const t = Date.parse(str);
      if (Number.isNaN(t)) return { error: `${c.header} must be a date (YYYY-MM-DD)` };
      return { value: new Date(t).toISOString().slice(0, 10) };
    }
    case "email":
      if (!EMAIL.test(str)) return { error: `${c.header} is not a valid email` };
      return { value: str.toLowerCase() };
    case "url":
      if (!/^https?:\/\//i.test(str)) str = `https://${str}`;
      if (!URL_RE.test(str)) return { error: `${c.header} is not a valid link` };
      return { value: str };
    case "choice":
      if (c.choices && !c.choices.includes(str)) {
        const hit = c.choices.find((x) => x.toLowerCase() === str.toLowerCase());
        if (!hit) return { error: `${c.header} must be one of: ${c.choices.join(", ")}` };
        str = hit;
      }
      return { value: str };
    case "formula":
      return { error: `${c.header} is calculated and cannot be edited` };
    default:
      return { value: str };
  }
}

export function allSheetsOrder() {
  return SHEETS.map((x) => x.name);
}
