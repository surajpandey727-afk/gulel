"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/components/neo/cn";

const TabCtx = createContext<{ active: string; set: (v: string) => void }>({ active: "summary", set: () => {} });

export function useTab() { return useContext(TabCtx); }

export function DossierShell({ defaultTab, children }: { defaultTab: string; children: ReactNode }) {
  const [active, set] = useState(defaultTab);
  return <TabCtx.Provider value={{ active, set }}>{children}</TabCtx.Provider>;
}

export function DossierPanel({ name, children }: { name: string; children: ReactNode }) {
  const { active } = useTab();
  return <div className={cn(active !== name && "hidden")}>{children}</div>;
}
