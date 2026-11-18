"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Combine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/neo/button";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { Modal } from "@/components/neo/controls";
import { cn } from "@/components/neo/cn";
import { refreshSoon } from "@/components/orgs/refresh";
import type { DupGroup, DupOrg } from "@/lib/orgs/records";
import { duplicatesAction, mergeOrgsAction } from "./records-actions";

/** Header button: finds likely duplicates and opens the review window. */
export function DuplicatesButton() {
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { void duplicatesAction().then((r) => { if (r.ok) setGroups(r.data); }); }, []);
  if (!groups?.length) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Combine className="h-3.5 w-3.5" aria-hidden />Possible duplicates · {groups.length}</Button>
      {open && <MergeDialog groups={groups} onClose={(changed) => { setOpen(false); if (changed) void duplicatesAction().then((r) => { if (r.ok) setGroups(r.data); }); }} />}
    </>
  );
}

/**
 * Review and merge duplicates. For each group pick the record to keep; ticked records merge into it. Everything attached
 * (people, notes, documents, research, scores, drafts, conversations, pipeline links) moves across, blank fields on the kept
 * record are filled from the others, their names become aliases, and the merged records are retired (not erased).
 */
export function MergeDialog({ groups, onClose }: { groups: DupGroup[]; onClose: (changed: boolean) => void }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [changed, setChanged] = useState(false);
  const g = groups[i];
  const [choice, setChoice] = useState<{ group: number; keep: string; drop: Set<string> } | null>(null);
  const [pending, start] = useTransition();
  if (!g) return null;
  // Selection belongs to the group on screen; moving to the next group starts from its suggestion.
  const current = choice && choice.group === i && g.orgs.some((o) => o.id === choice.keep) ? choice : { group: i, keep: g.orgs[0].id, drop: new Set(g.orgs.slice(1).map((o) => o.id)) };
  const keep = current.keep, drop = current.drop;
  const setKeep = (id: string) => setChoice({ group: i, keep: id, drop: new Set(g.orgs.filter((x) => x.id !== id).map((x) => x.id)) });
  const setDrop = (fn: (s: Set<string>) => Set<string>) => setChoice({ group: i, keep, drop: fn(drop) });
  const k = g.orgs.find((o) => o.id === keep) ?? g.orgs[0];
  const drops = g.orgs.filter((o) => o.id !== keep && drop.has(o.id));
  const clash = k.crKey && drops.find((o) => o.crKey);
  const go = () => start(async () => {
    const r = await mergeOrgsAction(keep, drops.map((o) => o.id));
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message);
    setChanged(true);
    refreshSoon(router);
    if (i < groups.length - 1) setI(i + 1); else onClose(true);
  });
  const Stat = ({ o }: { o: DupOrg }) => <span className="text-[0.6875rem] text-ink-3">{o.contacts} people · {o.notes} notes · {o.files} documents · {o.evidence} research{o.score !== null ? ` · score ${o.score}` : ""}</span>;
  return (
    <Modal open wide onOpenChange={(o) => { if (!o) onClose(changed); }} title={groups.length > 1 ? `Possible duplicates · ${i + 1} of ${groups.length}` : "Merge organisations"}
      description={`${g.reason}. Choose the record to keep; ticked records merge into it.`}
      footer={<>
        {groups.length > 1 && <Button variant="ghost" onClick={() => (i < groups.length - 1 ? setI(i + 1) : onClose(changed))}>{i < groups.length - 1 ? "Not duplicates, next" : "Done"}</Button>}
        <Button variant="primary" loading={pending} disabled={!drops.length || !!clash} onClick={go}><Combine className="h-3.5 w-3.5" aria-hidden />Merge {drops.length || ""} into {k.name}</Button>
      </>}>
      <div className="flex flex-col gap-2">
        {g.orgs.map((o) => {
          const isKeep = o.id === keep;
          return (
            <div key={o.id} className={cn("flex items-start gap-3 rounded-neo px-3.5 py-3", isKeep ? "neo-raised-sm ring-1 ring-oxblood/30" : "neo-inset-sm")}>
              <label className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] font-medium text-ink-2">
                <input type="radio" name="keep" checked={isKeep} onChange={() => setKeep(o.id)} className="accent-[var(--brand-oxblood)]" />Keep
              </label>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  <a href={`/organisations/${o.id}`} target="_blank" rel="noreferrer" className="hover:text-oxblood">{o.name}</a>
                  <MarketBadge market={o.market} />
                  {o.crKey && <Badge tone="neutral" icon={false}>{o.crKey}</Badge>}
                  {o.archived && <Badge tone="muted" icon={false}>archived</Badge>}
                  {o.domain && <span className="text-[0.6875rem] font-normal text-ink-3">{o.domain}</span>}
                </p>
                <Stat o={o} />
              </div>
              {!isKeep && (
                <label className="flex items-center gap-1.5 text-xs text-ink-2">
                  <input type="checkbox" checked={drop.has(o.id)} onChange={(e) => setDrop((s) => { const n = new Set(s); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n; })} className="accent-[var(--brand-oxblood)]" />Merge in
                </label>
              )}
            </div>
          );
        })}
        {clash ? (
          <p className="rounded-neo-sm bg-warning/10 px-3 py-2 text-xs text-ink-2">{k.name} ({k.crKey}) and {clash.name} ({clash.crKey}) are both rows in the Central Repository. Delete or merge one of those rows on the board first, then merge here.</p>
        ) : drops.length > 0 && (
          <p className="text-xs text-ink-3">Moves everything attached to {drops.map((o) => o.name).join(", ")} onto {k.name}, fills its empty fields, keeps the merged names as aliases, and retires the duplicates (recorded in the audit log). This can&apos;t be undone automatically.</p>
        )}
        {pending && <p className="flex items-center gap-2 text-xs text-ink-3"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Merging…</p>}
      </div>
    </Modal>
  );
}
