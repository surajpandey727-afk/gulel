"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/neo/button";
import { StatusBadge } from "@/components/neo/badge";
import { disconnectGmailAction } from "../actions";

export function GmailControls({ configured, isOwner, accounts }: { configured: boolean; isOwner: boolean; accounts: Array<{ id: string; email: string; status: string; lastSync: string | null; error: string | null; scopes: string[] }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const active = accounts.filter((a) => a.status !== "disconnected");
  return (
    <div className="flex flex-col gap-3">
      {active.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-neo neo-inset-sm p-4">
          <Mail className="h-5 w-5 text-oxblood" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{a.email}</p>
            <p className="text-xs text-ink-3">Last sync {a.lastSync ? new Date(a.lastSync).toLocaleString("en-GB") : "never"} · {a.scopes.filter((s) => s.includes("gmail")).map((s) => s.split("/").pop()).join(", ")}</p>
            {a.error && <p className="text-xs text-oxblood">{a.error}</p>}
          </div>
          <StatusBadge status={a.status} />
          {isOwner && <Button size="sm" variant="danger" loading={pending} onClick={() => start(async () => { const r = await disconnectGmailAction(a.id); setMsg(r.ok ? r.message ?? "Disconnected." : r.error); router.refresh(); })}>Disconnect</Button>}
        </div>
      ))}
      {!active.length && <p className="text-sm text-ink-3">Not connected.</p>}
      {isOwner && (
        <a href="/api/gmail/oauth/start" aria-disabled={!configured} className={`inline-flex h-10 w-fit items-center gap-2 rounded-full px-5 text-sm font-medium ${configured ? "neo-accent" : "pointer-events-none neo-raised-sm text-ink-3 opacity-60"}`}>
          <Mail className="h-4 w-4" /> {active.length ? "Reconnect / add account" : "Connect Gmail"}
        </a>
      )}
      {msg && <p role="status" className="text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
