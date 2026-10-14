import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, redact } from "@/lib/crypto";
import { estimateCostUsd, type AgentKey } from "@/lib/ai/models";

/**
 * AI Provider Gateway. The ONLY place that talks to an LLM.
 * - Anthropic is the sole active provider unless an admin enables another connection.
 * - No cross-provider fallback unless the agent's config explicitly allows it.
 * - Every call is metered in agent_executions with provider + model + tokens + cost.
 * - Credentials are decrypted server-side per call and never logged or put in prompts.
 */
export class GatewayError extends Error {
  constructor(public code: "not_configured" | "budget_exhausted" | "provider_error" | "invalid_output" | "refused" | "rate_limited" | "auth_failed", message: string) {
    super(message);
  }
}

interface ResolvedAgent {
  provider: string;
  connectionId: string | null;
  connectionLabel: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  budgetUsd: number;
  onExhausted: "pause" | "warn";
  promptVersion: string;
  client: Anthropic;
}

async function resolveAgent(workspaceId: string, agent: AgentKey): Promise<ResolvedAgent> {
  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("agent_configurations")
    .select("model, effort, monthly_budget_usd, on_budget_exhausted, prompt_version, connection_id")
    .eq("workspace_id", workspaceId)
    .eq("agent", agent)
    .single();
  if (!cfg) throw new GatewayError("not_configured", `No configuration for agent ${agent}`);

  // Explicit connection for the agent, else the workspace's enabled Anthropic connection.
  let conn: { id: string; provider: string; label: string; base_url: string | null; anthropic_workspace_id: string | null; is_enabled: boolean } | null = null;
  const q = admin.from("provider_connections").select("id, provider, label, base_url, anthropic_workspace_id, is_enabled").eq("workspace_id", workspaceId);
  const { data: conns } = cfg.connection_id ? await q.eq("id", cfg.connection_id) : await q.eq("provider", "anthropic").eq("is_enabled", true).order("created_at");
  conn = conns?.[0] ?? null;
  if (conn && !conn.is_enabled) throw new GatewayError("not_configured", `Provider connection "${conn.label}" is disabled`);
  if (conn && conn.provider !== "anthropic") {
    // OmniRoute and other gateways are stored for future use but not executable yet.
    throw new GatewayError("not_configured", `Provider "${conn.provider}" is not enabled for execution in this build`);
  }

  let apiKey: string | undefined;
  let anthropicWorkspace: string | null = null;
  if (conn) {
    const { data: secret } = await admin.from("provider_secrets").select("ciphertext").eq("connection_id", conn.id).maybeSingle();
    if (!secret) throw new GatewayError("not_configured", `No credential stored for "${conn.label}"`);
    apiKey = decryptSecret(secret.ciphertext);
    anthropicWorkspace = conn.anthropic_workspace_id;
  } else if (process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    anthropicWorkspace = process.env.ANTHROPIC_WORKSPACE_ID || null;
  } else {
    throw new GatewayError("not_configured", "No Anthropic credential configured. Add one in Settings → AI providers.");
  }

  const client = new Anthropic({
    apiKey,
    baseURL: conn?.base_url || undefined,
    maxRetries: 2,
    defaultHeaders: anthropicWorkspace ? { "anthropic-workspace-id": anthropicWorkspace } : undefined,
  });
  return {
    provider: "anthropic",
    connectionId: conn?.id ?? null,
    connectionLabel: conn?.label ?? "environment",
    model: cfg.model,
    effort: cfg.effort,
    budgetUsd: Number(cfg.monthly_budget_usd),
    onExhausted: cfg.on_budget_exhausted,
    promptVersion: cfg.prompt_version,
    client,
  };
}

