"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Newspaper } from "lucide-react";
import { Button } from "@/components/neo/button";
import { enrichNewsAction } from "../../discovery/actions";

export function NewsEnrich({ organisationId, orgName, orgWebsite, orgMarket }: { organisationId: string; orgName: string; orgWebsite?: string | null; orgMarket?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = () => start(async () => {
    setMsg(null);
    const r = await enrichNewsAction(organisationId, orgName, orgWebsite, orgMarket);
    if (!r.ok) return setMsg(`⚠ ${r.error}`);
    setMsg(`✓ ${r.data!.inserted} article(s) added${r.data!.skipped ? `, ${r.data!.skipped} duplicate(s) skipped` : ""}.`);
    router.refresh();
  });
  return (
    <span className="flex flex-col items-start gap-1">
      <Button size="sm" loading={pending} onClick={go}><Newspaper className="h-3.5 w-3.5" /> Find news</Button>
      {msg && <span role="status" className="text-xs">{msg}</span>}
    </span>
  );
}
