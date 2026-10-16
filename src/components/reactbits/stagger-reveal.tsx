"use client";

import { motion, useInView } from "motion/react";
import { Children, useRef, type ReactNode } from "react";

interface StaggerRevealProps {
  children: ReactNode;
  stagger?: number;
  duration?: number;
  className?: string;
  as?: "ul" | "ol" | "div";
}

export function StaggerReveal({
  children,
  stagger = 0.06,
  duration = 0.35,
  className,
  as: Tag = "div",
}: StaggerRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const items = Children.toArray(children);

  return (
    <Tag ref={ref as never} className={className}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{
            duration,
            delay: i * stagger,
            ease: [0.33, 1, 0.68, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </Tag>
  );
}
