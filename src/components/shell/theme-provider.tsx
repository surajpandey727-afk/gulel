"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gulel-theme") as Theme | null;
      if (stored === "dark" || stored === "light") {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("gulel-theme", next); } catch {}
      return next;
    });
  }, []);

  return <Ctx value={{ theme, toggle }}>{children}</Ctx>;
}

export function useTheme() { return useContext(Ctx); }
