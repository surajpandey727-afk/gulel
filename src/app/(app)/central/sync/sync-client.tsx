"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, ExternalLink, FileSpreadsheet, KeyRound, Link2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/neo/button";
import { Switch } from "@/components/neo/controls";
import { Input } from "@/components/neo/field";
import { cn } from "@/components/neo/cn";
import type { LinkState } from "@/lib/central/link";
import {
  createApiTokenAction, disconnectGoogleAction, importWorkbookAction, linkSheetAction, revokeApiTokenAction, setAutoSyncAction, syncAction, unlinkSheetAction,
} from "../actions";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");
const VIA: Record<string, string> = { ui: "gulel", agent: "Munshi", sheet: "Google Sheet", api: "API", import: "Import" };

interface Run { id: number; direction: string; entity: string; rows_synced: number; rows_skipped: number; status: string; error_detail: string | null; started_at: string; finished_at: string | null }

export function SyncControls({ link, canManage, googleConfigured, pending, rowCount, runs }: { link: LinkState | null; canManage: boolean; googleConfigured: boolean; pending: number; rowCount: number; runs: Run[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const connected = !!link?.account_email;
  const linked = !!link?.spreadsheet_id;
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    const r = await fn();
    if (r.ok) toast.success(r.message ?? "Done"); else toast.error(r.error ?? "Failed");
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-3 md:grid-cols-3">
        <Step n={1} done={connected} title="Connect Google">
          {connected ? (
            <p className="text-xs text-ink-2">Connected as <span className="font-medium text-ink">{link!.account_email}</span></p>
          ) : (
            <p className="text-xs text-ink-3">Grants gulel access to Google Sheets and to files it creates in your Drive.</p>
          )}
          {canManage && (googleConfigured ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/api/central/google/start" size="sm" variant={connected ? "neutral" : "primary"} prefetch={false}>{connected ? "Reconnect" : "Connect Google"}</ButtonLink>
              {connected && <Button size="sm" variant="ghost" onClick={() => act(disconnectGoogleAction)}>Disconnect</Button>}
            </div>
          ) : <p className="text-xs text-danger">Google OAuth isn&apos;t configured on this deployment.</p>)}
        </Step>

        <Step n={2} done={rowCount > 0} title="Load the workbook">
          <p className="text-xs text-ink-3">Import the central repository .xlsx. {connected && !linked ? "Tick the box to also create the Google Sheet from it." : ""}</p>
          {canManage && (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); act(async () => { const r = await importWorkbookAction(fd); if (r.ok && r.data.warnings.length) toast.warning(r.data.warnings.slice(0, 3).join("\n")); return r; }); }}>
              <input ref={fileRef} name="file" type="file" accept=".xlsx" required aria-label="Workbook file" className="text-xs text-ink-2 file:mr-2 file:rounded-full file:border-0 file:px-3 file:py-1.5 file:text-xs file:neo-raised-sm" />
              {connected && !linked && <label className="flex items-center gap-2 text-xs text-ink-2"><input name="createSheet" type="checkbox" defaultChecked className="accent-[var(--brand-oxblood)]" />Create &amp; link a Google Sheet from this file</label>}
              {rowCount > 0 && <label className="flex items-center gap-2 text-xs text-ink-2"><input name="replace" type="checkbox" className="accent-[var(--brand-oxblood)]" />Replace: remove gulel rows not in the file</label>}
              <Button type="submit" size="sm" loading={busy}><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />Import</Button>
            </form>
          )}
          {rowCount > 0 && <p className="text-xs text-ink-2">{rowCount} rows in gulel</p>}
        </Step>

        <Step n={3} done={linked} title="Link the sheet">
          {linked ? (
            <div className="flex flex-col gap-2">
              <a href={link!.spreadsheet_url ?? "#"} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-medium text-oxblood hover:underline">Open Google Sheet<ExternalLink className="h-3 w-3" aria-hidden /></a>
              {canManage && <Button size="sm" variant="ghost" onClick={() => act(unlinkSheetAction)}><Unlink className="h-3.5 w-3.5" aria-hidden />Unlink</Button>}
            </div>
          ) : canManage && connected ? (
            <form onSubmit={(e) => { e.preventDefault(); act(() => linkSheetAction(url)); }} className="flex flex-col gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheet URL" className="h-9 text-xs" />
              <Button type="submit" size="sm" loading={busy} disabled={!url}><Link2 className="h-3.5 w-3.5" aria-hidden />Link existing sheet</Button>
            </form>
          ) : <p className="text-xs text-ink-3">Connect Google first.</p>}
        </Step>
      </ol>

      {linked && (
        <div className="flex flex-col gap-4 rounded-neo neo-inset-sm p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", link?.last_status === "error" ? "bg-danger" : "bg-oxblood")} aria-hidden />{link?.last_status === "error" ? "Last sync failed" : "Healthy"}</span>
            <span>Last pull: <span className="text-ink">{when(link?.last_pull_at ?? null)}</span></span>
            <span>Last push: <span className="text-ink">{when(link?.last_push_at ?? null)}</span></span>
            <span>Waiting to sync: <span className={cn("font-medium", pending ? "text-warning" : "text-ink")}>{pending} change{pending === 1 ? "" : "s"}</span></span>
          </div>
          {link?.last_error && <p className={cn("text-xs", link.last_status === "error" ? "text-danger" : "text-warning")}>{link.last_error}</p>}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" loading={busy} onClick={() => act(() => syncAction("both"))}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Sync now</Button>
              <Button size="sm" onClick={() => act(() => syncAction("pull"))} disabled={busy}><ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />Pull from sheet</Button>
              <Button size="sm" onClick={() => act(() => syncAction("push"))} disabled={busy}><ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />Push to sheet</Button>
              <div className="ml-auto"><Switch checked={link?.auto_push ?? true} onCheckedChange={(v) => act(() => setAutoSyncAction(v))} label="Auto-sync every edit" /></div>
            </div>
          )}
          <p className="text-[0.6875rem] leading-relaxed text-ink-3">
            How it works: every save in gulel (by you, Munshi or the API) pulls the sheet first, then writes all input cells back. Edits made directly in Google Sheets are picked up when you open a board, on Sync now, and by the scheduled job. If the same row was edited in both places since the last sync, gulel&apos;s edit wins. Formula columns, data validation, named ranges and the Dashboard tab are never overwritten.
          </p>
        </div>
      )}

      <div>
        <h3 className="eyebrow mb-2">Sync history</h3>
        {runs.length === 0 ? <p className="text-xs text-ink-3">No sync runs yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="border-b border-hairline text-left text-[0.625rem] uppercase tracking-wider text-ink-3"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Direction</th><th className="py-2 pr-3">Rows</th><th className="py-2 pr-3">Status</th><th className="py-2">Detail</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-hairline/50">
                    <td className="py-2 pr-3 text-ink-2">{when(r.started_at)}</td>
                    <td className="py-2 pr-3 text-ink">{r.direction === "sheet_to_gulel" ? "Sheet → gulel" : "gulel → Sheet"}</td>
                    <td className="py-2 pr-3 tabular">{r.rows_synced}{r.rows_skipped ? <span className="text-ink-3"> ({r.rows_skipped} kept)</span> : null}</td>
                    <td className="py-2 pr-3"><span className={cn("rounded-full px-2 py-0.5 font-medium", r.status === "completed" ? "bg-oxblood/10 text-oxblood" : r.status === "failed" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning")}>{r.status}</span></td>
                    <td className="max-w-[320px] truncate py-2 text-ink-3" title={r.error_detail ?? ""}>{r.error_detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2.5 rounded-neo neo-raised-sm p-4">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", done ? "neo-accent" : "neo-inset-sm text-ink-2")}>{done ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}</span>
        <span className="text-sm font-medium text-ink">{title}</span>
      </div>
      {children}
    </li>
  );
}

