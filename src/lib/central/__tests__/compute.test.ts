import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../workbook";
import { buildIndex, computeRow, nextRowKey, rowIssues, coerce, sheetDef } from "../compute";
import type { Store } from "../types";

const FILE = "Central Repo/nishaan-a_central_repository_clean.xlsx";

describe.skipIf(!existsSync(FILE))("central repository workbook", () => {
  const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
  const parsed = parseWorkbook((n) => (wb.Sheets[n] ? (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][]) : undefined));
  const store: Store = { rows: parsed.rows.map((r, i) => ({ ...r, id: `r${i}`, color: null })), refs: parsed.refs };
  const idx = buildIndex(store);

  it("parses every sheet without header drift", () => {
    expect(parsed.warnings).toEqual([]);
    const counts = Object.fromEntries([...idx.bySheet].map(([k, v]) => [k, v.length]));
    console.log(counts, "refs:", parsed.refs.length);
    expect(counts.Organisations).toBeGreaterThan(40);
    expect(counts.Pipeline_India).toBeGreaterThan(10);
  });

  it("resolves lookups like the sheet formulas", () => {
    const p = idx.byKey.get("Pipeline_India")!.get("P-002")!;
    const c = computeRow(idx, p);
    expect(c.organisation).toBeTruthy();
    expect(c.organisation).not.toBe("#INVALID");
    expect(c.stage).toBe(idx.refs.get("Stage")!.get(String(p.data.stage_id))!.name);
    expect(["Y", "N"]).toContain(c.is_open);
    const f = idx.byKey.get("Finances")!.get("F-001")!;
    expect(computeRow(idx, f).total).toBe(Number(f.data.qty) * Number(f.data.unit_amount));
  });

  it("reports row-check issues", () => {
    let invalid = 0;
    const all: string[] = [];
    for (const [sheet, rows] of idx.bySheet) for (const r of rows) {
      const c = computeRow(idx, r);
      for (const [k, v] of Object.entries(c)) if (v === "#INVALID") { invalid++; all.push(`${sheet} ${r.row_key} ${k}`); }
      const iss = rowIssues(idx, r);
      if (iss.length) all.push(`${sheet} ${r.row_key}: ${iss.join("; ")}`);
    }
    console.log(all.join("\n"));
    expect(invalid).toBe(0);
  });

  it("generates the next ID and validates input", () => {
    expect(nextRowKey(idx, "Organisations")).toMatch(/^ORG-\d{3}$/);
    expect(nextRowKey(idx, "Pipeline_Global")).toMatch(/^P-\d{3}$/);
    const qty = sheetDef("Finances").columns.find((c) => c.key === "qty")!;
    expect(coerce(qty, "-1")).toEqual({ error: "Qty cannot be negative" });
    expect(coerce(qty, "1,500")).toEqual({ value: 1500 });
  });
});
