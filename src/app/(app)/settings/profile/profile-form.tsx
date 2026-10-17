"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/neo/button";
import { Field, Input } from "@/components/neo/field";
import { Panel } from "@/components/neo/surface";
import { updateProfileAction } from "./actions";

export function ProfileForm({ initial }: { initial: { display_name: string; email: string | null; avatar_url: string | null } }) {
  const [name, setName] = useState(initial.display_name);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      setError(null);
      const r = await updateProfileAction({ display_name: name, avatar_url: initial.avatar_url });
      if (r.ok) setMsg(r.message ?? "Saved.");
      else setError(r.error);
    });

  return (
    <Panel title="Your profile" eyebrow="Identity">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="p-email">
          <Input id="p-email" value={initial.email ?? ""} disabled className="opacity-60" />
          <p className="mt-1 text-[0.65rem] text-ink-3">Email changes require re-verification via Supabase Auth.</p>
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" onClick={save} loading={pending} disabled={name.trim() === initial.display_name}>Save</Button>
        {msg && <span className="text-sm text-positive">{msg}</span>}
        {error && <span className="text-sm text-oxblood">{error}</span>}
      </div>
    </Panel>
  );
}
