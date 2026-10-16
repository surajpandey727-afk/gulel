"use client";

import { animate, useInView } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  separator?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export default function CountUp({
  to,
  from = 0,
  duration = 1.6,
  delay = 0,
  className = "",
  style,
  separator = "",
  prefix = "",
  suffix = "",
  decimals,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayed, setDisplayed] = useState(from);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(from, to, {
      duration,
      delay,
      ease: [0.33, 1, 0.68, 1],
      onUpdate(v) {
        setDisplayed(v);
      },
    });
    return () => controls.stop();
  }, [isInView, from, to, duration, delay]);

  const places = decimals ?? (Number.isInteger(to) ? 0 : 2);
  const formatted = displayed.toFixed(places);
  const [int, frac] = formatted.split(".");
  const grouped = separator
    ? int.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    : int;

  return (
    <span
      ref={ref}
      className={className}
      style={{ fontVariantNumeric: "tabular-nums", ...style }}
    >
      {prefix}
      {grouped}
      {frac ? `.${frac}` : ""}
      {suffix}
    </span>
  );
}
