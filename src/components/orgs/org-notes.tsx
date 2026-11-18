"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Bot, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { refreshSoon } from "@/components/orgs/refresh";
import { Button, IconButton } from "@/components/neo/button";
import { Badge } from "@/components/neo/badge";
import { cn } from "@/components/neo/cn";
import { RichEditor, RichView } from "@/components/notes/rich-editor";
import { richToText } from "@/lib/notes/rich";
import { addNoteAction, archiveNoteAction, deleteNoteAction, editNoteAction } from "@/app/(app)/organisations/records-actions";
import type { NoteRow, RepoNote } from "@/lib/orgs/records";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const hasText = (html: string) => richToText(html).trim().length > 0;
const readDraft = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const writeDraft = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage unavailable */ } };

/**
 * One notes log per organisation (and per person), the same component everywhere: the organisation page, a person's
 * page and the Central Repository drawer. Notes are rich text (headings, lists, colour, highlight); long notes show in
 * full up to a generous height, then expand. Archive hides a note without losing it; delete asks first. An unsent
 * note is kept as a draft in this browser, and leaving with unsaved edits asks first.
 */
export function OrgNotes({ organisationId, contactId, initial, canWrite = true, orgNames, compact, repoNotes = [] }: {
  organisationId?: string | null; contactId?: string | null; initial: NoteRow[]; canWrite?: boolean; orgNames?: Record<string, string>; compact?: boolean; repoNotes?: RepoNote[];
}) {
  const router = useRouter();
  const draftKey = `gulel:note-draft:${organisationId ?? ""}:${contactId ?? ""}`;
  const [notes, setNotes] = useState(initial);
  useEffect(() => setNotes(initial), [initial]);
  const [text, setText] = useState("");
  const [composerKey, setComposerKey] = useState(0);
  const [editing, setEditing] = useState<{ id: string; body: string; original: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "delete" | "discard" } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();

  // Restore an unsent draft once on mount.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const d = readDraft(draftKey);
    if (d && hasText(d)) { setText(d); setComposerKey((k) => k + 1); }
  }, [draftKey]);
  useEffect(() => { writeDraft(draftKey, hasText(text) ? text : ""); }, [draftKey, text]);

  const dirty = (editing && editing.body !== editing.original && hasText(editing.body)) || false;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const active = useMemo(() => notes.filter((n) => !n.archived_at), [notes]);
  const archived = useMemo(() => notes.filter((n) => n.archived_at), [notes]);
  // Restoring the last archived note returns to the active list (the switch disappears with nothing archived).
  useEffect(() => { if (showArchived && archived.length === 0) setShowArchived(false); }, [showArchived, archived.length]);
  const shown = showArchived ? archived : active;

  const add = () => start(async () => {
    if (!hasText(text)) return;
    const r = await addNoteAction({ organisationId: organisationId ?? null, contactId: contactId ?? null, body: text });
    if (!r.ok) return void toast.error(r.error);
    setNotes((prev) => {
      const ids = new Set(r.data.map((n) => n.id));
      return [...r.data, ...prev.filter((n) => !ids.has(n.id))].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
    setText(""); writeDraft(draftKey, ""); setComposerKey((k) => k + 1); setShowArchived(false);
    toast.success("Note added");
    refreshSoon(router);
  });
  const save = () => start(async () => {
    if (!editing) return;
    const r = await editNoteAction(editing.id, editing.body);
    if (!r.ok) return void toast.error(r.error);
    setNotes((ns) => ns.map((n) => (n.id === editing.id ? { ...n, body: editing.body, updated_at: new Date().toISOString() } : n)));
    setEditing(null);
    toast.success("Note saved");
    refreshSoon(router);
  });
  const cancelEdit = () => { if (dirty) setConfirm({ id: editing!.id, kind: "discard" }); else setEditing(null); };
  const archive = (id: string, on: boolean) => start(async () => {
    const r = await archiveNoteAction(id, on);
    if (!r.ok) return void toast.error(r.error);
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, archived_at: on ? new Date().toISOString() : null } : n)));
    if (!on) setShowArchived(false);
    toast.success(r.message, on ? { action: { label: "Undo", onClick: () => archive(id, false) } } : undefined);
    refreshSoon(router);
  });
  const remove = (id: string) => start(async () => {
    const r = await deleteNoteAction(id);
    if (!r.ok) return void toast.error(r.error);
    setNotes((ns) => ns.filter((n) => n.id !== id));
    setConfirm(null);
    toast.success("Note deleted");
    refreshSoon(router);
  });

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex flex-col gap-2">
          <RichEditor key={composerKey} value={text} onChange={setText} onSubmit={add} label="New note" expandTitle="New note"
            placeholder="Add a note: research, a call, what to do next…" minHeight={compact ? 72 : 96} compact={compact} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.6875rem] text-ink-3">Shown on this {contactId ? "person" : "organisation"} everywhere in gulel. Ctrl+Enter to save.{hasText(text) ? " Draft kept in this browser until you add it." : ""}</span>
            <span className="flex gap-2">
              {hasText(text) && <Button size="sm" variant="ghost" onClick={() => { setText(""); writeDraft(draftKey, ""); setComposerKey((k) => k + 1); }}>Discard</Button>}
              <Button size="sm" variant="primary" onClick={add} loading={pending && !editing && !confirm} disabled={!hasText(text)}>Add note</Button>
            </span>
          </div>
        </div>
      )}

      {repoNotes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">From the Central Repository</span>
          <ul className="flex flex-col gap-1.5">
            {repoNotes.map((r) => (
              <li key={`${r.sheet}:${r.key}`} className="rounded-neo-sm px-3.5 py-2.5 ring-1 ring-hairline">
                <RichView body={r.note} clampHeight={compact ? 160 : 240} title={`${r.sheet.replace(/_/g, " ")} · ${r.key}`} />
                <Link href={`/central/board/${r.sheet}?q=${encodeURIComponent(r.key)}`} className="mt-1 inline-block text-[0.6875rem] text-ink-3 hover:text-oxblood">
                  {r.sheet.replace(/_/g, " ")} · {r.key}{r.label && r.label !== r.key ? ` · ${r.label}` : ""} · edit on the board
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {archived.length > 0 && (
        <div className="flex items-center gap-1 self-start rounded-full neo-inset-sm p-1 text-xs" role="tablist" aria-label="Note status">
          {[{ v: false, l: `Active (${active.length})` }, { v: true, l: `Archived (${archived.length})` }].map((t) => (
            <button key={String(t.v)} type="button" role="tab" aria-selected={showArchived === t.v} onClick={() => setShowArchived(t.v)}
              className={cn("rounded-full px-3 py-1 font-medium transition-shadow", showArchived === t.v ? "neo-raised-sm text-ink" : "text-ink-3 hover:text-ink")}>{t.l}</button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-ink-3">{showArchived ? "No archived notes." : repoNotes.length ? "No gulel notes yet." : "No notes yet."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((n) => (
            <li key={n.id} className={cn("group rounded-neo neo-inset-sm px-4 py-3", n.archived_at && "opacity-80")}>
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-ink-3">
                {(n.via === "agent" || n.via === "api") && <Bot className="h-3 w-3" aria-hidden />}
                <span className="font-medium text-ink-2">{n.author ?? "Team"}</span><span>·</span><span>{when(n.created_at)}</span>
                {n.updated_at && n.updated_at.slice(0, 16) !== n.created_at.slice(0, 16) && <span>(edited {when(n.updated_at)})</span>}
                {n.archived_at && <Badge tone="muted" icon={false}>archived</Badge>}
                {orgNames && n.organisation_id && orgNames[n.organisation_id] && <Badge tone="muted" icon={false}>{orgNames[n.organisation_id]}</Badge>}
                {canWrite && editing?.id !== n.id && (
                  <span className={cn("ml-auto flex items-center gap-1", confirm?.id === n.id ? "" : "opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100")}>
                    {confirm?.id === n.id && confirm.kind === "delete" ? (
                      <>
                        <span className="text-ink-2">Delete this note? Archive keeps it instead.</span>
                        <Button size="sm" className="h-6 px-2 text-[0.6875rem]" onClick={() => setConfirm(null)}>Keep</Button>
                        <Button size="sm" variant="danger" className="h-6 px-2 text-[0.6875rem]" loading={pending} onClick={() => remove(n.id)}>Delete</Button>
                      </>
                    ) : (
                      <>
                        {!n.archived_at && <IconButton label="Edit note" className="h-7 w-7" onClick={() => setEditing({ id: n.id, body: n.body, original: n.body })}><Pencil className="h-3.5 w-3.5" /></IconButton>}
                        <IconButton label={n.archived_at ? "Restore note" : "Archive note"} className="h-7 w-7" onClick={() => archive(n.id, !n.archived_at)}>{n.archived_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</IconButton>
                        <IconButton label="Delete note" className="h-7 w-7" onClick={() => setConfirm({ id: n.id, kind: "delete" })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                      </>
                    )}
                  </span>
                )}
              </div>
              {editing?.id === n.id ? (
                <div className="flex flex-col gap-2">
                  <RichEditor value={editing.body} onChange={(v) => setEditing((e) => (e ? { ...e, body: v } : e))} autoFocus onSubmit={save} label="Edit note" expandTitle="Edit note" minHeight={120} />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {confirm?.id === n.id && confirm.kind === "discard" ? (
                      <>
                        <span className="mr-auto text-xs text-ink-2">Discard your changes to this note?</span>
                        <Button size="sm" onClick={() => setConfirm(null)}>Keep editing</Button>
                        <Button size="sm" variant="danger" onClick={() => { setConfirm(null); setEditing(null); }}>Discard</Button>
                      </>
                    ) : (
                      <>
                        <span className="mr-auto text-[0.6875rem] text-ink-3">Ctrl+Enter to save</span>
                        <Button size="sm" onClick={cancelEdit}>Cancel</Button>
                        <Button size="sm" variant="primary" onClick={save} loading={pending} disabled={!hasText(editing.body) || editing.body === editing.original}>Save</Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <RichView body={n.body} clampHeight={compact ? 220 : 420} title={`Note by ${n.author ?? "Team"} · ${when(n.created_at)}`} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
