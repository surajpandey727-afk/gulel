"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Download, ExternalLink, FileArchive, FileImage, FileSpreadsheet, FileText, Loader2, Paperclip, Tag, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Tip } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import { createClient } from "@/lib/supabase/client";
import type { FileRow } from "@/lib/orgs/records";
import {
  deleteDocAction, docUrlAction, docUrlsAction, docsAction, finishDocUploadAction, startDocUploadAction, updateDocAction, type DocsBundle,
} from "@/app/(app)/central/doc-actions";

const BUCKET = "org-files";
const MAX = 50 * 1024 * 1024;

/* ---------------------------------------------------------------- row marker */

/** Documents marker at the start of a row: filled with a count when the organisation has documents, faded when it has none. */
export function DocsMarker({ count, enabled, onOpen }: { count: number; enabled: boolean; onOpen: () => void }) {
  if (!enabled) return <span className="w-6" aria-hidden />;
  const has = count > 0;
  const label = has ? `${count} document${count > 1 ? "s" : ""}. Open` : "No documents yet. Upload";
  return (
    <Tip content={label}>
      <button
        type="button" aria-label={label} onClick={(e) => { e.stopPropagation(); onOpen(); }} onMouseDown={(e) => e.stopPropagation()}
        className={cn("inline-flex h-5 min-w-6 items-center justify-center gap-0.5 rounded-full px-1 text-[0.625rem] font-semibold tabular transition-colors",
          has ? "bg-oxblood/12 text-oxblood ring-1 ring-inset ring-oxblood/30 hover:bg-oxblood/20" : "text-ink-3/45 hover:text-oxblood")}
      >
        <Paperclip className="h-3 w-3" aria-hidden />{has ? count : null}
      </button>
    </Tip>
  );
}

/* ---------------------------------------------------------------- helpers */

type Kind = "pdf" | "image" | "word" | "text" | "other";
function kindOf(f: Pick<FileRow, "name" | "mime_type">): Kind {
  const m = (f.mime_type ?? "").toLowerCase(), n = f.name.toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(n)) return "image";
  if (m.includes("wordprocessingml") || n.endsWith(".docx")) return "word";
  if (m.startsWith("text/") || m === "application/json" || /\.(txt|md|csv|json|log|tsv)$/.test(n)) return "text";
  return "other";
}
function FileIcon({ f, className }: { f: FileRow; className?: string }) {
  const k = kindOf(f);
  const Icon = k === "image" ? FileImage : /\.(xlsx?|csv|tsv)$/i.test(f.name) ? FileSpreadsheet : /\.(zip|rar|7z)$/i.test(f.name) ? FileArchive : FileText;
  return <Icon className={className} aria-hidden />;
}
const size = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Word documents are converted to HTML in the browser; strip anything active before rendering it. */
function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,link,meta").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if ((a.name === "href" || a.name === "src") && !/^(https?:|data:image\/|#|mailto:)/i.test(a.value.trim())) el.removeAttribute(a.name);
    }
    if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noreferrer noopener"); }
  });
  return doc.body.innerHTML;
}

