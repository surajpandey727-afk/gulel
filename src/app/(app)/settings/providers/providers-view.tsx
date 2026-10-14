"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Plug, Plus, ShieldOff } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal, Switch } from "@/components/neo/controls";
import { Field, Input, Select } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Badge, StatusBadge } from "@/components/neo/badge";
import { EmptyState, Panel } from "@/components/neo/surface";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { AGENTS, CLAUDE_MODELS, type AgentKey } from "@/lib/ai/models";
import { revokeProviderKeyAction, saveAgentConfigAction, saveProviderAction, testProviderAction, toggleProviderAction } from "../actions";

type Conn = { id: string; provider: string; label: string; base_url: string | null; key_hint: string | null; anthropic_workspace_id: string | null; is_enabled: boolean; status: string; last_tested_at: string | null; last_test_result: unknown; rotated_at: string | null };
type Agent = { agent: string; model: string; effort: string; monthly_budget_usd: number; on_budget_exhausted: string; connection_id: string | null; allow_cross_provider_fallback: boolean };

export function ProvidersView({ connections, agents, spend, recent, envFallback, envWorkspaceSet, isOwner }: {
  connections: Conn[]; agents: Agent[]; spend: Record<string, { usd: number; tokens: number; runs: number }>;
  recent: Array<{ id: string; agent: string; provider: string; model: string; status: string; input_tokens: number; output_tokens: number; cost_usd: number; error: string | null; started_at: string }>;
  envFallback: boolean; envWorkspaceSet: boolean; isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Conn> & { provider: "anthropic" | "omniroute" } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? `✓ ${r.message ?? "Done."}` : `⚠ ${r.error}`); router.refresh(); });

  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className="rounded-neo neo-inset-sm px-4 py-2.5 text-sm">{msg}</p>}
      <Panel title="Provider connections" eyebrow="Anthropic Claude is the only active provider by default"
        actions={isOwner && <><Button size="sm" onClick={() => setEdit({ provider: "anthropic", label: "Anthropic" })}><Plus className="h-4 w-4" /> Claude key</Button><Button size="sm" variant="ghost" onClick={() => setEdit({ provider: "omniroute", label: "OmniRoute" })}>Add OmniRoute</Button></>}>
        {connections.length === 0 ? (
          <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No stored provider connection"
            body={envFallback ? `A server environment key is configured as a bootstrap fallback${envWorkspaceSet ? "" : " (no Anthropic workspace ID set — org-level keys will be rejected)"}. Add a managed connection to rotate and test it here.` : "Add an Anthropic API key. It is encrypted server-side and never sent to the browser."} />
        ) : (
          <ul className="flex flex-col gap-3">
            {connections.map((c) => {
              const t = c.last_test_result as { ok?: boolean; error?: string; model?: string } | null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-4 rounded-neo neo-inset-sm p-4">
                  <Plug className="h-5 w-5 text-oxblood" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.label} <span className="text-xs font-normal capitalize text-ink-3">· {c.provider}</span></p>
                    <p className="font-mono text-xs text-ink-3">{c.key_hint ?? "no key"}{c.anthropic_workspace_id ? ` · workspace ${c.anthropic_workspace_id}` : ""}{c.base_url ? ` · ${c.base_url}` : ""}</p>
                    {t && !t.ok && <p className="mt-1 text-xs text-oxblood">Last test: {t.error}</p>}
                    {t?.ok && <p className="mt-1 text-xs text-positive">Last test OK · {t.model}</p>}
                  </div>
                  <StatusBadge status={c.status} />
                  {isOwner && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Switch checked={c.is_enabled} onCheckedChange={(v) => run(() => toggleProviderAction(c.id, v))} label={`Enable ${c.label}`} disabled={c.provider !== "anthropic" && !c.is_enabled} />
                      <Button size="sm" loading={pending} onClick={() => run(() => testProviderAction(c.id))}>Test</Button>
                      <Button size="sm" onClick={() => setEdit({ ...c, provider: c.provider as "anthropic" })}>Rotate / edit</Button>
                      <Button size="sm" variant="danger" onClick={() => run(() => revokeProviderKeyAction(c.id))}><ShieldOff className="h-3.5 w-3.5" /> Revoke</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-ink-3">No automatic fallback to a non-Claude provider. Gateways such as OmniRoute can be stored for future use but cannot be enabled for execution in this build, and no model behind them is assumed to be permitted.</p>
      </Panel>

      <Panel title="Agent model assignments" eyebrow="Per-agent model, effort and monthly budget">
        <div className="flex flex-col gap-3">
          {(Object.keys(AGENTS) as AgentKey[]).map((key) => {
            const a = agents.find((x) => x.agent === key);
            if (!a) return null;
            return <AgentRow key={key} agentKey={key} cfg={a} spend={spend[key]} connections={connections.filter((c) => c.provider === "anthropic")} disabled={!isOwner} onSave={(p) => run(() => saveAgentConfigAction(p))} />;
          })}
        </div>
      </Panel>

      <Panel title="Recent executions" eyebrow="Every AI call shows provider and model">
        <Table>
          <thead><tr><Th>When</Th><Th>Agent</Th><Th>Provider · model</Th><Th>Status</Th><Th className="text-right">Tokens</Th><Th className="text-right">Cost</Th></tr></thead>
          <tbody>{recent.map((r) => (
            <Tr key={r.id}><Td className="text-xs">{new Date(r.started_at).toLocaleString("en-GB")}</Td><Td>{AGENTS[r.agent as AgentKey]?.label ?? r.agent}</Td><Td className="font-mono text-xs">{r.provider} · {r.model}</Td>
              <Td><StatusBadge status={r.status === "succeeded" ? "approved" : r.status === "running" ? "pending" : "failed"} label={r.status.replace(/_/g, " ")} />{r.error && <span className="block max-w-xs truncate text-[0.65rem] text-oxblood" title={r.error}>{r.error}</span>}</Td>
              <Td className="tabular text-right">{(r.input_tokens + r.output_tokens).toLocaleString()}</Td><Td className="tabular text-right">${Number(r.cost_usd).toFixed(4)}</Td></Tr>
          ))}</tbody>
        </Table>
        {!recent.length && <p className="mt-3 text-sm text-ink-3">No AI calls yet.</p>}
      </Panel>

      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? `Edit ${edit.label}` : edit?.provider === "omniroute" ? "Add OmniRoute gateway" : "Add Claude API key"}
        description="Keys are encrypted with AES-256-GCM on the server, shown masked, never logged and never put in prompts."
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" type="submit" form="prov-form" loading={pending}>Save</Button></>}>
        {edit && (
          <form id="prov-form" className="flex flex-col gap-4" action={(fd) => start(async () => {
            const r = await saveProviderAction({ id: edit.id, provider: edit.provider, label: String(fd.get("label") ?? ""), apiKey: String(fd.get("apiKey") ?? "") || undefined, baseUrl: String(fd.get("baseUrl") ?? "") || undefined, anthropicWorkspaceId: String(fd.get("ws") ?? "") || undefined });
            setMsg(r.ok ? `✓ ${r.message}` : `⚠ ${r.error}`);
            if (r.ok) setEdit(null);
            router.refresh();
          })}>
            <Field label="Label" htmlFor="p-l"><Input id="p-l" name="label" defaultValue={edit.label} /></Field>
            <Field label={edit.id ? "New API key (leave blank to keep current)" : "API key"} htmlFor="p-k"><Input id="p-k" name="apiKey" type="password" autoComplete="off" required={!edit.id} /></Field>
            {edit.provider === "anthropic" && <Field label="Anthropic workspace ID" htmlFor="p-w" hint="Required for organisation-level keys (Console → Settings → Workspaces, wrkspc_…)."><Input id="p-w" name="ws" defaultValue={edit.anthropic_workspace_id ?? ""} placeholder="wrkspc_…" /></Field>}
            {edit.provider === "omniroute" && <Field label="Gateway base URL" htmlFor="p-b"><Input id="p-b" name="baseUrl" type="url" defaultValue={edit.base_url ?? ""} placeholder="https://" /></Field>}
          </form>
        )}
      </Modal>
    </div>
  );
}

function AgentRow({ agentKey, cfg, spend, connections, disabled, onSave }: { agentKey: AgentKey; cfg: Agent; spend: { usd: number; tokens: number; runs: number }; connections: Conn[]; disabled: boolean; onSave: (p: Parameters<typeof saveAgentConfigAction>[0]) => void }) {
  const [model, setModel] = useState(cfg.model);
  const [effort, setEffort] = useState(cfg.effort as "low" | "medium" | "high");
  const [budget, setBudget] = useState(String(cfg.monthly_budget_usd));
  const [onEx, setOnEx] = useState(cfg.on_budget_exhausted as "pause" | "warn");
  const [conn, setConn] = useState(cfg.connection_id ?? "");
  const dirty = model !== cfg.model || effort !== cfg.effort || Number(budget) !== Number(cfg.monthly_budget_usd) || onEx !== cfg.on_budget_exhausted || (conn || null) !== cfg.connection_id;
  const pct = Number(budget) > 0 ? Math.min(100, (spend.usd / Number(budget)) * 100) : 0;
  return (
    <div className="grid items-end gap-3 rounded-neo neo-inset-sm p-4 md:grid-cols-[1.3fr_1fr_1fr_0.8fr_auto]">
      <div>
        <p className="font-medium">{AGENTS[agentKey].label}</p>
        <p className="text-xs text-ink-3">{AGENTS[agentKey].purpose}. <span className="text-oxblood">Prohibited:</span> {AGENTS[agentKey].prohibited.toLowerCase()}.</p>
        <p className="mt-1 text-xs text-ink-3 tabular">This month: ${spend.usd.toFixed(2)} · {spend.runs} runs · {spend.tokens.toLocaleString()} tokens <Badge tone={pct >= 100 ? "critical" : pct > 80 ? "warning" : "neutral"} icon={false} className="ml-1">{pct.toFixed(0)}% of budget</Badge></p>
      </div>
      <Field label="Model"><Select value={model} disabled={disabled} onChange={(e) => setModel(e.target.value)}>{Object.entries(CLAUDE_MODELS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}</Select></Field>
      <Field label="Effort"><Segmented label="Effort" size="sm" value={effort} onChange={setEffort} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Med" }, { value: "high", label: "High" }]} /></Field>
      <Field label="Budget USD / month"><div className="flex gap-2"><Input value={budget} disabled={disabled} inputMode="decimal" onChange={(e) => setBudget(e.target.value)} /><Select aria-label="When exhausted" value={onEx} disabled={disabled} onChange={(e) => setOnEx(e.target.value as "pause")} className="w-28"><option value="pause">Pause</option><option value="warn">Warn</option></Select></div></Field>
      <div className="flex flex-col gap-2">
        {connections.length > 1 && <Select aria-label="Connection" value={conn} onChange={(e) => setConn(e.target.value)} className="h-9 text-xs"><option value="">Default</option>{connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}
        <Button size="sm" variant="primary" disabled={!dirty || disabled} onClick={() => onSave({ agent: agentKey, model, effort, monthly_budget_usd: Number(budget), on_budget_exhausted: onEx, connection_id: conn || null })}>Save</Button>
      </div>
    </div>
  );
}
