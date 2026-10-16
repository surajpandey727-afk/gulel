"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Link2, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { createOrganisationAction, lookupLinkedInAction } from "./actions";

interface DecisionMaker { name: string; title: string; linkedin_url: string | null }

export function NewOrganisationButton({ small }: { small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<"UK" | "IN">("UK");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [lookingUp, setLookingUp] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [decisionMakers, setDecisionMakers] = useState<DecisionMaker[]>([]);
  const [enriched, setEnriched] = useState(false);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const lookup = async () => {
    if (!linkedinUrl.trim()) return;
    setError(null);
    setLookingUp(true);
    try {
      const r = await lookupLinkedInAction(linkedinUrl.trim());
      if (!r.ok) { setError(r.error); return; }
      const d = r.data!;
      const form = formRef.current;
      if (!form) return;
      const set = (name: string, val: string | null | undefined) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && val) el.value = val;
      };
      set("trading_name", d.trading_name);
      set("legal_name", d.legal_name);
      set("website", d.website);
      set("registration_number", d.registration_number);
      set("sector", d.sector);
      set("headquarters", d.headquarters);
      set("description", d.description);
      if (d.primary_market) setMarket(d.primary_market);
      if (d.decision_makers?.length) setDecisionMakers(d.decision_makers);
      setEnriched(true);
    } catch { setError("Lookup failed. Try again or fill manually."); }
    finally { setLookingUp(false); }
  };

  const submit = (form: FormData) =>
    start(async () => {
      setError(null);
      const r = await createOrganisationAction({
        trading_name: String(form.get("trading_name") ?? ""),
        legal_name: String(form.get("legal_name") ?? ""),
        website: String(form.get("website") ?? ""),
        registration_number: String(form.get("registration_number") ?? ""),
        sector: String(form.get("sector") ?? ""),
        headquarters: String(form.get("headquarters") ?? ""),
        relationship_status: String(form.get("relationship_status") ?? "prospect") as "prospect",
        description: String(form.get("description") ?? ""),
        primary_market: market,
        linkedin_url: linkedinUrl.trim() || undefined,
        decision_makers: decisionMakers.length ? decisionMakers : undefined,
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setLinkedinUrl("");
      setDecisionMakers([]);
      setEnriched(false);
      router.push(`/organisations/${r.data}`);
    });

  const reset = () => { setOpen(false); setLinkedinUrl(""); setDecisionMakers([]); setEnriched(false); setError(null); };

  return (
    <>
      <Button variant={small ? "neutral" : "primary"} size={small ? "sm" : "md"} onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add organisation</Button>
      <Modal open={open} onOpenChange={(v) => { if (!v) reset(); else setOpen(true); }} title="Add organisation" description="Paste a LinkedIn URL to auto-fill, or enter details manually."
        footer={<><Button onClick={reset}>Cancel</Button><Button variant="primary" type="submit" form="new-org" loading={pending}>Create</Button></>}>

        {/* LinkedIn lookup bar */}
        <div className="flex gap-2 items-end mb-2">
          <Field label="LinkedIn company URL" htmlFor="o-li" className="flex-1">
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
              <Input id="o-li" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="linkedin.com/company/acme" className="pl-10"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} />
            </div>
          </Field>
          <Button type="button" variant="primary" size="md" onClick={lookup} disabled={lookingUp || !linkedinUrl.trim()} className="h-11 shrink-0">
            {lookingUp ? <><Loader2 className="h-4 w-4 animate-spin" /> Researching...</> : <><Sparkles className="h-4 w-4" /> Lookup</>}
          </Button>
        </div>

        {enriched && (
          <p className="text-xs text-ink-2 mb-3 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Auto-filled by Taftish. Review and edit before creating.
            {decisionMakers.length > 0 && <span className="ml-1">· {decisionMakers.length} decision-maker{decisionMakers.length > 1 ? "s" : ""} found</span>}
          </p>
        )}

        <form id="new-org" ref={formRef} action={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary market" className="sm:col-span-2">
            <Segmented label="Primary market" value={market} onChange={setMarket} options={[{ value: "UK", label: "United Kingdom · GBP" }, { value: "IN", label: "India · INR" }]} />
          </Field>
          <Field label="Trading name" htmlFor="o-tn"><Input id="o-tn" name="trading_name" required /></Field>
          <Field label="Legal entity name" htmlFor="o-ln"><Input id="o-ln" name="legal_name" /></Field>
          <Field label="Website" htmlFor="o-w"><Input id="o-w" name="website" placeholder="acme.co.uk" /></Field>
          <Field label={market === "UK" ? "Companies House number" : "CIN"} htmlFor="o-rn"><Input id="o-rn" name="registration_number" /></Field>
          <Field label="Sector" htmlFor="o-s"><Input id="o-s" name="sector" placeholder="FMCG · Beverages" /></Field>
          <Field label="Headquarters" htmlFor="o-hq"><Input id="o-hq" name="headquarters" /></Field>
          <Field label="Relationship" htmlFor="o-rel">
            <Select id="o-rel" name="relationship_status" defaultValue="prospect">
              <option value="prospect">Prospect</option><option value="client">Client</option><option value="former_client">Former client</option>
              <option value="partner">Partner</option><option value="in_conversation">In conversation</option><option value="do_not_contact">Do not contact</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor="o-d" className="sm:col-span-2"><Textarea id="o-d" name="description" className="min-h-20" /></Field>

          {decisionMakers.length > 0 && (
            <div className="sm:col-span-2 rounded-neo neo-inset-sm p-3">
              <p className="text-xs font-medium text-ink-2 mb-2">Decision-makers (will be added as contacts)</p>
              <div className="space-y-1.5">
                {decisionMakers.map((dm, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{dm.name} <span className="text-ink-3">· {dm.title}</span></span>
                    <button type="button" className="text-xs text-ink-3 hover:text-oxblood" onClick={() => setDecisionMakers((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {error}</p>}
        </form>
      </Modal>
    </>
  );
}
