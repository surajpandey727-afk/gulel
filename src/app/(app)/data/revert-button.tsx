"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { revertAction } from "./actions";

export function RevertButton({ batchId }: { batchId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Undo2 className="h-3.5 w-3.5" /> Reverse</Button>
      <Modal open={open} onOpenChange={setOpen} title="Reverse this import?" description="Removes organisations, contacts and channels this batch created, and clears fields it filled on existing records. Records already used in outreach are kept."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => start(async () => {
          const r = await revertAction(batchId);
          setMsg(r.ok ? `Reversed ${r.data.reverted} rows.${r.data.blocked.length ? ` Kept ${r.data.blocked.length} in use.` : ""}` : `⚠ ${r.error}`);
          router.refresh();
        })}>Reverse batch</Button></>}>
        {msg && <p className="text-sm">{msg}</p>}
      </Modal>
    </>
  );
}