/** Opens a tab first (so popup blockers allow it), then points it at the signed link. */
async function openInTab(fileId: string) {
  const w = window.open("", "_blank");
  const r = await docUrlAction(fileId);
  if (!r.ok) { w?.close(); return toast.error(r.error); }
  if (w) { w.opener = null; w.location.href = r.data; } else window.location.assign(r.data);
}
async function downloadOne(fileId: string) {
  const r = await docUrlAction(fileId, true);
  if (!r.ok) return toast.error(r.error);
  const a = document.createElement("a");
  a.href = r.data; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------------------------------------------------------- dialog */

export function DocumentsDialog({ orgKey, title, uploadNow, canWrite, onClose, onCount }: {
  orgKey: string; title: string; uploadNow: boolean; canWrite: boolean; onClose: () => void; onCount: (n: number) => void;
}) {
  const [bundle, setBundle] = useState<DocsBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files = useMemo(() => bundle?.files ?? [], [bundle]);

  useEffect(() => {
    let live = true;
    void docsAction(orgKey).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      setBundle(r.data);
      if (r.data.files[0] && !uploadNow) setViewing(r.data.files[0].id);
    });
    return () => { live = false; };
  }, [orgKey, uploadNow]);
  // A row with no documents opens straight into the file picker.
  useEffect(() => { if (uploadNow && canWrite) input.current?.click(); }, [uploadNow, canWrite]);
  useEffect(() => { if (bundle) onCount(bundle.files.length); }, [bundle, onCount]);

  const setFiles = (next: FileRow[]) => setBundle((b) => (b ? { ...b, files: next } : b));

  const upload = useCallback(async (list: File[]) => {
    if (!bundle || !list.length) return;
    let latest: FileRow[] | null = null;
    for (const f of list) {
      if (f.size > MAX) { toast.error(`${f.name}: files are limited to 50 MB.`); continue; }
      setBusy(`Uploading ${f.name}…`);
      try {
        const s = await startDocUploadAction(bundle.org.id, f.name, f.size);
        if (!s.ok) throw new Error(s.error);
        const { error: ue } = await createClient().storage.from(BUCKET).uploadToSignedUrl(s.data.path, s.data.token, f, { contentType: f.type || "application/octet-stream" });
        if (ue) throw new Error(ue.message);
        const done = await finishDocUploadAction(bundle.org.id, s.data.path, f.name, f.type || null, uploadTags);
        if (!done.ok) throw new Error(done.error);
        latest = done.data;
        setFiles(done.data);
      } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    if (latest) { toast.success(`Uploaded ${list.length} document${list.length > 1 ? "s" : ""}`); setViewing(latest[0]?.id ?? null); }
  }, [bundle, uploadTags]);

  const patch = async (f: FileRow, p: { tags?: string[]; notes?: string | null }) => {
    const before = files;
    setFiles(files.map((x) => (x.id === f.id ? { ...x, ...p } : x)));
    const r = await updateDocAction(f.id, p);
    if (!r.ok) { setFiles(before); toast.error(r.error); }
  };
  const remove = async (f: FileRow) => {
    const r = await deleteDocAction(f.id);
    if (!r.ok) return toast.error(r.error);
    setFiles(files.filter((x) => x.id !== f.id));
    if (viewing === f.id) setViewing(null);
    toast.success(`Removed ${f.name}`);
  };
  const downloadAll = async () => {
    if (!files.length || !bundle) return;
    setBusy(`Preparing ${files.length} documents…`);
    try {
      const r = await docUrlsAction(files.map((f) => f.id));
      if (!r.ok) throw new Error(r.error);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const used = new Set<string>();
      for (const { id, url } of r.data) {
        const f = files.find((x) => x.id === id)!;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${f.name} could not be fetched`);
        let name = f.name, i = 1;
        while (used.has(name.toLowerCase())) name = f.name.replace(/(\.[^.]+)?$/, ` (${i++})$1`);
        used.add(name.toLowerCase());
        zip.file(name, await res.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${bundle.org.name} - documents.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  // Group by the set of tags: each heading says what those documents belong to.
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; files: FileRow[] }>();
    for (const f of files) {
      const tags = [...f.tags].sort((a, b) => a.localeCompare(b));
      const key = tags.map((t) => t.toLowerCase()).join("\u0000");
      if (!m.has(key)) m.set(key, { label: tags.join(" · "), files: [] });
      m.get(key)!.files.push(f);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b))).map(([, g]) => g);
  }, [files]);
  const allTags = useMemo(() => [...new Set(files.flatMap((f) => f.tags))].sort((a, b) => a.localeCompare(b)), [files]);
  const current = files.find((f) => f.id === viewing) ?? null;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onDragOver={(e) => { if (canWrite) { e.preventDefault(); setDrag(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (canWrite) void upload([...e.dataTransfer.files]); }}
          className={cn("fixed inset-2 z-50 mx-auto flex max-w-[1400px] flex-col overflow-hidden rounded-neo bg-canvas neo-raised outline-none sm:inset-6", drag && "ring-2 ring-oxblood/50")}
        >
          <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
            <Paperclip className="h-4 w-4 shrink-0 text-oxblood" aria-hidden />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold text-ink">Documents · {bundle?.org.name ?? title}</Dialog.Title>
              <p className="text-[0.6875rem] text-ink-3">{bundle?.org.key ? `${bundle.org.key} · ` : ""}{files.length} document{files.length === 1 ? "" : "s"} · shared with every row for this organisation and its gulel page</p>
            </div>
            {busy && <span className="inline-flex items-center gap-1.5 text-xs text-ink-2"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{busy}</span>}
            <Button size="sm" onClick={() => void downloadAll()} disabled={!files.length || !!busy}><Download className="h-3.5 w-3.5" aria-hidden />Download all</Button>
            {canWrite && <Button size="sm" variant="primary" onClick={() => input.current?.click()} disabled={!bundle || !!busy}><Upload className="h-3.5 w-3.5" aria-hidden />Upload</Button>}
            <Dialog.Close className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-sunken/70" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            <input ref={input} type="file" multiple hidden onChange={(e) => void upload([...(e.target.files ?? [])])} aria-label="Choose files to upload" />
          </header>

          {error ? <p className="p-6 text-sm text-danger">{error}</p> : !bundle ? (
            <p className="flex items-center gap-2 p-6 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading documents…</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* list grouped by tags */}
              <div className="flex min-h-0 w-full flex-col border-hairline lg:w-[440px] lg:shrink-0 lg:border-r">
                {canWrite && (
                  <div className="border-b border-hairline px-4 py-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3"><Tag className="h-3 w-3" aria-hidden />Tags for new uploads</p>
                    <TagEditor tags={uploadTags} suggestions={allTags} onChange={setUploadTags} placeholder="e.g. Proposal, Research, NDA" />
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {files.length === 0 ? (
                    <button type="button" disabled={!canWrite} onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-neo neo-inset-sm px-4 py-10 text-center text-sm text-ink-2 hover:text-oxblood">
                      <Upload className="h-5 w-5" aria-hidden />No documents yet<span className="text-xs text-ink-3">Click to choose files, or drop them anywhere in this window.</span>
                    </button>
                  ) : groups.map((g) => (
                    <section key={g.label || "untagged"} className="mb-4">
                      <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-ink">
                        <Tag className="h-3.5 w-3.5 text-oxblood" aria-hidden />{g.label || <span className="font-medium text-ink-3">Untagged</span>}
                        <span className="font-normal text-ink-3">{g.files.length}</span>
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {g.files.map((f) => (
                          <DocCard key={f.id} f={f} active={viewing === f.id} canWrite={canWrite} suggestions={allTags}
                            onView={() => setViewing(f.id)} onPatch={(p) => void patch(f, p)} onDelete={() => void remove(f)} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
              {/* viewer */}
              <div className="flex min-h-[50dvh] min-w-0 flex-1 flex-col bg-sunken/40">
                {current ? <Viewer key={current.id} f={current} /> : (
                  <div className="grid flex-1 place-items-center p-8 text-center text-sm text-ink-3">
                    <p>Select a document to preview it here.<br />PDFs, Word (.docx), images and text open inside gulel; anything else opens in a new tab.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DocCard({ f, active, canWrite, suggestions, onView, onPatch, onDelete }: {
  f: FileRow; active: boolean; canWrite: boolean; suggestions: string[]; onView: () => void; onPatch: (p: { tags?: string[]; notes?: string | null }) => void; onDelete: () => void;
}) {
  const [notes, setNotes] = useState(f.notes ?? "");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setNotes(f.notes ?? ""), [f.notes]);
  return (
    <li className={cn("flex flex-col gap-2 rounded-neo-sm bg-canvas p-3 neo-raised-sm", active && "ring-2 ring-oxblood/40")}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onView} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <FileIcon f={f} className="mt-0.5 h-4 w-4 shrink-0 text-oxblood" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink hover:text-oxblood">{f.name}</span>
            <span className="block text-[0.6875rem] text-ink-3">{size(f.size_bytes)} · {when(f.created_at)}{f.via !== "ui" ? ` · by ${f.uploaded_label ?? "agent"}` : ""}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <Tip content="Open in a new tab"><button type="button" aria-label={`Open ${f.name} in a new tab`} onClick={() => void openInTab(f.id)} className="grid h-7 w-7 place-items-center rounded-full text-ink-2 hover:bg-sunken/70 hover:text-oxblood"><ExternalLink className="h-3.5 w-3.5" /></button></Tip>
          <Tip content="Download"><button type="button" aria-label={`Download ${f.name}`} onClick={() => void downloadOne(f.id)} className="grid h-7 w-7 place-items-center rounded-full text-ink-2 hover:bg-sunken/70 hover:text-oxblood"><Download className="h-3.5 w-3.5" /></button></Tip>
          {canWrite && (confirm ? (
            <button type="button" onClick={onDelete} onBlur={() => setConfirm(false)} className="rounded-full px-2 py-1 text-[0.6875rem] font-medium text-danger hover:bg-danger/10">Remove?</button>
          ) : (
            <Tip content="Remove"><button type="button" aria-label={`Remove ${f.name}`} onClick={() => setConfirm(true)} className="grid h-7 w-7 place-items-center rounded-full text-ink-2 hover:bg-sunken/70 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></Tip>
          ))}
        </div>
      </div>
      {canWrite ? <TagEditor tags={f.tags} suggestions={suggestions} onChange={(tags) => onPatch({ tags })} placeholder="Add a tag" /> : f.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">{f.tags.map((t) => <span key={t} className="rounded-full bg-oxblood/10 px-2 py-0.5 text-[0.6875rem] text-oxblood">{t}</span>)}</div>
      )}
      <textarea
        value={notes} readOnly={!canWrite} onChange={(e) => setNotes(e.target.value)} rows={notes ? 3 : 1}
        onBlur={() => { if (canWrite && notes !== (f.notes ?? "")) onPatch({ notes: notes.trim() ? notes : null }); }}
        placeholder={canWrite ? "Notes about this document" : "No notes"} aria-label={`Notes for ${f.name}`}
        className="w-full resize-y rounded-neo-sm neo-inset-sm px-2.5 py-1.5 text-xs leading-relaxed text-ink outline-none placeholder:text-ink-3"
      />
    </li>
  );
}

/** Open string tags: type and press Enter or comma; suggestions come from the organisation's existing tags. */
function TagEditor({ tags, suggestions, onChange, placeholder }: { tags: string[]; suggestions: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [v, setV] = useState("");
  const listId = useMemo(() => `tags-${Math.random().toString(36).slice(2)}`, []);
  const add = () => {
    const t = v.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    setV("");
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-oxblood/10 py-0.5 pl-2 pr-1 text-[0.6875rem] font-medium text-oxblood">
          {t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="grid h-4 w-4 place-items-center rounded-full hover:bg-oxblood/15"><X className="h-2.5 w-2.5" /></button>
        </span>
      ))}
      <input
        value={v} onChange={(e) => setV(e.target.value)} list={listId} placeholder={tags.length ? "" : placeholder} aria-label="Add tag"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !v && tags.length) onChange(tags.slice(0, -1)); }}
        onBlur={add}
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[0.6875rem] text-ink outline-none placeholder:text-ink-3"
      />
      <datalist id={listId}>{suggestions.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

/* ---------------------------------------------------------------- viewer */

type View = { kind: "loading" } | { kind: "pdf" | "image"; url: string } | { kind: "html"; html: string } | { kind: "text"; text: string } | { kind: "other" } | { kind: "error"; message: string };

function Viewer({ f }: { f: FileRow }) {
  const [v, setV] = useState<View>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    const k = kindOf(f);
    (async () => {
      if (k === "other") return setV({ kind: "other" });
      const r = await docUrlAction(f.id);
      if (!r.ok) throw new Error(r.error);
      if (k === "pdf" || k === "image") return live && setV({ kind: k, url: r.data });
      const res = await fetch(r.data);
      if (!res.ok) throw new Error("The document could not be loaded.");
      if (k === "text") {
        const text = await res.text();
        return live && setV({ kind: "text", text: text.length > 2_000_000 ? `${text.slice(0, 2_000_000)}\n…(truncated)` : text });
      }
      const mammoth = (await import("mammoth/mammoth.browser")).default;
      const out = await mammoth.convertToHtml({ arrayBuffer: await res.arrayBuffer() });
      if (live) setV({ kind: "html", html: sanitize(out.value) });
    })().catch((e) => live && setV({ kind: "error", message: (e as Error).message }));
    return () => { live = false; };
  }, [f]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <FileIcon f={f} className="h-4 w-4 shrink-0 text-oxblood" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.name}</span>
        <Button size="sm" onClick={() => void openInTab(f.id)}><ExternalLink className="h-3.5 w-3.5" aria-hidden />New tab</Button>
        <Button size="sm" onClick={() => void downloadOne(f.id)}><Download className="h-3.5 w-3.5" aria-hidden />Download</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {v.kind === "loading" && <p className="flex items-center gap-2 p-6 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Opening…</p>}
        {v.kind === "error" && <p className="p-6 text-sm text-danger">{v.message}</p>}
        {v.kind === "pdf" && <iframe title={f.name} src={v.url} className="h-full min-h-[70dvh] w-full bg-white" />}
        {v.kind === "image" && <div className="grid min-h-full place-items-center p-4">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={v.url} alt={f.name} className="max-h-[75dvh] max-w-full rounded-neo-sm object-contain" /></div>}
        {v.kind === "text" && <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-ink">{v.text}</pre>}
        {v.kind === "html" && <article className="docx-preview mx-auto max-w-3xl bg-white p-8 text-sm leading-relaxed text-[#1a1a1a] shadow-sm sm:my-6 sm:rounded-neo-sm" dangerouslySetInnerHTML={{ __html: v.html }} />}
        {v.kind === "other" && (
          <div className="grid min-h-[50dvh] place-items-center p-8 text-center text-sm text-ink-2">
            <div className="flex flex-col items-center gap-3">
              <FileIcon f={f} className="h-8 w-8 text-ink-3" />
              <p>This file type can&apos;t be previewed inside gulel.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => void openInTab(f.id)}><ExternalLink className="h-3.5 w-3.5" aria-hidden />Open in new tab</Button>
                <Button size="sm" onClick={() => void downloadOne(f.id)}><Download className="h-3.5 w-3.5" aria-hidden />Download</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
