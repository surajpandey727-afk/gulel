"""Generate src/lib/central/schema.ts from the central repository workbook."""
import re, sys, json
import openpyxl
from openpyxl.utils import column_index_from_string, get_column_letter

wb = openpyxl.load_workbook(sys.argv[1])
out = sys.argv[2]
ENT = {"ent_Org_ID": "Organisations", "ent_Con_ID": "Contacts", "ent_Fl_ID": "Freelancers", "ent_Prj_ID": "Projects",
       "ent_Opp_ID": "@opportunity", "ent_Par_ID": "@partner"}
LONG = {"Notes", "Outcome", "Next step", "Next action", "Next steps", "Comments", "Permission and usage notes", "Task", "Item", "Scope", "Legal name"}
SHEETS = ["Pipeline_India", "Pipeline_Global", "Partners_India", "Partners_Global", "Projects", "ProjectServices",
          "Organisations", "Contacts", "Freelancers", "Interactions", "Tasks", "Finances", "Credentials"]

def slug(h): return re.sub(r"[^a-z0-9]+", "_", h.lower()).strip("_")

def expand(sqref):
    for part in str(sqref).split():
        m = re.match(r"([A-Z]+)\d+(?::([A-Z]+)\d+)?", part)
        a = column_index_from_string(m.group(1)); b = column_index_from_string(m.group(2) or m.group(1))
        for i in range(a, b + 1): yield get_column_letter(i)

sheets = []
for name in SHEETS:
    ws = wb[name]
    dv = {}
    for d in ws.data_validations.dataValidation:
        for L in expand(d.sqref): dv[L] = d
    rowcheck = next((str(c.value) for c in ws[4] if isinstance(c.value, str) and "Duplicate ID" in c.value or (isinstance(c.value, str) and "Missing" in c.value and ws.cell(3, c.column).value == "Row check")), "")
    required = set(re.findall(r'"Missing ([^;"]+); "', rowcheck))
    cols = []
    for c in ws[3]:
        h = c.value
        if h is None: continue
        L = c.column_letter
        v4 = ws.cell(4, c.column).value
        formula = isinstance(v4, str) and v4.startswith("=")
        col = {"key": slug(h), "header": h, "letter": L, "width": round((ws.column_dimensions[L].width or 12) * 7.5)}
        if formula:
            col["type"] = "formula"
            m = re.search(r"INDEX\(ref_(\w+?)_(Name|IsOpen),MATCH\(([A-Z]+)4,ref_\1_ID,0\)\)", v4)
            if m and v4.startswith(f'=IF({m.group(3)}4=""'):
                col["mirror"] = {"letter": m.group(3), "list": m.group(1), "field": m.group(2)}
            m = re.search(r'INDEX\((\w+)!\$([A-Z]+)\$4:\$[A-Z]+\$\d+,MATCH\(([A-Z]+)4,(ent_\w+),0\)\)', v4)
            if m and v4.startswith(f'=IF({m.group(3)}4=""') and v4.count("MATCH") == 1:
                col["mirror"] = {"letter": m.group(3), "sheet": m.group(1), "fieldLetter": m.group(2)}
            m = re.search(r'INDEX\(Index!\$([BF])\$4:\$[BF]\$203,MATCH\(([A-Z]+)4,ent_(Opp|Par)_ID,0\)\)', v4)
            if m and v4.count("MATCH") == 1:
                col["mirror"] = {"letter": m.group(2), "sheet": "@opportunity" if m.group(3) == "Opp" else "@partner", "fieldLetter": "name"}
        else:
            d = dv.get(L)
            f = (d.formula1 or "") if d else ""
            if L == "A" and d is not None and d.type == "custom" and "$A$4" in f: col["type"] = "id"
            elif d is not None and d.type == "list" and f.startswith("=ref_"): col["type"] = "ref"; col["list"] = re.match(r"=ref_(\w+)_ID", f).group(1)
            elif d is not None and d.type == "list" and f.lstrip("=") in ENT: col["type"] = "entity"; col["entity"] = ENT[f.lstrip("=")]
            elif d is not None and d.type == "custom" and re.search(r"COUNTIF\((ent_\w+),", f) and "+" not in f: col["type"] = "entity"; col["entity"] = ENT[re.search(r"COUNTIF\((ent_\w+),", f).group(1)]
            elif d is not None and d.type == "custom" and "ent_Opp_ID" in f and "ent_Prj_ID" in f: col["type"] = "entity"; col["entity"] = "@any"
            elif d is not None and d.type == "list" and f.startswith('"'): col["type"] = "choice"; col["choices"] = f.strip('"').split(",")
            elif d is not None and d.type == "date": col["type"] = "date"
            elif d is not None and d.type == "decimal": col["type"] = "number"
            elif h == "Email": col["type"] = "email"
            elif h in ("Link", "Website", "LinkedIn URL"): col["type"] = "url"
            elif h in LONG: col["type"] = "longtext"
            else: col["type"] = "text"
            if h in required or h == ws.cell(3, 1).value and L == "A": col["required"] = True
        cols.append(col)
    fp = ws.freeze_panes or "A4"
    frozen = column_index_from_string(re.match(r"[A-Z]+", fp).group(0)) - 1
    tab = ws.sheet_properties.tabColor.rgb[-6:] if ws.sheet_properties.tabColor is not None else None
    title = ws.cell(1, 1).value or name
    desc = ws.cell(2, 1).value or ""
    sheets.append({"name": name, "title": title, "description": desc, "frozen": frozen, "tab": tab, "columns": cols})

# reference lists from named ranges
refs = {}
for n, dn in wb.defined_names.items():
    m = re.match(r"ref_(\w+?)_(ID|Name|IsOpen|MarketID)$", n)
    if m: refs.setdefault(m.group(1), {})[m.group(2)] = dn.attr_text.split("!")[1].replace("$", "")
reflist = []
ws = wb["Reference"]
for lst, parts in refs.items():
    idc = re.match(r"([A-Z]+)", parts["ID"]).group(1)
    title = ws[f"{idc}2"].value or lst
    reflist.append({"list": lst, "title": title, **{k.lower(): re.match(r"([A-Z]+)", v).group(1) for k, v in parts.items()}})

ts = "// Generated by scripts/central/gen_schema.py from the central repository workbook. Do not edit by hand.\n"
ts += "import type { SheetDef, RefListDef } from \"./types\";\n\n"
ts += "export const SHEETS: SheetDef[] = " + json.dumps(sheets, indent=1, ensure_ascii=False) + ";\n\n"
ts += "export const REF_LISTS: RefListDef[] = " + json.dumps(reflist, indent=1, ensure_ascii=False) + ";\n"
open(out, "w", encoding="utf-8").write(ts)
for s in sheets:
    print(s["name"], s["frozen"], s["tab"], " ".join(f'{c["letter"]}:{c["type"]}' + ("*" if c.get("required") else "") + ("~" + str(c.get("mirror", {}).get("letter")) if c.get("mirror") else "") for c in s["columns"]))
print(len(reflist), "ref lists")
