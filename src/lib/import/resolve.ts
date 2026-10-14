/**
 * Multi-signal entity resolution. Name similarity alone never auto-merges.
 * Strong identifiers (domain, registration number) dominate; name similarity only
 * proposes a match unless market also agrees and similarity is very high.
 */
export interface OrgCandidate {
  normalisedName: string;
  domain: string | null;
  registrationNumber: string | null;
  market: "UK" | "IN" | null;
}
export interface ExistingOrg extends OrgCandidate {
  id: string;
  aliases?: string[];
}

export function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / (A.size + B.size - inter);
}

export type ResolutionDecision = "auto_merge" | "propose" | "new";
export interface Resolution {
  decision: ResolutionDecision;
  matchId: string | null;
  score: number;
  signals: { domain: boolean; regno: boolean; nameSim: number; market: boolean | null };
}

export function resolveOrganisation(c: OrgCandidate, existing: ExistingOrg[]): Resolution {
  let best: Resolution = { decision: "new", matchId: null, score: 0, signals: { domain: false, regno: false, nameSim: 0, market: null } };
  for (const e of existing) {
    const domain = !!c.domain && !!e.domain && c.domain === e.domain;
    const regno = !!c.registrationNumber && !!e.registrationNumber &&
      c.registrationNumber.replace(/\s/g, "").toUpperCase() === e.registrationNumber.replace(/\s/g, "").toUpperCase();
    const nameSim = Math.max(similarity(c.normalisedName, e.normalisedName), ...(e.aliases ?? []).map((a) => similarity(c.normalisedName, a)));
    const market = c.market && e.market ? c.market === e.market : null;
    // conflicting strong identifiers → different entities
    const regConflict = !!c.registrationNumber && !!e.registrationNumber && !regno;
    const domConflict = !!c.domain && !!e.domain && !domain;

    let score = 0;
    if (regno) score = 1;
    else if (domain) score = 0.95;
    else if (!regConflict && !domConflict) score = nameSim * (market === false ? 0.6 : 1);
    if (regConflict) score = Math.min(score, 0.3);

    if (score > best.score) {
      const decision: ResolutionDecision =
        regno || domain ? "auto_merge"
        : nameSim >= 0.92 && market !== false && !domConflict && !regConflict ? "propose"
        : nameSim >= 0.6 && !domConflict && !regConflict ? "propose"
        : "new";
      best = { decision, matchId: decision === "new" ? null : e.id, score: Math.round(score * 1000) / 1000, signals: { domain, regno, nameSim: Math.round(nameSim * 1000) / 1000, market } };
    }
  }
  return best;
}
