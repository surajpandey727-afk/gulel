"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/neo/cn";

const TabCtx = createContext<{ active: string; set: (v: string) => void }>({ active: "summary", set: () => {} });

export function useTab() { return useContext(TabCtx); }

/** Dossier tabs. The open tab lives in the URL hash (#financials), so a refresh, a shared link or Back returns to it. */
export function DossierShell({ defaultTab, children }: { defaultTab: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultTab);
  useEffect(() => {
    const read = () => { const h = window.location.hash.slice(1); if (h && document.querySelector(`[data-dossier-panel="${CSS.escape(h)}"]`)) setActive(h); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const set = useCallback((v: string) => {
    setActive(v);
    window.history.replaceState(null, "", v === defaultTab ? window.location.pathname + window.location.search : `#${v}`);
  }, [defaultTab]);
  return <TabCtx.Provider value={{ active, set }}>{children}</TabCtx.Provider>;
}

export function DossierPanel({ name, children }: { name: string; children: ReactNode }) {
  const { active } = useTab();
  return <div data-dossier-panel={name} className={cn(active !== name && "hidden")}>{children}</div>;
}
