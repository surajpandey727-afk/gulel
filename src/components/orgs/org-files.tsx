"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Download, Eye, FileText, Paperclip, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { refreshSoon } from "@/components/orgs/refresh";
import { Button, IconButton } from "@/components/neo/button";
import { cn } from "@/components/neo/cn";
import { createClient } from "@/lib/supabase/client";
import { deleteFileAction, fileUrlAction, finishUploadAction, startUploadAction } from "@/app/(app)/organisations/records-actions";
import type { FileRow } from "@/lib/orgs/records";

const BUCKET = "org-files";
const MAX = 50 * 1024 * 1024;
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Research files for one organisation: the same list on the organisation page, people pages and the board. */
export function OrgFiles({ organisationId, initial, canWrite = true, compact }: { organisationId: string; initial: FileRow[]; canWrite?: boolean; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    for (const f of arr) {
      if (f.size > MAX) { toast.error(`${f.name} is over 50 MB.`); continue; }
      setBusy(`Uploading ${f.name}…`);
      try {
        const s = await startUploadAction(organisationId, f.name, f.size);
        if (!s.ok) throw new Error(s.error);
        const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(s.data.path, s.data.token, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(error.message);
        const r = await finishUploadAction(organisationId, s.data.path, f.name, f.type || null);
        if (!r.ok) throw new Error(r.error);
        setFiles(r.data);
        toast.success(`Uploaded ${f.name}`);
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    refreshSoon(router);
  };

  const open = (id: string, download: boolean) => start(async () => {
    const r = await fileUrlAction(id, download);
    if (!r.ok) return void toast.error(r.error);
    window.open(r.data, "_blank", "noopener,noreferrer");
  });
  const remove = (id: string) => start(async () => {
    const r = await deleteFileAction(id);
    if (!r.ok) return void toast.error(r.error);
    setFiles((fs) => fs.filter((f) => f.id !== id));
    setConfirmDelete(null);
    refreshSoon(router);
  });

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
          className={cn("flex flex-wrap items-center justify-between gap-3 rounded-neo-sm px-3 py-2.5 neo-inset-sm transition-colors", drag && "ring-2 ring-oxblood/40")}
        >
          <span className="flex items-center gap-2 text-xs text-ink-3"><UploadCloud className="h-4 w-4" aria-hidden />{busy ?? (compact ? "Drop files here" : "Drop research files here, or choose them. Up to 50 MB each.")}</span>
          <input ref={input} type="file" multiple className="sr-only" aria-label="Choose files to upload" onChange={(e) => e.target.files && void upload(e.target.files)} />
          <Button size="sm" onClick={() => input.current?.click()} loading={!!busy}><Paperclip className="h-3.5 w-3.5" aria-hidden />Upload</Button>
        </div>
      )}
      {files.length === 0 ? (
        <p className="text-sm text-ink-3">No files yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 rounded-neo-sm px-2 py-1.5 hover:neo-inset-sm">
              <FileText className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <button type="button" onClick={() => open(f.id, false)} className="truncate text-left text-sm text-ink hover:text-oxblood" title={f.name}>{f.name}</button>
                {(f.tags?.length > 0 || f.notes) && (
                  <span className="flex min-w-0 flex-wrap items-center gap-1 text-[0.6875rem] text-ink-3">
                    {f.tags?.map((t) => <span key={t} className="rounded-full bg-oxblood/10 px-1.5 text-oxblood">{t}</span>)}
                    {f.notes && <span className="truncate" title={f.notes}>{f.notes}</span>}
                  </span>
                )}
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-[0.6875rem] text-ink-3 sm:flex">
                {f.via !== "ui" && <Bot className="h-3 w-3" aria-hidden />}{f.via !== "ui" ? (f.uploaded_label ?? "AI agent") : ""}{f.via !== "ui" ? " · " : ""}{size(f.size_bytes)} · {when(f.created_at)}
              </span>
              {confirmDelete === f.id ? (
                <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-ink-3">
                  Remove?
                  <Button size="sm" className="h-6 px-2 text-[0.6875rem]" onClick={() => setConfirmDelete(null)}>Keep</Button>
                  <Button size="sm" variant="danger" className="h-6 px-2 text-[0.6875rem]" loading={pending} onClick={() => remove(f.id)}>Remove</Button>
                </span>
              ) : (
                <span className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                  <IconButton label={`View ${f.name}`} className="h-6 w-6" onClick={() => open(f.id, false)}><Eye className="h-3 w-3" /></IconButton>
                  <IconButton label={`Download ${f.name}`} className="h-6 w-6" onClick={() => open(f.id, true)}><Download className="h-3 w-3" /></IconButton>
                  {canWrite && <IconButton label={`Remove ${f.name}`} className="h-6 w-6" onClick={() => setConfirmDelete(f.id)}><Trash2 className="h-3 w-3" /></IconButton>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
