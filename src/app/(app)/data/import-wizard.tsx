"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Select } from "@/components/neo/field";
import { Badge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { cn } from "@/components/neo/cn";
import { IMPORT_FIELDS, type ImportField, type MappingProposal } from "@/lib/import/mapping";
import { commitAction, mappingAction, previewAction, uploadAction } from "./actions";

type Step = "upload" | "sheet" | "map" | "preview" | "done";
type PreviewRow = { id: string; row_number: number; action: string; status: string; errors: string[]; warnings: string[]; normalised: { company: string | null; contactName: string | null; email: string | null; emailQuality: string | null; market: string | null; matchId: string | null; resolution: { decision: string } | null } };

const STAT_LABELS: Array<[string, string]> = [
  ["rows", "Rows"], ["create_org", "New organisations"], ["merge_org", "Matched existing (strong id)"], ["propose_merge", "Possible matches to review"],
  ["new_contacts", "New contacts"], ["duplicate_contacts", "Duplicate contacts skipped"], ["named_emails", "Named-person emails"], ["generic_inboxes", "Generic inboxes"],
  ["missing_email", "Contacts missing email"], ["uk", "UK rows"], ["india", "India rows"], ["unknown_market", "Market unknown"],
  ["existing_relationships", "Existing relationships"], ["previously_contacted", "Previously contacted"], ["active_conversations", "Already in conversation"], ["errors", "Rows with errors"],
];

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Array<{ name: string; rows: number; headers: string[] }>>([]);
  const [sheet, setSheet] = useState<string>("");
  const [proposal, setProposal] = useState<MappingProposal[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | null>>({});
  const [sample, setSample] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<{ stats: Record<string, number>; rows: PreviewRow[] } | null>(null);
  const [reject, setReject] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "issues" | "proposed">("issues");

  const upload = (file: File) => start(async () => {
    setError(null);
    const fd = new FormData(); fd.set("file", file);
    const r = await uploadAction(fd);
    if (!r.ok) return setError(r.error);
    setBatchId(r.data.batchId); setSheets(r.data.sheets);
    const first = r.data.sheets.find((s) => s.rows > 0);
    if (r.data.sheets.length === 1 && first) chooseSheet(r.data.batchId, first.name); else setStep("sheet");
  });

  const chooseSheet = (bid: string, name: string) => start(async () => {
    setError(null); setSheet(name);
    const r = await mappingAction(bid, name);
    if (!r.ok) return setError(r.error);
    setProposal(r.data.proposal); setSample(r.data.sample);
    setMapping(Object.fromEntries(r.data.proposal.map((p) => [p.header, p.field])));
    setStep("map");
  });

  const runPreview = () => start(async () => {
    setError(null);
    const r = await previewAction(batchId!, sheet, mapping);
    if (!r.ok) return setError(r.error);
    setPreview(r.data as never); setStep("preview");
  });

  const commit = () => start(async () => {
    setError(null);
    const r = await commitAction(batchId!, Array.from(reject));
    if (!r.ok) return setError(r.error);
    setStep("done"); router.refresh();
  });

  const steps: Step[] = ["upload", "sheet", "map", "preview", "done"];
  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Import steps">
        {["Upload", "Worksheet", "Map columns", "Preview & resolve", "Committed"].map((l, i) => (
          <li key={l} className={cn("rounded-full px-3 py-1", steps.indexOf(step) === i ? "neo-accent" : steps.indexOf(step) > i ? "neo-raised-sm text-ink-2" : "neo-inset-sm text-ink-3")}>{i + 1}. {l}</li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm text-oxblood">⚠ {error}</p>}

      {step === "upload" && (
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center gap-3 rounded-neo-lg px-6 py-14 text-center transition-shadow", drag ? "neo-raised-lg" : "neo-inset")}>
          <span className="grid h-14 w-14 place-items-center rounded-full neo-raised"><Upload className="h-6 w-6 text-oxblood" /></span>
          <span className="font-medium">{pending ? "Reading workbook…" : "Drop your XLSX or CSV here, or click to choose"}</span>
          <span className="max-w-md text-sm text-ink-3">Companies, clients and partial contacts across the UK and India. Column names don’t need to match anything — you’ll confirm the mapping.</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      )}

      {step === "sheet" && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <li key={s.name}><button type="button" disabled={!s.rows || pending} onClick={() => chooseSheet(batchId!, s.name)} className="flex w-full items-center gap-3 rounded-neo-lg neo-raised-sm p-4 text-left disabled:opacity-50">
              <FileSpreadsheet className="h-5 w-5 text-oxblood" /><span><span className="block font-medium">{s.name}</span><span className="text-xs text-ink-3">{s.rows} rows · {s.headers.length} columns</span></span>
            </button></li>
          ))}
        </ul>
      )}

      {step === "map" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">Proposed mapping for <strong>{sheet}</strong>. Check each column — nothing is imported until you preview and commit.</p>
          <Table>
            <thead><tr><Th>Your column</Th><Th>Sample values</Th><Th>Maps to</Th><Th className="text-right">Confidence</Th></tr></thead>
            <tbody>{proposal.map((p) => (
              <Tr key={p.header}>
                <Td className="font-medium text-ink">{p.header}</Td>
                <Td className="max-w-xs truncate text-xs">{p.sample.slice(0, 3).join(" · ") || "—"}</Td>
                <Td><Select aria-label={`Map ${p.header}`} value={mapping[p.header] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [p.header]: (e.target.value || null) as ImportField | null }))} className="h-9 min-w-48">
                  <option value="">— Ignore —</option>
                  {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => <option key={f} value={f}>{IMPORT_FIELDS[f].label}</option>)}
                </Select></Td>
                <Td className="tabular text-right text-xs">{p.field ? `${Math.round(p.confidence * 100)}%` : "—"}</Td>
              </Tr>
            ))}</tbody>
          </Table>
          <details className="text-xs text-ink-3"><summary className="cursor-pointer">Raw sample ({sample.length} rows)</summary><pre className="mt-2 max-h-60 overflow-auto rounded-neo neo-inset-sm p-3">{JSON.stringify(sample, null, 1)}</pre></details>
          <div className="flex gap-2"><Button onClick={() => setStep(sheets.length > 1 ? "sheet" : "upload")}>Back</Button><Button variant="primary" loading={pending} onClick={runPreview}>Normalise &amp; preview</Button></div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {STAT_LABELS.map(([k, l]) => (
              <div key={k} className="rounded-neo neo-inset-sm p-3"><dt className="text-[0.68rem] leading-tight text-ink-3">{l}</dt><dd className="tabular mt-1 text-lg font-semibold">{preview.stats[k] ?? 0}</dd></div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["issues", "proposed", "all"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1", filter === f ? "neo-raised-sm text-oxblood" : "text-ink-3")}>{f === "issues" ? "Errors & warnings" : f === "proposed" ? "Possible matches" : "All rows"}</button>)}
            <span className="ml-auto text-ink-3">Showing first 300 rows</span>
          </div>
          <Table>
            <thead><tr><Th>Row</Th><Th>Company</Th><Th>Contact</Th><Th>Market</Th><Th>Action</Th><Th>Notes</Th></tr></thead>
            <tbody>
              {preview.rows.filter((r) => filter === "all" || (filter === "issues" ? r.errors.length || r.warnings.length : r.normalised?.resolution?.decision === "propose")).map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular text-xs">{r.row_number}</Td>
                  <Td className="text-ink">{r.normalised?.company ?? "—"}</Td>
                  <Td className="text-xs">{r.normalised?.contactName ?? "—"}<span className="block font-mono text-ink-3">{r.normalised?.email}</span></Td>
                  <Td className="text-xs">{r.normalised?.market ?? "?"}</Td>
                  <Td>
                    {r.action === "error" ? <Badge tone="critical">error</Badge>
                      : r.normalised?.resolution?.decision === "propose" ? (
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--brand-oxblood)]" checked={!reject.has(r.id)} onChange={(e) => setReject((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.id); else n.add(r.id); return n; })} /> merge with existing</label>
                      ) : <Badge tone={r.action === "merge" ? "neutral" : "positive"} icon={false}>{r.action === "merge" ? "enrich existing" : "create"}</Badge>}
                  </Td>
                  <Td className="text-xs">{[...r.errors.map((e) => <span key={e} className="block text-oxblood">✕ {e}</span>), ...r.warnings.map((w) => <span key={w} className="block text-warning">! {w}</span>)]}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="text-xs text-ink-3">Existing values are never overwritten — imports only fill empty fields. Imported emails stay “candidate” until verified.</p>
          <div className="flex gap-2"><Button onClick={() => setStep("map")}>Back to mapping</Button><Button variant="primary" loading={pending} onClick={commit}>Commit import</Button></div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-start gap-3 rounded-neo neo-inset-sm p-5">
          <p className="font-medium text-positive">✓ Import committed. You can reverse it from Import history below.</p>
          <div className="flex gap-2"><Button variant="primary" onClick={() => router.push("/organisations")}>View organisations</Button><Button onClick={() => { setStep("upload"); setPreview(null); setBatchId(null); }}>Import another file</Button></div>
        </div>
      )}
    </div>
  );
}