interface Change { id: number; sheet: string; row_key: string | null; action: string; via: string; note: string | null; created_at: string; pushed_at: string | null; push_error: string | null; actor_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }

export function ChangeLog({ changes, me }: { changes: Change[]; me: string }) {
  const [via, setVia] = useState<string>("all");
  const list = via === "all" ? changes : changes.filter((c) => c.via === via);
  if (!changes.length) return <p className="text-xs text-ink-3">No changes recorded yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {["all", "ui", "agent", "sheet", "api", "import"].map((v) => (
          <button key={v} type="button" onClick={() => setVia(v)} className={cn("rounded-full px-3 py-1 text-xs", via === v ? "neo-raised-sm font-medium text-oxblood" : "text-ink-2 hover:text-ink")}>{v === "all" ? "All" : VIA[v]}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead><tr className="border-b border-hairline text-left text-[0.625rem] uppercase tracking-wider text-ink-3"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Record</th><th className="py-2 pr-3">Change</th><th className="py-2 pr-3">By</th><th className="py-2">Sheet sync</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const fields = c.action === "update" ? Object.keys({ ...(c.before ?? {}), ...(c.after ?? {}) }).filter((k) => (c.before?.[k] ?? null) !== (c.after?.[k] ?? null)) : [];
              return (
                <tr key={c.id} className="border-b border-hairline/50 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-ink-2">{when(c.created_at)}</td>
                  <td className="py-2 pr-3"><span className="text-ink-3">{c.sheet.replace(/_/g, " ")}</span> <span className="font-mono text-ink">{c.row_key ?? ""}</span></td>
                  <td className="py-2 pr-3 text-ink"><span className="capitalize">{c.action === "move" ? "Reordered" : c.action}</span>{fields.length ? <span className="text-ink-3">: {fields.slice(0, 4).join(", ")}{fields.length > 4 ? "…" : ""}</span> : null}</td>
                  <td className="py-2 pr-3 text-ink-2">{VIA[c.via] ?? c.via}{c.actor_id === me ? " · you" : ""}{c.note ? <span className="block max-w-[220px] truncate text-ink-3" title={c.note}>{c.note}</span> : null}</td>
                  <td className="py-2">{c.via === "sheet" ? <span className="text-ink-3">from sheet</span> : c.pushed_at ? <span className="text-oxblood">synced {when(c.pushed_at)}</span> : c.push_error ? <span className="text-danger" title={c.push_error}>failed</span> : <span className="text-warning">pending</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Token { id: string; label: string; token_hint: string; can_write: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null }

export function TokensPanel({ tokens, isOwner, appUrl }: { tokens: Token[]; isOwner: boolean; appUrl: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [write, setWrite] = useState(true);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copied"), () => toast.error("Copy blocked; select and copy manually"));
  const mcpCmd = `claude mcp add --transport http gulel-central ${appUrl}/api/central/mcp --header "Authorization: Bearer ${created ?? "<token>"}"`;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-neo neo-inset-sm p-4 text-xs text-ink-2">
          <span className="font-medium text-ink">Inside gulel</span>
          <p>Munshi, the record-keeping agent, is built into every board (Ask Munshi). It plans changes from plain English, you review, then it applies them through the same validation as manual edits.</p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-neo neo-inset-sm p-4 text-xs text-ink-2">
          <span className="font-medium text-ink">External agents</span>
          <p>Connect Claude Code or any MCP client to <code className="font-mono text-ink">{appUrl}/api/central/mcp</code>, or call the REST API at <code className="font-mono text-ink">{appUrl}/api/central/v1</code> (<code>/schema</code>, <code>/rows</code>, <code>/ops</code>, <code>/agent</code>, <code>/organisations</code>, <code>/notes</code>, <code>/files</code>, <code>/qualify</code>) with a bearer token. Agents can read an organisation with its LinkedIn, score, notes and files, add notes, attach research files and queue qualification.</p>
        </div>
      </div>

      {isOwner ? (
        <>
          <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createApiTokenAction(label, write); if (!r.ok) return void toast.error(r.error); setCreated(r.data.token); setLabel(""); router.refresh(); }); }} className="flex flex-wrap items-end gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Token name, e.g. Claude Code" aria-label="Token name" className="h-10 min-w-48 flex-1" />
            <label className="flex h-10 items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="accent-[var(--brand-oxblood)]" />Can edit</label>
            <Button type="submit" size="sm" variant="primary" loading={busy}><KeyRound className="h-3.5 w-3.5" aria-hidden />Create token</Button>
          </form>
          {created && (
            <div className="flex flex-col gap-2 rounded-neo bg-buttercream/60 p-4 text-xs text-ink">
              <p className="font-medium">Copy this token now. It won&apos;t be shown again.</p>
              <div className="flex items-center gap-2"><code className="min-w-0 flex-1 select-all break-all rounded-neo-sm bg-canvas px-3 py-2 font-mono">{created}</code><Button size="sm" onClick={() => void copy(created)}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</Button></div>
              <p className="mt-1 text-ink-2">Add to Claude Code:</p>
              <div className="flex items-center gap-2"><code className="min-w-0 flex-1 select-all break-all rounded-neo-sm bg-canvas px-3 py-2 font-mono">{mcpCmd}</code><Button size="sm" onClick={() => void copy(mcpCmd)}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</Button></div>
            </div>
          )}
          {tokens.length > 0 && (
            <ul className="flex flex-col gap-2">
              {tokens.map((t) => (
                <li key={t.id} className={cn("flex flex-wrap items-center gap-3 rounded-neo-sm neo-inset-sm px-3 py-2 text-xs", t.revoked_at && "opacity-50")}>
                  <span className="font-medium text-ink">{t.label}</span>
                  <code className="font-mono text-ink-3">{t.token_hint}</code>
                  <span className="text-ink-3">{t.can_write ? "read & write" : "read-only"}</span>
                  <span className="text-ink-3">last used {when(t.last_used_at)}</span>
                  {t.revoked_at ? <span className="ml-auto text-ink-3">revoked</span> : (
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => start(async () => { const r = await revokeApiTokenAction(t.id); if (r.ok) toast.success(r.message ?? "Revoked"); else toast.error(r.error); router.refresh(); })}>Revoke</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : <p className="text-xs text-ink-3">Only the workspace owner can create API tokens.</p>}
    </div>
  );
}
