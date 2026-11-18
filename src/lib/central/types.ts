export type ColType = "id" | "text" | "longtext" | "email" | "url" | "date" | "number" | "ref" | "entity" | "choice" | "formula";
export type EntityTarget = "Organisations" | "Contacts" | "Freelancers" | "Projects" | "@opportunity" | "@partner" | "@any";

export interface ColumnDef {
  key: string;
  header: string;
  letter: string;
  width: number;
  type: ColType;
  required?: boolean;
  list?: string;
  entity?: EntityTarget;
  choices?: string[];
  mirror?: { letter: string; list?: string; field?: string; sheet?: string; fieldLetter?: string };
}

export interface SheetDef {
  name: string;
  title: string;
  description: string;
  frozen: number;
  tab: string | null;
  columns: ColumnDef[];
}

export interface RefListDef { list: string; title: string; id: string; name: string; isopen?: string; marketid?: string }

export interface RefItem { list: string; item_id: string; name: string; is_open: boolean | null; market_id: string | null; color: string | null; position: number }

export type CellValue = string | number | null;
export type RowData = Record<string, CellValue>;

export interface Row {
  id: string;
  sheet: string;
  row_key: string | null;
  data: RowData;
  position: number;
  color: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  updated_via?: string;
}

export interface Store { rows: Row[]; refs: RefItem[] }

export type Op =
  | { op: "insert"; sheet: string; data: RowData; position?: number; color?: string | null }
  | { op: "update"; sheet: string; key: string; data: RowData }
  | { op: "delete"; sheet: string; key: string }
  | { op: "restore"; sheet: string; key: string }
  | { op: "color"; sheet: string; key: string; color: string | null }
  | { op: "move"; sheet: string; key: string; position: number }
  /** Reorder: put row `key` directly after row `after` (null = top) and renumber the sheet 1..n. */
  | { op: "place"; sheet: string; key: string; after: string | null };
