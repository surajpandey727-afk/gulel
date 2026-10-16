"use client";

import { motion, useInView } from "motion/react";
import { useRef, useMemo } from "react";

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  blur?: number;
  distance?: number;
  duration?: number;
}

export default function BlurText({
  text,
  delay = 80,
  className = "",
  animateBy = "words",
  direction = "top",
  blur = 6,
  distance = 20,
  duration = 0.4,
}: BlurTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px" });

  const pieces = useMemo(() => {
    if (animateBy === "letters") return Array.from(text);
    return text.split(" ");
  }, [text, animateBy]);

  const sign = direction === "top" ? -1 : 1;

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-flex", flexWrap: "wrap" }}
      aria-label={text}
    >
      {pieces.map((piece, i) => (
        <motion.span
          key={`${piece}-${i}`}
          aria-hidden
          initial={{
            filter: `blur(${blur}px)`,
            opacity: 0,
            y: sign * distance,
          }}
          animate={
            isInView
              ? { filter: "blur(0px)", opacity: 1, y: 0 }
              : undefined
          }
          transition={{
            duration,
            delay: i * (delay / 1000),
            ease: [0.33, 1, 0.68, 1],
          }}
          style={{
            display: "inline-block",
            willChange: "transform, filter, opacity",
          }}
        >
          {piece}
          {animateBy === "words" && i < pieces.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}
