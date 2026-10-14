"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "./cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
}

/** Soft sliding selector (reference: "Yes / No" selection pill). Keyboard: arrow keys. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-1 rounded-full neo-inset-sm p-1", className)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
        onChange(options[next].value);
        (e.currentTarget.querySelectorAll("[role=radio]")[next] as HTMLElement | undefined)?.focus();
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            type="button"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-0 rounded-full font-medium transition-colors duration-150",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm",
              active ? "text-ivory" : "text-ink-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-full neo-accent"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="inline-flex items-center gap-1.5">
              {o.label}
              {o.count != null && (
                <span className={cn("tabular rounded-full px-1.5 text-[0.65rem]", active ? "bg-white/15" : "bg-sunken")}>{o.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
