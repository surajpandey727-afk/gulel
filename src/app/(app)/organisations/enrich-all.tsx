"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/neo/button";
import { enrichAllOrgsAction, retryFailedJobsAction } from "./actions";

export function EnrichAllButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setResult(null);
      const [enrich, retry] = await Promise.all([enrichAllOrgsAction(), retryFailedJobsAction()]);
      const parts: string[] = [];
      if (enrich.ok) parts.push(enrich.message!);
      else parts.push(enrich.error);
      if (retry.ok && retry.data!.retried > 0) parts.push(retry.message!);
      setResult(parts.join(" "));
    });

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="primary" loading={pending} onClick={run}>
        <Sparkles className="h-4 w-4" /> Enrich all
      </Button>
      {result && <span className="text-xs text-positive animate-in fade-in">{result}</span>}
    </div>
  );
}
