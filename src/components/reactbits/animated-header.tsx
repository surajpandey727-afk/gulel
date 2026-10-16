"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

export function AnimatedPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <motion.h1
          className="text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]"
          initial={{ opacity: 0, filter: "blur(8px)", y: 12 }}
          animate={isInView ? { opacity: 1, filter: "blur(0px)", y: 0 } : undefined}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            className="mt-1 max-w-2xl text-sm text-ink-3"
            initial={{ opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.33, 1, 0.68, 1] }}
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}
