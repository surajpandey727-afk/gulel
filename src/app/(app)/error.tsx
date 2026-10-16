"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[gulel] route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full neo-inset-sm">
        <AlertTriangle className="h-6 w-6 text-oxblood" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm text-ink-3">
          {error.message || "An unexpected error occurred. Your data is safe."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-[0.65rem] text-ink-3">
            ref: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-full neo-raised px-5 py-2.5 text-sm font-medium text-ink transition-all hover:neo-raised-sm active:neo-inset-sm"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
