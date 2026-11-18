/**
 * Per-person display preferences. Stored in user_preferences.preferences (one row per person, only they can read or
 * write it), so they follow you to any device and apply as soon as you change them.
 */
export const ORG_COLUMNS = [
  { key: "linkedin", label: "LinkedIn" }, { key: "market", label: "Market" }, { key: "sector", label: "Sector" },
  { key: "score", label: "Score" }, { key: "band", label: "Band" }, { key: "coverage", label: "Coverage" },
  { key: "people", label: "People" }, { key: "relationship", label: "Relationship" }, { key: "updated", label: "Updated" },
] as const;
export type OrgColumn = (typeof ORG_COLUMNS)[number]["key"];

export interface Prefs {
  /** Organisations list: visible columns in display order. */
  orgColumns: OrgColumn[];
  orgDensity: "comfortable" | "compact";
  orgSort: "priority" | "updated" | "score" | "name";
  /** Boards. */
  boardDashboard: boolean;
  boardDensity: "comfortable" | "compact";
  /** Saved per sheet: hidden columns, widths, freeze, grouping, sort, filters and so on. */
  boardLayouts: Record<string, Record<string, unknown>>;
  /** How much of a long note shows before "Show all". */
  notePreview: "short" | "medium" | "full";
  dossierTab: "summary" | "financials" | "brand" | "commercial" | "signals" | "people" | "notes" | "files";
}

export const DEFAULT_PREFS: Prefs = {
  orgColumns: ORG_COLUMNS.map((c) => c.key),
  orgDensity: "comfortable",
  orgSort: "priority",
  boardDashboard: true,
  boardDensity: "comfortable",
  boardLayouts: {},
  notePreview: "medium",
  dossierTab: "summary",
};

export const NOTE_CLAMP: Record<Prefs["notePreview"], number> = { short: 200, medium: 420, full: 100000 };
export const DOSSIER_TABS: Prefs["dossierTab"][] = ["summary", "financials", "brand", "commercial", "signals", "people", "notes", "files"];

/** Merge stored values over defaults, dropping anything malformed so old or hand-edited values never break a page. */
export function readPrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <K extends keyof Prefs>(k: K, ok: (v: unknown) => boolean): Prefs[K] => (ok(r[k]) ? (r[k] as Prefs[K]) : DEFAULT_PREFS[k]);
  const cols = Array.isArray(r.orgColumns) ? (r.orgColumns as string[]).filter((c, i, a) => ORG_COLUMNS.some((x) => x.key === c) && a.indexOf(c) === i) : null;
  return {
    orgColumns: cols && cols.length ? (cols as OrgColumn[]) : DEFAULT_PREFS.orgColumns,
    orgDensity: pick("orgDensity", (v) => v === "comfortable" || v === "compact"),
    orgSort: pick("orgSort", (v) => ["priority", "updated", "score", "name"].includes(v as string)),
    boardDashboard: pick("boardDashboard", (v) => typeof v === "boolean"),
    boardDensity: pick("boardDensity", (v) => v === "comfortable" || v === "compact"),
    boardLayouts: pick("boardLayouts", (v) => !!v && typeof v === "object" && !Array.isArray(v)),
    notePreview: pick("notePreview", (v) => ["short", "medium", "full"].includes(v as string)),
    dossierTab: pick("dossierTab", (v) => DOSSIER_TABS.includes(v as Prefs["dossierTab"])),
  };
}
