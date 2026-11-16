"use client";
import type { useRouter } from "next/navigation";

/**
 * Re-render server data after a mutation. Called outside the action's transition and twice: once at once and once
 * after background work (Sheet sync, linking) settles, so the page never shows a stale state.
 */
export function refreshSoon(router: ReturnType<typeof useRouter>) {
  setTimeout(() => router.refresh(), 300);
  setTimeout(() => router.refresh(), 2500);
}
