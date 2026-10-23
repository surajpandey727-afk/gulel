"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const navKey = useRef("");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = pathname + "?" + searchParams.toString();
    if (navKey.current && key !== navKey.current && state === "loading") {
      setState("done");
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setState("idle"), 300);
    }
    navKey.current = key;
  }, [pathname, searchParams, state]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (anchor.getAttribute("target") === "_blank") return;
      const nextPath = href.split("?")[0];
      if (nextPath === pathname) return;
      setState("loading");
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  useEffect(() => {
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (state === "idle") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px]">
      <div
        className={
          state === "loading"
            ? "h-full bg-oxblood rounded-r-full animate-progress-bar"
            : "h-full bg-oxblood rounded-r-full w-full transition-all duration-200"
        }
      />
      <style>{`
        @keyframes progress-bar {
          0% { width: 0%; }
          20% { width: 30%; }
          50% { width: 60%; }
          80% { width: 85%; }
          100% { width: 95%; }
        }
        .animate-progress-bar {
          animation: progress-bar 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
