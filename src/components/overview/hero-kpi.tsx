"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { cn } from "@/components/neo/cn";
import CountUp from "@/components/reactbits/count-up";

type Delta = { value: string; direction: "up" | "down" | "flat" };

export function HeroKpi({ label, value, delta, className, numeric }: { label: string; value: React.ReactNode; delta?: Delta; className?: string; numeric?: { to: number; prefix?: string; suffix?: string; decimals?: number; separator?: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      className={cn("flex flex-col gap-3 rounded-[20px] p-[18px] neo-raised cursor-pointer", className)}
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.76rem] font-medium text-ink-3">{label}</span>
        {delta && (
          <motion.span
            className={cn("inline-flex items-center gap-1 text-[0.72rem] font-semibold", delta.direction === "up" ? "text-positive" : delta.direction === "down" ? "text-danger" : "text-ink-3")}
            initial={{ opacity: 0, x: 8 }}
            animate={isInView ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            {delta.direction === "up" ? <TrendingUp className="h-[13px] w-[13px]" /> : delta.direction === "down" ? <TrendingDown className="h-[13px] w-[13px]" /> : <Minus className="h-[13px] w-[13px]" />}
            {delta.value}
          </motion.span>
        )}
      </div>
      <div className="tabular text-[1.8rem] font-semibold leading-none tracking-tight text-ink">
        {numeric ? (
          <CountUp
            to={numeric.to}
            prefix={numeric.prefix}
            suffix={numeric.suffix}
            decimals={numeric.decimals}
            separator={numeric.separator ?? ","}
            duration={1.8}
            delay={0.2}
          />
        ) : (
          value
        )}
      </div>
    </motion.div>
  );
}
