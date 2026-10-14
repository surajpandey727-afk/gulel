"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Input } from "@/components/neo/field";
import { Badge } from "@/components/neo/badge";
import { EmptyState } from "@/components/neo/surface";
import { addTaskAction, setTaskStatusAction } from "./actions";
import { draftConversationAction } from "../inbox/actions";

type T = { id: string; title: string; kind: string; status: string; due_at: string | null; source: string; organisation_id: string | null; conversation_id: string | null; draft_id: string | null; organisations: { trading_name: string } | null };

export function TaskList({ tasks }: { tasks: T[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const now = Date.now();
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await addTaskAction(title, due || null); setTitle(""); setDue(""); router.refresh(); }); }}>
        <Input aria-label="New task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" className="max-w-md" />
        <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44" />
        <Button type="submit" disabled={!title.trim()} loading={pending}><Plus className="h-4 w-4" /> Add</Button>
      </form>
      {note && <p role="status" className="text-sm text-ink-2">{note}</p>}
      {!tasks.length ? <EmptyState title="All clear" /> : (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => {
            const overdue = t.due_at && new Date(t.due_at).getTime() < now;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-neo neo-raised-sm px-4 py-3">
                <IconButton label="Mark done" size="iconSm" onClick={() => start(async () => { await setTaskStatusAction(t.id, "done"); router.refresh(); })}><Check className="h-4 w-4" /></IconButton>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{t.title}</p>
                  <p className="text-xs text-ink-3">{t.kind.replace(/_/g, " ")} · {t.source}{t.organisations ? <> · <Link href={`/organisations/${t.organisation_id}`} className="hover:underline">{t.organisations.trading_name}</Link></> : null}
                    {t.conversation_id && <> · <Link href={`/inbox?c=${t.conversation_id}`} className="hover:underline">conversation</Link></>}{t.draft_id && <> · <Link href={`/outreach/${t.draft_id}`} className="hover:underline">original draft</Link></>}</p>
                </div>
                {t.kind === "follow_up" && t.conversation_id && (
                  <Button size="sm" loading={pending} onClick={() => start(async () => { const r = await draftConversationAction(t.conversation_id!, "follow_up"); if (r.ok && r.draftId) router.push(`/outreach/${r.draftId}`); else setNote(r.ok ? r.message : `⚠ ${r.error}`); })}>Draft follow-up</Button>
                )}
                {t.due_at && <Badge tone={overdue ? "critical" : "neutral"} icon={!!overdue}>{overdue ? "overdue · " : ""}{new Date(t.due_at).toLocaleDateString("en-GB")}</Badge>}
                <IconButton label="Dismiss" size="iconSm" variant="ghost" onClick={() => start(async () => { await setTaskStatusAction(t.id, "dismissed"); router.refresh(); })}><X className="h-4 w-4" /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
