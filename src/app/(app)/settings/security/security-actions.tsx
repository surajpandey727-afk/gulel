"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Field, Input, Select } from "@/components/neo/field";
import { removeSuppressionAction, resetDemoAction, addWorkspaceMemberAction } from "../actions";
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

export function AddMemberForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form className="flex flex-wrap items-end gap-3" action={(fd) => start(async () => {
      setMsg(null); setError(null);
      const email = String(fd.get("email") ?? "").trim();
      const role = String(fd.get("role") ?? "analyst") as "analyst" | "reviewer" | "viewer";
      if (!email) { setError("Enter an email."); return; }
      const r = await addWorkspaceMemberAction(email, role);
      if (r.ok) { setMsg(r.message ?? "Added."); router.refresh(); }
      else setError(r.error);
    })}>
      <Field label="Email" htmlFor="m-email" className="min-w-[220px] flex-1">
        <Input id="m-email" name="email" type="email" placeholder="colleague@nishaan-a.com" required />
      </Field>
      <Field label="Role" htmlFor="m-role">
        <Select id="m-role" name="role" defaultValue="analyst">
          <option value="analyst">Analyst</option>
          <option value="reviewer">Reviewer</option>
          <option value="viewer">Viewer</option>
        </Select>
      </Field>
      <Button type="submit" size="sm" loading={pending}><UserPlus className="h-3.5 w-3.5" /> Add</Button>
      {msg && <span className="w-full text-sm text-positive">{msg}</span>}
      {error && <span className="w-full text-sm text-oxblood">{error}</span>}
    </form>
  );
}

export function RemoveSuppression({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => { if (confirm("Remove this suppression? The person may be contacted again.")) start(async () => { await removeSuppressionAction(id); router.refresh(); }); }}>Remove</Button>;
}
