"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { IconButton } from "@/components/neo/button";
import { Badge } from "@/components/neo/badge";
import { setTriggerStatusAction } from "./actions";

type T = { id: string; organisation_id: string; kind: string; materiality: string; summary: string; detected_at: string; organisations: { trading_name: string } | null };

export function TriggerList({ triggers }: { triggers: T[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!triggers.length) return <p className="text-sm text-ink-3">No new triggers. Monitored organisations (qualified, clients, active conversations) are re-checked weekly.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {triggers.map((t) => (
        <li key={t.id} className="rounded-neo neo-inset-sm p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/organisations/${t.organisation_id}?tab=timeline`} className="font-medium hover:text-oxblood">{t.organisations?.trading_name}</Link>
              <p className="text-ink-2">{t.summary}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-ink-3"><Badge tone={t.materiality === "high" ? "critical" : t.materiality === "moderate" ? "warning" : "neutral"}>{t.kind.replace(/_/g, " ")}</Badge>{new Date(t.detected_at).toLocaleDateString("en-GB")}</p>
            </div>
            <span className="flex shrink-0 gap-1">
              <IconButton size="iconSm" label="Mark reviewed" disabled={pending} onClick={() => start(async () => { await setTriggerStatusAction(t.id, "reviewed"); router.refresh(); })}><Check className="h-3.5 w-3.5" /></IconButton>
              <IconButton size="iconSm" label="Dismiss" disabled={pending} onClick={() => start(async () => { await setTriggerStatusAction(t.id, "dismissed"); router.refresh(); })}><X className="h-3.5 w-3.5" /></IconButton>
            </span>
          </div>
          <Link href={`/organisations/${t.organisation_id}`} onClick={() => start(async () => { await setTriggerStatusAction(t.id, "actioned"); })} className="mt-2 inline-block text-xs text-oxblood hover:underline">Re-qualify / prepare outreach →</Link>
        </li>
      ))}
    </ul>
  );
}
