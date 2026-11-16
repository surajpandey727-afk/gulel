"""Split packed cells into one-data-point-per-cell columns. New columns are appended
after 'Row check' so no existing formula, validation or named range shifts."""
import re, sys, copy
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation

src, dst = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src)
LAST = 103

def add_col(ws, header, choices=None, width=16):
    col = ws.max_column + 1
    h = ws.cell(3, col, header)
    ref = ws.cell(3, col - 1)
    h.font, h.fill, h.alignment, h.border = copy.copy(ref.font), copy.copy(ref.fill), copy.copy(ref.alignment), copy.copy(ref.border)
    letter = h.column_letter
    ws.column_dimensions[letter].width = width
    if choices:
        dv = DataValidation(type="list", formula1='"' + ",".join(choices) + '"', allow_blank=True)
        dv.add(f"{letter}4:{letter}{LAST}")
        ws.add_data_validation(dv)
    return col

def header_col(ws, name):
    return next(c.column for c in ws[3] if c.value == name)

changes = []
def setv(ws, r, c, v):
    old = ws.cell(r, c).value
    if old != v:
        ws.cell(r, c).value = v
        changes.append(f"{ws.title}!{ws.cell(r, c).coordinate}: {old!r} -> {v!r}")

# Pipelines: "(to be qualified)" -> Qualification column
for name in ("Pipeline_India", "Pipeline_Global"):
    ws = wb[name]
    q = add_col(ws, "Qualification", ["To be qualified", "Qualified", "Disqualified"], 16)
    opp = header_col(ws, "Opportunity")
    for r in range(4, LAST + 1):
        v = ws.cell(r, opp).value
        if isinstance(v, str):
            m = re.match(r"^(.*?)\s*\((to be qualified)\)\s*$", v, re.I)
            if m:
                setv(ws, r, opp, m.group(1))
                setv(ws, r, q, "To be qualified")

# Projects: client code in name, scope after colon
ws = wb["Projects"]
scope = add_col(ws, "Scope", None, 34)
pc = header_col(ws, "Project")
for r in range(4, LAST + 1):
    v = ws.cell(r, pc).value
    if not isinstance(v, str):
        continue
    nv = re.sub(r"\s*\((CHUK)\)\s*$", "", v)
    if ":" in nv:
        name, sc = nv.split(":", 1)
        nv = name.strip()
        setv(ws, r, scope, sc.strip()[:1].upper() + sc.strip()[1:])
    setv(ws, r, pc, nv)

# Organisations: legal-name caveat
ws = wb["Organisations"]
conf = add_col(ws, "Legal name confirmed", ["Y", "N"], 12)
lc = header_col(ws, "Legal name")
for r in range(4, LAST + 1):
    v = ws.cell(r, lc).value
    if isinstance(v, str):
        m = re.match(r"^(.*?)\s*\((registered name to be confirmed)\)\s*$", v, re.I)
        if m:
            setv(ws, r, lc, m.group(1))
            setv(ws, r, conf, "N")
# Organisations: links and archive state (one data point per cell; filled by gulel / the agent)
add_col(ws, "Website", None, 26)
add_col(ws, "LinkedIn URL", None, 34)
add_col(ws, "Archived", ["Y", "N"], 10)

# Contacts: nickname, secondary role, unconfirmed role
ws = wb["Contacts"]
pref = add_col(ws, "Preferred name", None, 14)
sec = add_col(ws, "Secondary role", None, 26)
rconf = add_col(ws, "Role confirmed", ["Y", "N"], 12)
nc, rc = header_col(ws, "Name"), header_col(ws, "Role")
for r in range(4, LAST + 1):
    n = ws.cell(r, nc).value
    if isinstance(n, str):
        m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", n)
        if m:
            setv(ws, r, nc, m.group(1)); setv(ws, r, pref, m.group(2))
    role = ws.cell(r, rc).value
    if not isinstance(role, str):
        continue
    m = re.match(r"^Possibly\s+(.*?)\s*\(unconfirmed\)\s*$", role, re.I)
    if m:
        v = m.group(1); setv(ws, r, rc, v[:1].upper() + v[1:]); setv(ws, r, rconf, "N"); continue
    m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", role)
    if m:
        setv(ws, r, rc, m.group(1)); setv(ws, r, sec, m.group(2)); continue
    if ";" in role:
        a, b = role.split(";", 1)
        b = re.sub(r"^\s*also\s+", "", b.strip(), flags=re.I)
        setv(ws, r, rc, a.strip()); setv(ws, r, sec, b[:1].upper() + b[1:])

wb.save(dst)
print("\n".join(changes))
print(f"{len(changes)} cells changed")
