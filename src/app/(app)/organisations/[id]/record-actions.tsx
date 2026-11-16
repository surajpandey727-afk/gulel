"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Layers, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { refreshSoon } from "@/components/orgs/refresh";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { addOrgToCentralAction, archiveOrgAction, deleteOrgAction } from "../records-actions";

export function ArchiveOrgButton({ organisationId, archived, name }: { organisationId: string; archived: boolean; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = await archiveOrgAction(organisationId, !archived);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message);
    setOpen(false);
    refreshSoon(router);
  });
  if (archived) return <Button size="sm" onClick={run} loading={pending}><ArchiveRestore className="h-3.5 w-3.5" aria-hidden />Reinstate</Button>;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Archive className="h-3.5 w-3.5" aria-hidden />Archive</Button>
      <Modal open={open} onOpenChange={setOpen} title={`Archive ${name}?`} description="Archived organisations leave your working lists, the board and the qualification queue, but nothing is lost."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={pending} onClick={run}>Archive</Button></>}>
        <p className="text-sm text-ink-2">People, notes, files, evidence and history stay attached. Reinstate it any time from this page or the Archived filter. The Central Repository and the Google Sheet mark it Archived too.</p>
      </Modal>
    </>
  );
}

export function DeleteOrgButton({ organisationId, name, deleted }: { organisationId: string; name: string; deleted: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = await deleteOrgAction(organisationId, deleted);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message);
    setOpen(false);
    if (deleted) refreshSoon(router); else router.push("/organisations");
  });
  if (deleted) return <Button size="sm" onClick={run} loading={pending}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Restore</Button>;
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</Button>
      <Modal open={open} onOpenChange={setOpen} title={`Delete ${name}?`} description="Removes it from gulel, the Central Repository and the Google Sheet."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={pending} onClick={run}>Delete</Button></>}>
        <p className="text-sm text-ink-2">It can be restored from the Deleted filter on Organisations or the board&apos;s trash. If pipeline or partner rows still point at it, deleting is blocked: archive it instead.</p>
      </Modal>
    </>
  );
}

export function AddToCentralButton({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" loading={pending} onClick={() => start(async () => {
      const r = await addOrgToCentralAction(organisationId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      refreshSoon(router);
    })}><Layers className="h-3.5 w-3.5" aria-hidden />Add to Central Repository</Button>
  );
}
