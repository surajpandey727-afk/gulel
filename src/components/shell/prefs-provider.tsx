"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import { savePrefsAction } from "@/app/(app)/settings/preferences/actions";

type Ctx = { prefs: Prefs; setPrefs: (p: Partial<Prefs> | "reset", opts?: { quiet?: boolean }) => void };
const PrefsCtx = createContext<Ctx | null>(null);

/** Your preferences, applied instantly; saving to your profile happens in the background (debounced). */
export function PrefsProvider({ initial, children }: { initial: Prefs; children: React.ReactNode }) {
  const [prefs, set] = useState(initial);
  const pending = useRef<Partial<Prefs>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quiet = useRef(true);
  const setPrefs = useCallback((p: Partial<Prefs> | "reset", opts?: { quiet?: boolean }) => {
    if (p === "reset") {
      pending.current = {};
      set(DEFAULT_PREFS);
      void savePrefsAction("reset").then((r) => { if (r.ok) toast.success("Preferences reset to defaults"); else toast.error(r.error); });
      return;
    }
    set((cur) => ({ ...cur, ...p }));
    pending.current = { ...pending.current, ...p };
    quiet.current = quiet.current && !!opts?.quiet;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const send = pending.current, silent = quiet.current;
      pending.current = {}; quiet.current = true;
      void savePrefsAction(send).then((r) => {
        if (!r.ok) toast.error(`Preference not saved: ${r.error}`);
        else if (!silent) toast.success("Preference saved", { duration: 1200 });
      });
    }, 700);
  }, []);
  return <PrefsCtx.Provider value={{ prefs, setPrefs }}>{children}</PrefsCtx.Provider>;
}

/** Preferences anywhere in the app (falls back to defaults outside the provider, e.g. in isolated tests). */
export function usePrefs(): Ctx {
  return useContext(PrefsCtx) ?? { prefs: DEFAULT_PREFS, setPrefs: () => {} };
}
