"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { createOrganisationAction } from "./actions";

export function NewOrganisationButton({ small }: { small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<"UK" | "IN">("UK");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

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
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.push(`/organisations/${r.data}`);
    });

  return (
    <>
      <Button variant={small ? "neutral" : "primary"} size={small ? "sm" : "md"} onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add organisation</Button>
      <Modal open={open} onOpenChange={setOpen} title="Add organisation" description="Manual prospect entry. Evidence and people can be added on the dossier."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="new-org" loading={pending}>Create</Button></>}>
        <form id="new-org" action={submit} className="grid gap-4 sm:grid-cols-2">
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
          {error && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {error}</p>}
        </form>
      </Modal>
    </>
  );
}
