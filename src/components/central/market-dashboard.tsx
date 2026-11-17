import Link from "next/link";
import { cn } from "@/components/neo/cn";
import type { MarketSummary } from "@/lib/central/metrics";
import { money } from "@/lib/central/metrics";
import { PALETTE, labelColor } from "./palette";

/** India | Global side by side. Pure presentation: the numbers come from marketSummary() so every page agrees. */
export function MarketDashboard({ markets, compact = false }: { markets: MarketSummary[]; compact?: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {markets.map((m) => <MarketCard key={m.market} m={m} compact={compact} />)}
    </div>
  );
}

function MarketCard({ m, compact }: { m: MarketSummary; compact: boolean }) {
  const sheet = m.market === "IN" ? "India" : "Global";
  const maxStage = Math.max(1, ...m.byStage.map((s) => s.count));
  return (
    <section aria-label={`${m.label} market`} className="flex min-w-0 flex-col gap-4 rounded-neo neo-raised p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{m.market === "IN" ? "India market" : "Global market · excludes India"}</p>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{m.label}</h2>
        </div>
        <Link href={`/central/board/Pipeline_${sheet}`} className="shrink-0 text-xs text-oxblood hover:underline">Open pipeline</Link>
      </header>

      <div className="grid grid-cols-2 gap-2.5 2xl:grid-cols-3">
        <Tile label="Open opportunities" value={m.openOpportunities} sub={`${m.opportunities} in total${m.wonOpportunities ? ` · ${m.wonOpportunities} won` : ""}`} href={`/central/board/Pipeline_${sheet}`} />
        <Tile label="Open pipeline value" value={m.openValue.length ? m.openValue.map((v) => money(v.currency, v.amount)).join(" · ") : "—"} sub="typed Value, or linked projects" href={`/central/board/Pipeline_${sheet}`} />
        <Tile label="Qualified" value={m.qualified} sub={`${m.toQualify} to be qualified`} href={`/central/board/Pipeline_${sheet}`} />
        <Tile label="Active partners" value={m.activePartners} sub={`${m.partners} partners in total`} href={`/central/board/Partners_${sheet}`} />
        <Tile label="Organisations" value={m.organisations} sub={`${m.contacts} contacts · ${m.activeProjects} active project${m.activeProjects === 1 ? "" : "s"}`} href="/central/board/Organisations" />
        <Tile label="Next actions" value={m.dueSoon} sub={m.overdue ? `${m.overdue} overdue` : "due in 7 days · none overdue"} tone={m.overdue ? "danger" : undefined} href={`/central/board/Pipeline_${sheet}`} />
      </div>

      {!compact && (
        <div>
          <p className="mb-2 text-[0.625rem] font-medium uppercase tracking-wider text-ink-3">Opportunities by stage</p>
          <ul className="flex flex-col gap-1.5">
            {m.byStage.map(({ item, count }) => (
              <li key={item.item_id} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 truncate text-ink-2">{item.name}</span>
                <div className="flex h-4 flex-1 items-center rounded-sm bg-sunken/60">
                  {count > 0 && <div className={cn("h-full rounded-sm", PALETTE[labelColor(item)].bar)} style={{ width: `${(count / maxStage) * 100}%` }} />}
                </div>
                <span className="w-6 shrink-0 text-right font-medium tabular text-ink">{count}</span>
              </li>
            ))}
          </ul>
          {m.withNotes > 0 && <p className="mt-3 text-[0.6875rem] text-ink-3">{m.withNotes} pipeline and partner row{m.withNotes === 1 ? "" : "s"} carry notes.</p>}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: string; tone?: "danger"; href: string }) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-0.5 rounded-neo-sm neo-inset-sm px-3 py-2.5 transition-colors hover:text-oxblood">
      <span className="text-[0.625rem] font-medium uppercase leading-tight tracking-wider text-ink-3">{label}</span>
      <span className="truncate text-lg font-semibold tabular text-ink">{value}</span>
      {sub && <span className={cn("text-[0.6875rem] leading-snug", tone === "danger" ? "font-medium text-danger" : "text-ink-3")}>{sub}</span>}
    </Link>
  );
}
