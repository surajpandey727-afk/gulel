import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, redact } from "@/lib/crypto";
import { AGENTS, estimateCostUsd, type AgentKey } from "@/lib/ai/models";
import { cacheKey, llmCacheGet, llmCacheSet } from "@/lib/cache";

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
  const { data: dbCfg } = await admin
    .from("agent_configurations")
    .select("model, effort, monthly_budget_usd, on_budget_exhausted, prompt_version, connection_id")
    .eq("workspace_id", workspaceId)
    .eq("agent", agent)
    .single();
  // Fall back to sensible defaults from the registry so agents work even before DB seeding.
  const cfg = dbCfg ?? {
    model: agent === "fidelity" || agent === "chitragupta" || agent === "classifier" ? "claude-haiku-5-5" : "claude-opus-5-5",
    effort: agent === "doot" || agent === "mariyada" || agent === "voice" ? "high" : agent === "classifier" || agent === "fidelity" || agent === "chitragupta" ? "low" : "medium",
    monthly_budget_usd: 50,
    on_budget_exhausted: "warn" as const,
    prompt_version: "v1",
    connection_id: null,
  };

  // Explicit connection for the agent, else the workspace's enabled Anthropic connection.
  let conn: { id: string; provider: string; label: string; base_url: string | null; anthropic_workspace_id: string | null; is_enabled: boolean } | null = null;
  const q = admin.from("provider_connections").select("id, provider, label, base_url, anthropic_workspace_id, is_enabled").eq("workspace_id", workspaceId);
  const { data: conns } = cfg.connection_id ? await q.eq("id", cfg.connection_id) : await q.eq("provider", "anthropic").eq("is_enabled", true).order("created_at");
  conn = conns?.[0] ?? null;
  if (conn && !conn.is_enabled) throw new GatewayError("not_configured", `Provider connection "${conn.label}" is disabled`);
  if (conn && conn.provider !== "anthropic" && !conn.base_url) {
    throw new GatewayError("not_configured", `Provider "${conn.provider}" requires a base URL for routing.`);
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
    provider: conn?.provider ?? "anthropic",
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
  /** Enables Anthropic server-side web search; output is then parsed from JSON text instead of a constrained format. */
  webSearch?: { maxUses: number; blockedDomains?: string[] };
  /** Cache the LLM response for identical (agent, system, input) combos. TTL in ms (default 1h). Set to 0 to disable. */
  cacheTtlMs?: number;
}

export interface RunResult<T> {
  data: T;
  executionId: string;
  model: string;
  provider: string;
  costUsd: number;
  /** URLs actually returned by web search during this call (for citation verification). */
  searchedUrls: string[];
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object in output");
  return JSON.parse(text.slice(start, end + 1));
}

export async function runStructured<S extends z.ZodType>(opts: RunOptions<S>): Promise<RunResult<z.infer<S>>> {
  const admin = createAdminClient();
  const agent = await resolveAgent(opts.workspaceId, opts.agent);

  const ttl = opts.cacheTtlMs ?? 0;
  if (ttl > 0) {
    const hash = cacheKey(opts.agent, agent.model, opts.system, opts.cachedContext ?? "", opts.input);
    const cached = await llmCacheGet(hash);
    if (cached) {
      const parsed = opts.schema.safeParse(cached);
      if (parsed.success) {
        return { data: parsed.data, executionId: "cached", model: agent.model, provider: agent.provider, costUsd: 0, searchedUrls: [] };
      }
    }
  }

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
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.input }];
    const tools = opts.webSearch
      ? ([{ type: "web_search_20260209", name: "web_search", max_uses: opts.webSearch.maxUses, ...(opts.webSearch.blockedDomains?.length ? { blocked_domains: opts.webSearch.blockedDomains } : {}) }] as unknown as Anthropic.ToolUnion[])
      : undefined;
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const allContent: Anthropic.ContentBlock[] = [];
    let response: Anthropic.Message;
    // server tools may pause a long turn; resume a bounded number of times (never an open-ended loop)
    for (let turn = 0; ; turn++) {
      const stream = agent.client.messages.stream({
        model: agent.model,
        max_tokens: opts.maxTokens ?? 16000,
        system,
        messages,
        ...(tools ? { tools } : {}),
        output_config: tools ? { effort: agent.effort } : { effort: agent.effort, format: zodOutputFormat(opts.schema) },
      });
      response = await stream.finalMessage();
      const u = response.usage;
      usage.input += u.input_tokens ?? 0;
      usage.output += u.output_tokens ?? 0;
      usage.cacheRead += u.cache_read_input_tokens ?? 0;
      usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
      allContent.push(...response.content);
      if (response.stop_reason !== "pause_turn" || turn >= 3) break;
      messages.push({ role: "assistant", content: response.content });
    }
    const searchedUrls = allContent.flatMap((b) => {
      const blk = b as unknown as { type: string; content?: unknown };
      if (blk.type !== "web_search_tool_result" || !Array.isArray(blk.content)) return [];
      return (blk.content as Array<{ type: string; url?: string }>).filter((r) => r.type === "web_search_result" && r.url).map((r) => r.url!);
    });
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
    let json: unknown;
    try { json = tools ? extractJson(text) : JSON.parse(text); } catch {
      await finish({ ...base, status: "invalid_output", error: "Output was not valid JSON" });
      throw new GatewayError("invalid_output", "AI output was not valid JSON and was not saved.");
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      await finish({ ...base, status: "invalid_output", error: redact(parsed.error.message).slice(0, 2000) });
      throw new GatewayError("invalid_output", "AI output failed validation and was not saved.");
    }
    await finish({ ...base, status: "succeeded" });
    if (ttl > 0) {
      const hash = cacheKey(opts.agent, agent.model, opts.system, opts.cachedContext ?? "", opts.input);
      await llmCacheSet(hash, opts.workspaceId, opts.agent, parsed.data, ttl).catch(() => {});
    }
    return { data: parsed.data, executionId: exec.id, model: response.model, provider: agent.provider, costUsd, searchedUrls };
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
