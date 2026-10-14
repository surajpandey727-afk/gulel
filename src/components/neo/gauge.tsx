import { cn } from "./cn";

/**
 * Circular dial (reference: raised knob with recessed track). Used for qualification score,
 * data completeness, research confidence. `value` 0–100; null renders "—" (unknown, not zero).
 */
export function Gauge({
  value,
  label,
  size = 112,
  sublabel,
  muted = false,
  className,
}: {
  value: number | null;
  label: string;
  size?: number;
  sublabel?: string;
  muted?: boolean;
  className?: string;
}) {
  const stroke = Math.max(6, size * 0.075);
  const r = (size - stroke) / 2 - size * 0.06;
  const c = 2 * Math.PI * r;
  const arc = 0.78; // 280° sweep
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const dash = `${(c * arc * v) / 100} ${c}`;
  const rotate = 90 + (360 * (1 - arc)) / 2;
  return (
    <figure className={cn("flex flex-col items-center gap-2", className)} aria-label={`${label}: ${value == null ? "unknown" : Math.round(v)} of 100`} role="img">
      <div className="relative grid place-items-center rounded-full neo-raised" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke}
            strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" transform={`rotate(${rotate} ${size / 2} ${size / 2})`}
            style={{ filter: "drop-shadow(1px 1px 1px #b9b0a466)" }} />
          {value != null && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={muted ? "var(--ink-3)" : "var(--brand-oxblood)"} strokeWidth={stroke}
              strokeDasharray={dash} strokeLinecap="round" transform={`rotate(${rotate} ${size / 2} ${size / 2})`}
              className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out)]" />
          )}
        </svg>
        <div className="relative grid place-items-center rounded-full neo-raised-sm" style={{ width: size * 0.56, height: size * 0.56 }}>
          <span className="tabular font-semibold text-ink" style={{ fontSize: size * 0.2 }}>
            {value == null ? "—" : Math.round(v)}
          </span>
        </div>
      </div>
      <figcaption className="text-center">
        <span className="block text-xs font-medium text-ink-2">{label}</span>
        {sublabel && <span className="block text-[0.7rem] text-ink-3">{sublabel}</span>}
      </figcaption>
    </figure>
  );
}

/** Recessed progress bar (reference: inset track with raised oxblood fill). */
export function Meter({ value, label, showValue = true, className }: { value: number | null; label: string; showValue?: boolean; className?: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-2">{label}</span>
        {showValue && <span className="tabular text-ink-3">{value == null ? "unknown" : `${Math.round(v)}%`}</span>}
      </div>
      <div className="h-2.5 rounded-full neo-inset-sm p-[2px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-label={label}>
        <div className="h-full rounded-full bg-oxblood transition-[width] duration-500" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
