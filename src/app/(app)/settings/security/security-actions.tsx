"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/neo/button";
import { removeSuppressionAction, resetDemoAction } from "../actions";
import { seedDemoAction } from "./seed-demo";

export function SecurityActions({ demoCount, isOwner }: { demoCount: number; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">{demoCount} demo organisation(s). Demo records are labelled “demo” everywhere and excluded from KPIs unless you add <code>?demo=1</code>.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!isOwner} loading={pending} onClick={() => start(async () => { const r = await seedDemoAction(); setMsg(r.ok ? `✓ ${r.message}` : `⚠ ${r.error}`); router.refresh(); })}>Load labelled demo data</Button>
        <Button size="sm" variant="danger" disabled={!isOwner || !demoCount} loading={pending} onClick={() => start(async () => { const r = await resetDemoAction(); setMsg(r.ok ? `✓ ${r.message}` : `⚠ ${r.error}`); router.refresh(); })}>Remove all demo data</Button>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}

export function RemoveSuppression({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => { if (confirm("Remove this suppression? The person may be contacted again.")) start(async () => { await removeSuppressionAction(id); router.refresh(); }); }}>Remove</Button>;
}
