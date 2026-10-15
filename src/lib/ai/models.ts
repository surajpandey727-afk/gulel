/** Supported Claude models and list prices (USD per million tokens). Cached 2026-10-06 — verify on rotation. */
export const CLAUDE_MODELS = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { label: "Claude Fable 5.1", input: 10, output: 50, cacheRead: 0.25 },
} as const;
export type ClaudeModel = keyof typeof CLAUDE_MODELS;

export const AGENTS = {
  discovery: { label: "Discovery AI", purpose: "Find, validate and enrich opportunities", prohibited: "Sending or preparing outbound messages" },
  governance: { label: "Governance AI", purpose: "Evaluate outreach suitability and draft communications", prohibited: "Sending without explicit human approval" },
  analyst: { label: "Intelligence Analyst", purpose: "Explain trends, pipeline and next actions", prohibited: "Modifying records or sending messages" },
  voice: { label: "Voice DNA", purpose: "Extract and maintain the founder's writing profile", prohibited: "Any external action" },
  classifier: { label: "Reply classifier", purpose: "Propose reply categories for human review", prohibited: "Changing pipeline state without review" },
  fidelity: { label: "Voice Fidelity", purpose: "Independently score drafts against the founder's voice profile", prohibited: "Any external action or draft modification" },
} as const;
export type AgentKey = keyof typeof AGENTS;

export function isClaudeModel(m: string): m is ClaudeModel {
  return m in CLAUDE_MODELS;
}

export function estimateCostUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const p = isClaudeModel(model) ? CLAUDE_MODELS[model] : CLAUDE_MODELS["claude-opus-5-5"];
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 1.25) / 1_000_000;
}
