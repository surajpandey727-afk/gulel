/**
 * Deterministic, explainable qualification score.
 * - Missing evidence is NOT zero: unknown dimensions are excluded from the score and
 *   reported as reduced coverage.
 * - Freshness decays a dimension's contribution toward neutral (5/10) as evidence ages.
 */
export const DIMENSIONS = [
  { key: "strategic_need", label: "Strategic need & advisory fit", defaultWeight: 20 },
  { key: "buying_intent", label: "Demonstrated buying intent", defaultWeight: 20 },
  { key: "financial_capacity", label: "Financial capacity", defaultWeight: 15 },
  { key: "trigger_strength", label: "Trigger strength & recency", defaultWeight: 15 },
  { key: "decision_maker_access", label: "Decision-maker accessibility", defaultWeight: 10 },
  { key: "growth_scale", label: "Growth potential & scale", defaultWeight: 10 },
  { key: "procurement_readiness", label: "Prior advisory & procurement readiness", defaultWeight: 5 },
  { key: "credibility", label: "Corporate credibility & diligence", defaultWeight: 5 },
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number]["key"];
export type Weights = Record<DimensionKey, number>;

export const DEFAULT_WEIGHTS = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.defaultWeight])) as Weights;

export interface DimensionInput {
  key: DimensionKey;
  raw: number | null; // 0–10, null = unknown
  confidence: number | null; // 0–1
  evidenceAgeDays?: number | null; // age of the freshest supporting evidence
  rationale?: string;
  evidenceIds?: string[];
}

export interface Band { min: number; label: string }
export const DEFAULT_BANDS: Band[] = [
  { min: 85, label: "priority_review" },
  { min: 70, label: "qualified" },
  { min: 50, label: "nurture" },
  { min: 0, label: "low_priority" },
];
export const BAND_LABEL: Record<string, string> = {
  priority_review: "Priority review",
  qualified: "Qualified opportunity",
  nurture: "Nurture / investigate",
  low_priority: "Low priority",
};

export function validateWeights(w: Record<string, number>): string | null {
  const keys = DIMENSIONS.map((d) => d.key);
  for (const k of keys) if (typeof w[k] !== "number" || w[k] < 0) return `Missing or negative weight: ${k}`;
  const total = keys.reduce((s, k) => s + w[k], 0);
  return Math.abs(total - 100) < 1e-9 ? null : `Weights must sum to 100 (currently ${total})`;
}

export function freshnessFactor(ageDays: number | null | undefined, halfLifeDays: number): number {
  if (ageDays == null || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export interface ScoreResult {
  score: number; // 0–100 over known dimensions
  coverage: number; // 0–1 share of weight with evidence
  evidenceConfidence: number; // 0–1 weighted by weight × coverage
  band: string;
  dimensions: Array<DimensionInput & { weight: number; freshness: number; effective: number | null; contribution: number | null }>;
  unknown: DimensionKey[];
}

export function computeScore(
  inputs: DimensionInput[],
  weights: Weights = DEFAULT_WEIGHTS,
  opts: { halfLifeDays?: number; bands?: Band[] } = {},
): ScoreResult {
  const halfLife = opts.halfLifeDays ?? 180;
  const bands = [...(opts.bands ?? DEFAULT_BANDS)].sort((a, b) => b.min - a.min);
  const byKey = new Map(inputs.map((i) => [i.key, i]));
  let knownWeight = 0;
  let weighted = 0;
  let confWeighted = 0;
  const unknown: DimensionKey[] = [];

  const dimensions = DIMENSIONS.map(({ key }) => {
    const input = byKey.get(key) ?? { key, raw: null, confidence: null };
    const weight = weights[key];
    if (input.raw == null) {
      unknown.push(key);
      return { ...input, weight, freshness: 1, effective: null, contribution: null };
    }
    const raw = Math.min(10, Math.max(0, input.raw));
    const freshness = freshnessFactor(input.evidenceAgeDays, halfLife);
    const effective = 5 + (raw - 5) * freshness; // stale evidence regresses to neutral
    knownWeight += weight;
    weighted += weight * (effective / 10);
    confWeighted += weight * (input.confidence ?? 0.5) * freshness;
    return { ...input, raw, weight, freshness, effective, contribution: weight * (effective / 10) };
  });

  const score = knownWeight > 0 ? (weighted / knownWeight) * 100 : 0;
  const coverage = knownWeight / 100;
  const evidenceConfidence = knownWeight > 0 ? (confWeighted / knownWeight) * coverage : 0;
  const rounded = Math.round(score * 100) / 100;
  const band = bands.find((b) => rounded >= b.min)?.label ?? "low_priority";
  return {
    score: rounded,
    coverage: Math.round(coverage * 1000) / 1000,
    evidenceConfidence: Math.round(evidenceConfidence * 1000) / 1000,
    band,
    dimensions,
    unknown,
  };
}

/** Initial heuristic — explicitly NOT a calibrated probability. */
export function heuristicPropensity(r: ScoreResult, hasNamedRecipient: boolean): "high" | "medium" | "low" | "unknown" {
  if (r.coverage < 0.5) return "unknown";
  const intent = r.dimensions.find((d) => d.key === "buying_intent")?.effective ?? 5;
  const trigger = r.dimensions.find((d) => d.key === "trigger_strength")?.effective ?? 5;
  const signal = (intent + trigger) / 2 + (hasNamedRecipient ? 1 : -1);
  return signal >= 7.5 ? "high" : signal >= 5 ? "medium" : "low";
}
