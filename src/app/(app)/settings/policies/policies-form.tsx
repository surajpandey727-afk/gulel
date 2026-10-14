"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/neo/button";
import { Slider, Switch } from "@/components/neo/controls";
import { Field, Input } from "@/components/neo/field";
import { Panel } from "@/components/neo/surface";
import { savePoliciesAction } from "../actions";

type Ranges = Record<"UK" | "IN", { currency: string; min: number; typical: number; max: number }>;
type P = { daily_send_cap: number; min_hours_between_org_sends: number; approval_ttl_hours: number; require_compliance_check: boolean; tracking_pixels_enabled: boolean; pricing_ranges: Ranges };

export function PoliciesForm({ initial, isOwner }: { initial: P; isOwner: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<P>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const range = (m: "UK" | "IN", k: "min" | "typical" | "max", v: string) => setP((x) => ({ ...x, pricing_ranges: { ...x.pricing_ranges, [m]: { ...x.pricing_ranges[m], [k]: Number(v.replace(/[^\d]/g, "")) || 0 } } }));
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Sending controls" eyebrow="Enforced by the execution gateway at send time">
        <div className="grid gap-6 md:grid-cols-2">
          <Slider label="Daily send cap (Gmail)" value={p.daily_send_cap} max={100} onValueChange={(v) => setP((x) => ({ ...x, daily_send_cap: v }))} />
          <Slider label="Minimum hours between sends to the same organisation" value={p.min_hours_between_org_sends} max={336} step={12} onValueChange={(v) => setP((x) => ({ ...x, min_hours_between_org_sends: v }))} />
          <Slider label="Approval validity (hours)" value={p.approval_ttl_hours} min={1} max={336} onValueChange={(v) => setP((x) => ({ ...x, approval_ttl_hours: v }))} />
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3 rounded-neo neo-inset-sm p-3 text-sm">Block individual subscribers without consent (PECR)<Switch checked={p.require_compliance_check} onCheckedChange={(v) => setP((x) => ({ ...x, require_compliance_check: v }))} label="Compliance check" /></label>
            <p className="rounded-neo neo-inset-sm p-3 text-xs text-ink-3">Tracking pixels: off. Open tracking is not implemented and no open-rate statistics are reported.</p>
          </div>
        </div>
      </Panel>
      <Panel title="Private engagement pricing ranges" eyebrow="Used only to compare affordability when evidence exists">
        <div className="grid gap-6 md:grid-cols-2">
          {(["UK", "IN"] as const).map((m) => (
            <div key={m} className="flex flex-col gap-3">
              <p className="font-medium">{m === "UK" ? "United Kingdom · GBP" : "India · INR"}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["min", "typical", "max"] as const).map((k) => <Field key={k} label={k}><Input inputMode="numeric" value={p.pricing_ranges[m][k].toLocaleString(m === "UK" ? "en-GB" : "en-IN")} onChange={(e) => range(m, k, e.target.value)} /></Field>)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <Button variant="primary" className="self-start" disabled={!isOwner} loading={pending} onClick={() => start(async () => {
        const r = await savePoliciesAction({ daily_send_cap: p.daily_send_cap, min_hours_between_org_sends: p.min_hours_between_org_sends, approval_ttl_hours: p.approval_ttl_hours, require_compliance_check: p.require_compliance_check, pricing_ranges: p.pricing_ranges });
        setMsg(r.ok ? "✓ Saved." : `⚠ ${r.error}`); router.refresh();
      })}>Save policies</Button>
    </div>
  );
}
