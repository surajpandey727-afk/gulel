"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { enrichCompaniesHouseAction } from "../../discovery/actions";

type Cand = { number: string; name: string; status: string; incorporated: string | null; locality: string | null };

export function CompaniesHouseEnrich({ organisationId, configured }: { organisationId: string; configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<Cand[] | null>(null);
  const go = (n?: string) => start(async () => {
    setMsg(null);
    const r = await enrichCompaniesHouseAction(organisationId, n);
    if (!r.ok) return setMsg(`⚠ ${r.error}`);
    if (r.data.needsChoice) return setChoices(r.data.candidates);
    setChoices(null);
    setMsg(`✓ Companies House ${r.data.number}: ${r.data.evidence} evidence item(s), ${r.data.flags} flag(s), ${r.data.directorsAdded} director(s) added.`);
    router.refresh();
  });
  return (
    <span className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={!configured} title={configured ? undefined : "Add COMPANIES_HOUSE_API_KEY on the server"} loading={pending} onClick={() => go()}><Landmark className="h-3.5 w-3.5" /> Enrich from Companies House</Button>
      {!configured && <span className="text-[0.7rem] text-ink-3">Needs a free Companies House API key</span>}
      {msg && <span role="status" className="text-xs">{msg}</span>}
      <Modal open={!!choices} onOpenChange={(o) => !o && setChoices(null)} title="Which company is this?" description="No unique exact name match. Choose the right registered entity — nothing is guessed.">
        {choices?.length ? (
          <ul className="flex flex-col gap-2">{choices.map((c) => (
            <li key={c.number}><button type="button" onClick={() => go(c.number)} className="w-full rounded-neo neo-raised-sm p-3 text-left text-sm">
              <span className="font-medium">{c.name}</span><span className="block text-xs text-ink-3">{c.number} · {c.status}{c.incorporated ? ` · inc. ${c.incorporated}` : ""}{c.locality ? ` · ${c.locality}` : ""}</span>
            </button></li>))}</ul>
        ) : <p className="text-sm text-ink-3">No matches at Companies House. Add the registration number manually via Edit.</p>}
      </Modal>
    </span>
  );
}
