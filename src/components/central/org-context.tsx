"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ExternalLink, Link2 } from "lucide-react";
import { Badge } from "@/components/neo/badge";
import { BAND_LABEL } from "@/lib/scoring/model";
import { OrgNotes } from "@/components/orgs/org-notes";
import { OrgFiles } from "@/components/orgs/org-files";
import { orgContextAction, type OrgContext } from "@/app/(app)/organisations/records-actions";


/** The gulel organisation behind a board row: LinkedIn, qualification, notes and files — the same data as its gulel page. */
export function OrgContextPanel({ orgKey, canWrite }: { orgKey: string; canWrite: boolean }) {
  const [ctx, setCtx] = useState<OrgContext | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setCtx(undefined); setErr(null);
    void orgContextAction(orgKey).then((r) => { if (!live) return; if (r.ok) setCtx(r.data); else setErr(r.error); });
    return () => { live = false; };
  }, [orgKey]);

  if (err) return <p className="text-xs text-danger">{err}</p>;
  if (ctx === undefined) return <p className="text-xs text-ink-3">Loading the organisation…</p>;
  if (ctx === null) return <p className="text-xs text-ink-3">{orgKey} isn&apos;t linked to a gulel organisation yet. It links on the next sync.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Link href={`/organisations/${ctx.id}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-oxblood"><Building2 className="h-3.5 w-3.5" aria-hidden />{ctx.name} in gulel</Link>
        {ctx.linkedin
          ? <a href={ctx.linkedin} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 hover:text-oxblood"><Link2 className="h-3.5 w-3.5" aria-hidden />LinkedIn<ExternalLink className="h-3 w-3" aria-hidden /></a>
          : <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Link2 className="h-3.5 w-3.5" aria-hidden />LinkedIn not found yet</span>}
        {ctx.website && <a href={ctx.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 hover:text-oxblood">Website<ExternalLink className="h-3 w-3" aria-hidden /></a>}
        {ctx.archived && <Badge tone="warning" icon={false}>archived</Badge>}
      </div>
      <div className="rounded-neo-sm neo-inset-sm px-3 py-2.5 text-sm">
        <span className="eyebrow mr-2">Gulel qualification</span>
        {ctx.qualification
          ? <span className="text-ink"><span className="font-semibold tabular">{Math.round(ctx.qualification.score)}</span> · {BAND_LABEL[ctx.qualification.band] ?? ctx.qualification.band}</span>
          : <span className="text-ink-3">Not qualified yet</span>}
      </div>
      <section>
        <h3 className="eyebrow mb-2">Notes</h3>
        <OrgNotes organisationId={ctx.id} initial={ctx.notes} canWrite={canWrite} compact repoNotes={ctx.repoNotes} />
      </section>
      <section>
        <h3 className="eyebrow mb-2">Files</h3>
        <OrgFiles organisationId={ctx.id} initial={ctx.files} canWrite={canWrite} compact />
      </section>
    </div>
  );
}