async function monthSpend(workspaceId: string, agent: AgentKey) {
  const admin = createAdminClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("agent_executions").select("cost_usd").eq("workspace_id", workspaceId).eq("agent", agent).gte("started_at", start.toISOString());
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

export interface RunOptions<S extends z.ZodType> {
  workspaceId: string;
  agent: AgentKey;
  system: string;
  /** Stable, cacheable context (e.g. voice profile). Placed before volatile input. */
  cachedContext?: string;
  input: string;
  schema: S;
  maxTokens?: number;
  entity?: { type: string; id: string };
  userId?: string | null;
  correlationId?: string;
}

export interface RunResult<T> {
  data: T;
  executionId: string;
  model: string;
  provider: string;
  costUsd: number;
}

export async function runStructured<S extends z.ZodType>(opts: RunOptions<S>): Promise<RunResult<z.infer<S>>> {
  const admin = createAdminClient();
  const agent = await resolveAgent(opts.workspaceId, opts.agent);

  const spent = await monthSpend(opts.workspaceId, opts.agent);
  const { data: exec } = await admin
    .from("agent_executions")
    .insert({
      workspace_id: opts.workspaceId,
      agent: opts.agent,
      provider: agent.provider,
      model: agent.model,
      prompt_version: agent.promptVersion,
      entity_type: opts.entity?.type,
      entity_id: opts.entity?.id,
      correlation_id: opts.correlationId,
      triggered_by: opts.userId ?? null,
      status: spent >= agent.budgetUsd && agent.onExhausted === "pause" ? "blocked_budget" : "running",
    })
    .select("id, status")
    .single();
  if (!exec) throw new GatewayError("provider_error", "Could not record execution");
  if (exec.status === "blocked_budget") {
    await admin.from("agent_executions").update({ finished_at: new Date().toISOString(), error: `Monthly budget $${agent.budgetUsd} exhausted` }).eq("id", exec.id);
    throw new GatewayError("budget_exhausted", `${opts.agent} agent has used its $${agent.budgetUsd} monthly budget. Raise it in Settings → AI providers.`);
  }

  const finish = async (patch: Record<string, unknown>) => {
    await admin.from("agent_executions").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", exec.id);
  };

  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: opts.system }];
  if (opts.cachedContext) system.push({ type: "text", text: opts.cachedContext, cache_control: { type: "ephemeral" } });

  try {
    const stream = agent.client.messages.stream({
      model: agent.model,
      max_tokens: opts.maxTokens ?? 16000,
      system,
      messages: [{ role: "user", content: opts.input }],
      output_config: { effort: agent.effort, format: zodOutputFormat(opts.schema) },
    });
    const response = await stream.finalMessage();
    const u = response.usage;
    const usage = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    };
    const costUsd = estimateCostUsd(agent.model, usage);
    const base = {
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_read_tokens: usage.cacheRead,
      cache_write_tokens: usage.cacheWrite,
      cost_usd: costUsd,
      request_id: (response as unknown as { _request_id?: string })._request_id ?? null,
      model: response.model,
    };
    if (response.stop_reason === "refusal") {
      await finish({ ...base, status: "failed", error: "refusal" });
      throw new GatewayError("refused", "The model declined this request.");
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = opts.schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      await finish({ ...base, status: "invalid_output", error: redact(parsed.error.message).slice(0, 2000) });
      throw new GatewayError("invalid_output", "AI output failed validation and was not saved.");
    }
    await finish({ ...base, status: "succeeded" });
    return { data: parsed.data, executionId: exec.id, model: response.model, provider: agent.provider, costUsd };
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    let code: GatewayError["code"] = "provider_error";
    if (err instanceof Anthropic.RateLimitError) code = "rate_limited";
    else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) code = "auth_failed";
    const apiMsg = err instanceof Anthropic.APIError ? (err.error as { error?: { message?: string } } | undefined)?.error?.message : undefined;
    let message = redact(apiMsg ?? (err instanceof Error ? err.message : String(err))).slice(0, 2000);
    if (/not scoped to a workspace/i.test(message)) { code = "auth_failed"; message = "This Anthropic key is organisation-level and needs a workspace ID. Add it in Settings → Claude & AI providers (Rotate / edit)."; }
    await finish({ status: "failed", error: message });
    throw new GatewayError(code, message);
  }
}

/** Minimal connectivity check used by Settings → Test connection. */
export async function testConnection(apiKey: string, anthropicWorkspaceId: string | null, model = "claude-haiku-5-5") {
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    defaultHeaders: anthropicWorkspaceId ? { "anthropic-workspace-id": anthropicWorkspaceId } : undefined,
  });
  const started = Date.now();
  try {
    const r = await client.messages.create({ model, max_tokens: 16, messages: [{ role: "user", content: "Reply with OK." }] });
    return { ok: true as const, model: r.model, latencyMs: Date.now() - started };
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    return { ok: false as const, status, error: redact(err instanceof Error ? err.message : String(err)).slice(0, 500), latencyMs: Date.now() - started };
  }
}
