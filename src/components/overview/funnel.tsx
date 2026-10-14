const LABEL: Record<string, string> = { discovered: "Discovered", qualified: "Qualified", contacted: "Contacted", replied: "Replied", meeting: "Meeting", opportunity: "Opportunity", won: "Won" };

/** Organisation-level funnel for the cohort created in the selected period. */
export function Funnel({ stages }: { stages: Array<{ stage: string; count: number }> }) {
  const top = Math.max(1, stages[0]?.count ?? 0);
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Conversion funnel">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const conv = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.stage} className="grid grid-cols-[88px_1fr_76px] items-center gap-3 text-sm">
            <span className="text-ink-2">{LABEL[s.stage] ?? s.stage}</span>
            <div className="h-6 rounded-full neo-inset-sm p-[3px]">
              {s.count > 0 && <div className="flex h-full items-center rounded-full bg-oxblood/90 px-2 text-[0.7rem] font-semibold text-ivory transition-[width] duration-700"
                style={{ width: `${Math.max(s.count ? 6 : 0, (s.count / top) * 100)}%` }}>
                <span className="tabular">{s.count}</span>
              </div>}
            </div>
            <span className="tabular text-right text-xs text-ink-3">{i === 0 ? `${s.count} orgs` : conv == null ? "—" : `${conv}% of prev`}</span>
          </li>
        );
      })}
    </ol>
  );
}
