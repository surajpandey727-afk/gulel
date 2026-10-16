"use client";

import { cn } from "@/components/neo/cn";
import { LatticeLoader } from "@/components/reactbits/lattice-loader";

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-neo bg-raised/60",
        className,
      )}
    />
  );
}

export function PageSkeleton({ label }: { label?: string }) {
  return (
    <div className="animate-in fade-in duration-200">
      {/* Header skeleton */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Bone className="mb-2 h-7 w-48" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <Bone className="h-9 w-32 rounded-full" />
      </div>

      {/* Loading indicator */}
      <div className="flex items-center gap-3 mb-6">
        <LatticeLoader size={20} className="text-oxblood" />
        {label && <span className="text-sm text-ink-3">{label}</span>}
      </div>

      {/* Content skeleton — card grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-24 rounded-[20px]" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="flex flex-col gap-2">
        <Bone className="h-10 w-full rounded-neo" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-14 w-full rounded-neo" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ label, rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div className="animate-in fade-in duration-200">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Bone className="mb-2 h-7 w-48" />
          <Bone className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <LatticeLoader size={20} className="text-oxblood" />
        {label && <span className="text-sm text-ink-3">{label}</span>}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Bone key={i} className="h-14 w-full rounded-neo" />
        ))}
      </div>
    </div>
  );
}
