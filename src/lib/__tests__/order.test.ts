import { describe, expect, it } from "vitest";
import { placeRow, priorityNumbers, rowBefore } from "@/lib/central/order";
import type { Row } from "@/lib/central/types";

const rows = (keys: string[], extra: Partial<Row>[] = []): Row[] =>
  keys.map((k, i) => ({ id: k, sheet: "S", row_key: k, data: {}, position: i + 1, color: null, deleted_at: null, ...(extra[i] ?? {}) }));
const apply = (rs: Row[], m: Map<string, number>) => rs.map((r) => ({ ...r, position: m.get(r.id) ?? r.position })).sort((a, b) => a.position - b.position).map((r) => r.id);

describe("priority order", () => {
  it("moves a row down and renumbers only what changed", () => {
    const rs = rows(["a", "b", "c", "d", "e"]);
    const m = placeRow(rs, "S", "b", "d");
    expect(apply(rs, m)).toEqual(["a", "c", "d", "b", "e"]);
    expect([...m.keys()].sort()).toEqual(["b", "c", "d"]);
  });
  it("moves a row to the top", () => {
    const rs = rows(["a", "b", "c"]);
    expect(apply(rs, placeRow(rs, "S", "c", null))).toEqual(["c", "a", "b"]);
  });
  it("cleans up fractional and duplicate positions", () => {
    const rs = rows(["a", "b", "c"], [{ position: 1 }, { position: 1.5 }, { position: 1.5 }]);
    const m = placeRow(rs, "S", "a", "c");
    expect(apply(rs, m)).toEqual(["b", "c", "a"]);
    expect([...new Set([...m.values()])].length).toBe(m.size);
  });
  it("ignores deleted rows and unknown anchors", () => {
    const rs = rows(["a", "b", "c"], [{}, { deleted_at: "x" }]);
    expect(apply(rs.filter((r) => !r.deleted_at), placeRow(rs, "S", "c", null))).toEqual(["c", "a"]);
    expect(placeRow(rs, "S", "a", "zzz").size).toBe(0);
  });
  it("numbers priorities skipping archived rows, and finds the undo anchor", () => {
    const rs = rows(["a", "b", "c"], [{}, { data: { archived: "Y" } }]);
    const p = priorityNumbers(rs, "S", (r) => r.data.archived === "Y");
    expect([p.get("a"), p.get("b"), p.get("c")]).toEqual([1, undefined, 2]);
    expect(rowBefore(rs, "S", "c")).toBe("b");
    expect(rowBefore(rs, "S", "a")).toBeNull();
  });
});
