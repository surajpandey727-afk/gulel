"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { refreshSoon } from "@/components/orgs/refresh";
import { Button, IconButton } from "@/components/neo/button";
import { Textarea } from "@/components/neo/field";
import { Badge } from "@/components/neo/badge";
import { cn } from "@/components/neo/cn";
import { addNoteAction, deleteNoteAction, editNoteAction } from "@/app/(app)/organisations/records-actions";
import type { NoteRow, RepoNote } from "@/lib/orgs/records";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * One notes log per organisation (and per person), the same component everywhere: the organisation page,
 * a person's page, and the Central Repository board. `orgNames` labels notes that belong to a linked
 * organisation when shown on a person's page.
 */
export function OrgNotes({ organisationId, contactId, initial, canWrite = true, orgNames, compact, repoNotes = [] }: {
  organisationId?: string | null; contactId?: string | null; initial: NoteRow[]; canWrite?: boolean; orgNames?: Record<string, string>; compact?: boolean; repoNotes?: RepoNote[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () => start(async () => {
    const r = await addNoteAction({ organisationId: organisationId ?? null, contactId: contactId ?? null, body: text });
    if (!r.ok) return void toast.error(r.error);
    setNotes((prev) => {
      const ids = new Set(r.data.map((n) => n.id));
      return [...r.data, ...prev.filter((n) => !ids.has(n.id))].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
    setText("");
    refreshSoon(router);
  });
  const save = () => start(async () => {
    if (!editing) return;
    const r = await editNoteAction(editing.id, editing.body);
    if (!r.ok) return void toast.error(r.error);
    setNotes((ns) => ns.map((n) => (n.id === editing.id ? { ...n, body: editing.body.trim(), updated_at: new Date().toISOString() } : n)));
    setEditing(null);
    refreshSoon(router);
  });
  const remove = (id: string) => start(async () => {
    const r = await deleteNoteAction(id);
    if (!r.ok) return void toast.error(r.error);
    setNotes((ns) => ns.filter((n) => n.id !== id));
    setConfirmDelete(null);
    refreshSoon(router);
  });

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex flex-col gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 3} placeholder="Add a note: research, a call, what to do next…" aria-label="New note"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) { e.preventDefault(); add(); } }} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.6875rem] text-ink-3">Shown on this organisation everywhere in gulel. Ctrl+Enter to save.</span>
            <Button size="sm" variant="primary" onClick={add} loading={pending && !editing && !confirmDelete} disabled={!text.trim()}>Add note</Button>
          </div>
        </div>
      )}
      {repoNotes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">From the Central Repository</span>
          <ul className="flex flex-col gap-1.5">
            {repoNotes.map((r) => (
              <li key={`${r.sheet}:${r.key}`} className="rounded-neo-sm px-3 py-2 text-sm ring-1 ring-hairline">
                <p className="whitespace-pre-wrap text-ink-2">{r.note}</p>
                <Link href={`/central/board/${r.sheet}?q=${encodeURIComponent(r.key)}`} className="mt-1 inline-block text-[0.6875rem] text-ink-3 hover:text-oxblood">
                  {r.sheet.replace(/_/g, " ")} · {r.key}{r.label && r.label !== r.key ? ` · ${r.label}` : ""} · edit on the board
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-ink-3">{repoNotes.length ? "No gulel notes yet." : "No notes yet."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-neo-sm neo-inset-sm px-3 py-2.5">
              {editing?.id === n.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea autoFocus value={editing.body} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} rows={3} aria-label="Edit note" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    <Button size="sm" variant="primary" onClick={save} loading={pending} disabled={!editing.body.trim()}>Save</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-ink-3">
                    {(n.via === "agent" || n.via === "api") && <Bot className="h-3 w-3" aria-hidden />}
                    <span>{n.author ?? "Team"}</span><span>·</span><span>{when(n.created_at)}</span>
                    {n.updated_at && n.updated_at.slice(0, 16) !== n.created_at.slice(0, 16) && <span>(edited)</span>}
                    {orgNames && n.organisation_id && orgNames[n.organisation_id] && <Badge tone="muted" icon={false}>{orgNames[n.organisation_id]}</Badge>}
                    {canWrite && (
                      <span className={cn("ml-auto flex gap-1", confirmDelete === n.id ? "" : "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100")}>
                        {confirmDelete === n.id ? (
                          <>
                            <span className="self-center">Delete this note?</span>
                            <Button size="sm" className="h-6 px-2 text-[0.6875rem]" onClick={() => setConfirmDelete(null)}>Keep</Button>
                            <Button size="sm" variant="danger" className="h-6 px-2 text-[0.6875rem]" loading={pending} onClick={() => remove(n.id)}>Delete</Button>
                          </>
                        ) : (
                          <>
                            <IconButton label="Edit note" className="h-6 w-6" onClick={() => setEditing({ id: n.id, body: n.body })}><Pencil className="h-3 w-3" /></IconButton>
                            <IconButton label="Delete note" className="h-6 w-6" onClick={() => setConfirmDelete(n.id)}><Trash2 className="h-3 w-3" /></IconButton>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
