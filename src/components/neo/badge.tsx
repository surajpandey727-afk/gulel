import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Clock, Info, ShieldAlert } from "lucide-react";
import { cn } from "./cn";

type Tone = "neutral" | "accent" | "positive" | "warning" | "critical" | "muted";
const toneCls: Record<Tone, string> = {
  neutral: "text-ink-2",
  accent: "text-oxblood",
  positive: "text-positive",
  warning: "text-warning",
  critical: "text-oxblood font-semibold",
  muted: "text-ink-3",
};
const toneIcon: Record<Tone, React.ComponentType<{ className?: string }> | null> = {
  neutral: null, accent: null, positive: CheckCircle2, warning: AlertTriangle, critical: ShieldAlert, muted: CircleDashed,
};

/** Status chip: tone is always paired with an icon or text so meaning never relies on colour alone. */
export function Badge({ tone = "neutral", icon = true, children, className, title }: { tone?: Tone; icon?: boolean; children: React.ReactNode; className?: string; title?: string }) {
  const Icon = icon ? toneIcon[tone] : null;
  return (
    <span title={title} className={cn("inline-flex h-6 items-center gap-1 rounded-full neo-raised-sm px-2.5 text-[0.7rem] font-medium leading-none", toneCls[tone], className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function MarketBadge({ market }: { market: string | null | undefined }) {
  if (!market) return <Badge tone="muted" icon={false}>—</Badge>;
  return (
    <Badge tone="neutral" icon={false} title={market === "UK" ? "United Kingdom · GBP" : "India · INR"}>
      {market} <span className="text-ink-3">· {market === "UK" ? "GBP" : "INR"}</span>
    </Badge>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  verified: "positive", candidate: "warning", missing: "muted", invalid: "critical",
  pending: "warning", approved: "positive", rejected: "critical", invalidated: "muted", consumed: "positive", snoozed: "muted", expired: "muted",
  sent_confirmed: "positive", manual_confirmed: "neutral", failed: "critical", bounced: "critical",
  connected: "positive", not_configured: "muted", awaiting_user_action: "warning", permission_restricted: "warning", rate_limited: "warning", stale: "warning", disabled: "muted",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

export { Info, Clock, CircleSlash };
