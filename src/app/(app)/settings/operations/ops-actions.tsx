"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/neo/button";
import { retryJobAction, runWorkerAction } from "../actions";

export function OpsActions() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-ink-3">{msg}</span>}
      <Button size="sm" loading={pending} onClick={() => start(async () => { const r = await runWorkerAction(); setMsg(r.ok ? r.message ?? "" : r.error); router.refresh(); })}><Play className="h-3.5 w-3.5" /> Run worker now</Button>
    </span>
  );
}

export function RetryJob({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => start(async () => { await retryJobAction(id); router.refresh(); })}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>;
}
