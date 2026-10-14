"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Check, MoreHorizontal, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Button, IconButton } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Field, Input, Select, Textarea } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { StatusBadge } from "@/components/neo/badge";
import { addChannelAction, setChannelVerificationAction, setEvidenceStatusAction, updateContactAction, updateOrganisationAction } from "../edit-actions";

const s = (v: FormDataEntryValue | null) => { const t = String(v ?? "").trim(); return t || null; };

export interface OrgEditable {
  id: string; trading_name: string; legal_name: string | null; website: string | null; registration_number: string | null; primary_market: "UK" | "IN";
  sector: string | null; sub_sector: string | null; headquarters: string | null; incorporation_date: string | null; operating_status: string;
  employee_count: number | null; employee_count_source: string | null; relationship_status: string; description: string | null; markets: string[];
}

export function EditOrganisationButton({ org }: { org: OrgEditable }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const other = org.primary_market === "UK" ? "IN" : "UK";
  return (
    <>
      <IconButton label="Edit organisation" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></IconButton>
      <Modal open={open} onOpenChange={setOpen} wide title="Edit organisation" description="Changes are audited. Existing names are kept as aliases."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="org-edit" loading={pending}>Save</Button></>}>
        <form id="org-edit" className="grid gap-4 sm:grid-cols-2" action={(fd) => start(async () => {
          setErr(null);
          const emp = s(fd.get("employee_count"));
          const r = await updateOrganisationAction(org.id, {
            trading_name: String(fd.get("trading_name") ?? ""), legal_name: s(fd.get("legal_name")), website: s(fd.get("website")), registration_number: s(fd.get("registration_number")),
            sector: s(fd.get("sector")), sub_sector: s(fd.get("sub_sector")), headquarters: s(fd.get("headquarters")), incorporation_date: s(fd.get("incorporation_date")),
            operating_status: String(fd.get("operating_status")) as "unknown", employee_count: emp ? Number(emp.replace(/\D/g, "")) : null, employee_count_source: s(fd.get("employee_count_source")),
            relationship_status: String(fd.get("relationship_status")) as "prospect", description: s(fd.get("description")),
            secondary_market: fd.get("secondary") === "on" ? other : null,
          });
          if (!r.ok) return setErr(r.error);
          setOpen(false); router.refresh();
        })}>
          <Field label="Trading name"><Input name="trading_name" defaultValue={org.trading_name} required /></Field>
          <Field label="Legal entity name"><Input name="legal_name" defaultValue={org.legal_name ?? ""} /></Field>
          <Field label="Website"><Input name="website" defaultValue={org.website ?? ""} /></Field>
          <Field label={org.primary_market === "UK" ? "Companies House number" : "CIN"}><Input name="registration_number" defaultValue={org.registration_number ?? ""} /></Field>
          <Field label="Sector"><Input name="sector" defaultValue={org.sector ?? ""} /></Field>
          <Field label="Sub-sector"><Input name="sub_sector" defaultValue={org.sub_sector ?? ""} /></Field>
          <Field label="Headquarters"><Input name="headquarters" defaultValue={org.headquarters ?? ""} /></Field>
          <Field label="Incorporated"><Input name="incorporation_date" type="date" defaultValue={org.incorporation_date ?? ""} /></Field>
          <Field label="Operating status"><Select name="operating_status" defaultValue={org.operating_status}>{["active", "dormant", "liquidation", "dissolved", "unknown"].map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
          <Field label="Relationship"><Select name="relationship_status" defaultValue={org.relationship_status}>{["prospect", "client", "former_client", "partner", "in_conversation", "do_not_contact"].map((x) => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}</Select></Field>
          <Field label="Employees (approx.)"><Input name="employee_count" inputMode="numeric" defaultValue={org.employee_count ?? ""} /></Field>
          <Field label="Employee count source"><Input name="employee_count_source" defaultValue={org.employee_count_source ?? ""} placeholder="LinkedIn company page, Oct 2026" /></Field>
          <label className="flex items-center gap-2 rounded-neo neo-inset-sm p-3 text-sm sm:col-span-2">
            <input type="checkbox" name="secondary" defaultChecked={org.markets.includes(other)} disabled={org.markets.includes(other)} className="accent-[var(--brand-oxblood)]" />
            Also operates in {other === "UK" ? "the United Kingdom (GBP)" : "India (INR)"} — one canonical record, two market profiles
          </label>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="description" defaultValue={org.description ?? ""} className="min-h-20" /></Field>
          {err && <p role="alert" className="text-sm text-oxblood sm:col-span-2">⚠ {err}</p>}
        </form>
      </Modal>
    </>
  );
}

export interface ContactEditable {
  id: string; full_name: string; title: string | null; market: string | null; subscriber_type: string; lawful_basis: string; notes: string | null;
  channels: Array<{ id: string; channel: string; value: string; verification_status: string }>;
}

export function EditContactButton({ contact, organisationId }: { contact: ContactEditable; organisationId: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sub, setSub] = useState(contact.subscriber_type as "corporate" | "individual" | "unknown");
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [newCh, setNewCh] = useState({ channel: "email" as "email" | "linkedin", value: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (!r.ok) setErr(r.error ?? "Failed"); router.refresh(); });
  return (
    <>
      <IconButton label={`Edit ${contact.full_name}`} size="iconSm" onClick={() => setOpen(true)}><MoreHorizontal className="h-4 w-4" /></IconButton>
      <Modal open={open} onOpenChange={setOpen} wide title={contact.full_name} description="Role, compliance attributes and verified channels."
        footer={<><Button onClick={() => setOpen(false)}>Close</Button><Button variant="primary" type="submit" form="ct-edit" loading={pending}>Save details</Button></>}>
        <form id="ct-edit" className="grid gap-4 sm:grid-cols-2" action={(fd) => run(() => updateContactAction(contact.id, organisationId, {
          full_name: String(fd.get("full_name") ?? ""), title: s(fd.get("title")), market: (s(fd.get("market")) as "UK" | null), subscriber_type: sub,
          lawful_basis: String(fd.get("lawful_basis")) as "legitimate_interest", notes: s(fd.get("notes")),
        }))}>
          <Field label="Full name"><Input name="full_name" defaultValue={contact.full_name} /></Field>
          <Field label="Job title"><Input name="title" defaultValue={contact.title ?? ""} /></Field>
          <Field label="Market"><Select name="market" defaultValue={contact.market ?? ""}><option value="">Unknown</option><option value="UK">UK</option><option value="IN">India</option></Select></Field>
          <Field label="Lawful basis"><Select name="lawful_basis" defaultValue={contact.lawful_basis}><option value="legitimate_interest">Legitimate interest</option><option value="consent">Consent</option><option value="existing_relationship">Existing relationship</option><option value="none">None — do not contact</option></Select></Field>
          <Field label="Recipient type (PECR)" className="sm:col-span-2"><Segmented label="Subscriber type" value={sub} onChange={setSub} options={[{ value: "corporate", label: "Corporate" }, { value: "individual", label: "Sole trader / partnership" }, { value: "unknown", label: "Unknown" }]} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={contact.notes ?? ""} className="min-h-16" /></Field>
        </form>

        <div className="mt-6 flex flex-col gap-2">
          <p className="eyebrow">Channels</p>
          {contact.channels.map((ch) => (
            <div key={ch.id} className="flex flex-wrap items-center gap-2 rounded-neo neo-inset-sm p-3 text-sm">
              <span className="min-w-0 flex-1 break-all font-mono text-xs">{ch.value}</span>
              <StatusBadge status={ch.verification_status} />
              {ch.verification_status !== "verified" && <Button size="sm" onClick={() => { setVerifyId(ch.id); setNote(""); }}><ShieldCheck className="h-3.5 w-3.5" /> Verify</Button>}
              {ch.verification_status !== "invalid" && <Button size="sm" variant="ghost" onClick={() => run(() => setChannelVerificationAction(ch.id, organisationId, "invalid", ""))}><Ban className="h-3.5 w-3.5" /> Invalid</Button>}
              {verifyId === ch.id && (
                <div className="flex w-full gap-2">
                  <Input aria-label="Verification method" value={note} onChange={(e) => setNote(e.target.value)} placeholder="How was it verified? e.g. signature on their reply, 12 Oct" />
                  <Button size="sm" variant="primary" onClick={() => run(async () => { const r = await setChannelVerificationAction(ch.id, organisationId, "verified", note); if (r.ok) setVerifyId(null); return r; })}><Check className="h-3.5 w-3.5" /> Confirm</Button>
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Channel type" value={newCh.channel} onChange={(e) => setNewCh((x) => ({ ...x, channel: e.target.value as "email" }))} className="w-36"><option value="email">Email</option><option value="linkedin">LinkedIn</option></Select>
            <Input aria-label="Channel value" value={newCh.value} onChange={(e) => setNewCh((x) => ({ ...x, value: e.target.value }))} placeholder={newCh.channel === "email" ? "name@company.com" : "https://www.linkedin.com/in/…"} className="min-w-56 flex-1" />
            <Button disabled={!newCh.value.trim()} onClick={() => run(async () => { const r = await addChannelAction(contact.id, organisationId, newCh.channel, newCh.value); if (r.ok) setNewCh((x) => ({ ...x, value: "" })); return r; })}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <p className="text-xs text-ink-3">New addresses start as “candidate”. Never mark a guessed pattern as verified.</p>
        </div>
        {err && <p role="alert" className="mt-3 text-sm text-oxblood">⚠ {err}</p>}
      </Modal>
    </>
  );
}

export function EvidenceStatusControl({ evidenceId, organisationId }: { evidenceId: string; organisationId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select aria-label="Evidence status" className="h-8 w-32 text-xs" value="" disabled={pending}
      onChange={(e) => { const v = e.target.value as "disputed" | "rejected"; if (v) start(async () => { await setEvidenceStatusAction(evidenceId, organisationId, v); router.refresh(); }); }}>
      <option value="">Keep</option><option value="disputed">Dispute</option><option value="rejected">Reject</option>
    </Select>
  );
}
