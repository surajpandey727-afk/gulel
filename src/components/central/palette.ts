import type { RefItem } from "@/lib/central/types";

/** Label and row colours, restricted to the design system's existing tokens. */
export const PALETTE = {
  green: { label: "Forest", pill: "bg-oxblood/15 text-oxblood ring-oxblood/25", dot: "bg-oxblood", row: "bg-oxblood/[0.05]", bar: "bg-oxblood" },
  moss: { label: "Moss", pill: "bg-chart-2/15 text-chart-2 ring-chart-2/30", dot: "bg-chart-2", row: "bg-chart-2/[0.07]", bar: "bg-chart-2" },
  olive: { label: "Olive", pill: "bg-chart-4/15 text-chart-4 ring-chart-4/30", dot: "bg-chart-4", row: "bg-chart-4/[0.07]", bar: "bg-chart-4" },
  amber: { label: "Amber", pill: "bg-warning/15 text-warning ring-warning/30", dot: "bg-warning", row: "bg-warning/[0.07]", bar: "bg-warning" },
  red: { label: "Red", pill: "bg-danger/12 text-danger ring-danger/25", dot: "bg-danger", row: "bg-danger/[0.06]", bar: "bg-danger" },
  taupe: { label: "Taupe", pill: "bg-chart-3/20 text-ink-2 ring-chart-3/40", dot: "bg-chart-3", row: "bg-chart-3/[0.10]", bar: "bg-chart-3" },
  cream: { label: "Cream", pill: "bg-buttercream text-ink ring-hairline", dot: "bg-buttercream ring-1 ring-hairline", row: "bg-buttercream/50", bar: "bg-buttercream" },
  grey: { label: "Grey", pill: "bg-ink-3/12 text-ink-2 ring-ink-3/25", dot: "bg-ink-3", row: "bg-ink-3/[0.06]", bar: "bg-ink-3" },
} as const;
export type PaletteKey = keyof typeof PALETTE;
export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

const DONE = /^(won|paid|completed|active|received|permission given|y|yes|qualified)$/i;
const BAD = /^(lost|cancelled|declined|retired|disqualified|n|no)$/i;
const IDLE = /^(parked|on hold|draft|unconfirmed|yet to start|identified|to be qualified)$/i;
const WARM = /^(proposal|invoiced|ongoing|in conversation|structure agreed|first joint pitch|locked|proposed)$/i;
const CYCLE: PaletteKey[] = ["moss", "olive", "taupe", "green", "amber", "cream"];

export function autoColor(name: string, position = 0): PaletteKey {
  if (DONE.test(name)) return "green";
  if (BAD.test(name)) return "red";
  if (IDLE.test(name)) return "grey";
  if (WARM.test(name)) return "amber";
  return CYCLE[Math.abs(position) % CYCLE.length];
}

export function labelColor(item: Pick<RefItem, "color" | "name" | "position"> | undefined | null): PaletteKey {
  if (!item) return "grey";
  return item.color && item.color in PALETTE ? (item.color as PaletteKey) : autoColor(item.name, item.position);
}
