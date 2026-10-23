"use client";

import { useEffect, useRef, useState, useCallback, createContext, useContext } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LatticeLoader } from "@/components/reactbits/lattice-loader";

const DELAY_MS = 100;

export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navKey = useRef("");

  useEffect(() => {
    const key = pathname + "?" + searchParams.toString();
    if (navKey.current && key !== navKey.current) {
      setShow(false);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
    navKey.current = key;
  }, [pathname, searchParams]);

  useEffect(() => {
    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShow(true), DELAY_MS);
    };

    document.addEventListener("nav:start", handler);
    return () => {
      document.removeEventListener("nav:start", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (anchor.getAttribute("target") === "_blank") return;
      const current = pathname + "?" + searchParams.toString();
      const nextPath = href.split("?")[0];
      if (nextPath === pathname) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShow(true), DELAY_MS);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, searchParams]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center animate-in fade-in duration-150">
      <div className="pointer-events-auto rounded-neo-lg neo-raised bg-canvas/95 px-5 py-4 shadow-xl backdrop-blur-sm flex items-center gap-3">
        <LatticeLoader size={24} className="text-oxblood" />
        <span className="text-sm text-ink-2 font-medium">Loading…</span>
      </div>
    </div>
  );
}
