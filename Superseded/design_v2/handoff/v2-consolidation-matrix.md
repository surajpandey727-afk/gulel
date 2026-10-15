# Gulel V2 — Consolidation Matrix

V2 (AI Command Centre) is the master design. V1 (Executive Intelligence) and V3 (Commercial Operations) contributed missing substance. The switcher and the standalone V1/V3/Rationale views were removed.

## Retained from V2 (base)
| Element | Notes |
|---|---|
| AI insight cards (micro-bar trends) | Kept as the interpretive layer |
| Reply heatmap (day × hour) | Theme-aware opacity on `--chart-1` |
| Reply classification donut | 4 brand-family segments |
| Weekly sent-vs-replied bars | |
| UK vs India benchmark bars | |
| Floating agent (now Sutradhar) | Promoted to six-agent orchestration |

## Added from V1 (executive intelligence)
| Element | Why |
|---|---|
| Hero KPI strip (pipeline £, reply %, meetings, qualified) w/ sparklines + deltas | Executive-level "what changed" at a glance |
| 90-day Pipeline & Won area chart | Trend / decision support |
| Chanakya executive summary card | Prioritised "where to focus" |
| Personalised greeting + daily digest subline | Executive framing |

## Added from V3 (operational depth)
| Element | Why |
|---|---|
| Mariyada approval queue (inline approve/reject) | Operational control on the dashboard |
| Team activity feed (live) | Collaboration visibility |
| Active organisations table (click → Quick View) | Dense record access + drill-down |

## Merged / de-duplicated
- A single funnel/benchmark set (V1 & V3 both had funnels) — kept one.
- Mini stat rail (V3) dropped: superseded by the richer hero KPI strip.
- One executive summary (V1) instead of V1 summary + V3 "focus" card.

## Excluded (and why)
- V1/V3/Rationale as separate selectable views — brief requires ONE consolidated V2.
- Duplicate KPI walls — replaced by prioritised hero + progressive disclosure.
