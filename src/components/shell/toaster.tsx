"use client";
import { Toaster } from "sonner";
import { useTheme } from "@/components/shell/theme-provider";

export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      offset={80}
      toastOptions={{
        style: {
          fontFamily: "var(--font-avant-garde), system-ui, sans-serif",
          borderRadius: "var(--radius-lg, 12px)",
          border: "1px solid var(--color-border, #d4d0c8)",
          boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08))",
        },
      }}
    />
  );
}
