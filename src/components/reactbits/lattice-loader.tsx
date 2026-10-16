"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/components/neo/cn";

interface LatticeLoaderProps {
  size?: number;
  color?: string;
  speed?: number;
  className?: string;
}

export function LatticeLoader({
  size = 28,
  color = "currentColor",
  speed = 1.2,
  className,
}: LatticeLoaderProps) {
  const dots = Array.from({ length: 9 });
  const gap = size / 3;

  return (
    <div
      className={cn("inline-grid", className)}
      style={{
        gridTemplateColumns: `repeat(3, ${gap}px)`,
        gridTemplateRows: `repeat(3, ${gap}px)`,
        gap: 0,
      }}
      role="status"
      aria-label="Loading"
    >
      {dots.map((_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const delay = (row + col) * (speed / 6);
        return (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: gap * 0.55,
              height: gap * 0.55,
              margin: "auto",
              backgroundColor: color,
              animation: `lattice-pulse ${speed}s ease-in-out ${delay}s infinite`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes lattice-pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes lattice-pulse {
            0%, 100% { opacity: 0.4; transform: none; }
            50% { opacity: 1; transform: none; }
          }
        }
      `}</style>
    </div>
  );
}

interface RouteLoaderProps {
  label?: string;
  className?: string;
}

export function RouteLoader({ label, className }: RouteLoaderProps) {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - start.current), 100);
    return () => clearInterval(id);
  }, []);

  const showTimer = elapsed > 1500;

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-20", className)}>
      <LatticeLoader size={32} className="text-oxblood" />
      {label && (
        <p className="text-sm font-medium text-ink-2 animate-in fade-in duration-300">
          {label}
        </p>
      )}
      {showTimer && (
        <p className="text-[0.7rem] tabular text-ink-3 animate-in fade-in duration-500">
          {(elapsed / 1000).toFixed(1)}s
        </p>
      )}
    </div>
  );
}
