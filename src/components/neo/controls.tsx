"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "./cn";

/* ---------- Switch (reference: oxblood pill with raised knob) ---------- */
export function Switch({ checked, onCheckedChange, label, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors disabled:opacity-50",
        checked ? "bg-oxblood shadow-[var(--press-accent)]" : "neo-inset-sm",
      )}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 rounded-full bg-raised shadow-[var(--raise-sm)] transition-transform duration-200 data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}

/* ---------- Slider (reference: recessed track, oxblood fill, raised thumb) ---------- */
export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, label, format }: {
  value: number; onValueChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; format?: (v: number) => string;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="tabular text-ink">{format ? format(value) : value}</span>
      </div>
      <SliderPrimitive.Root className="relative flex h-6 w-full touch-none select-none items-center" value={[value]} min={min} max={max} step={step}
        onValueChange={(v) => onValueChange(v[0])} aria-label={label}>
        <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full neo-inset-sm">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-oxblood" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-6 w-6 rounded-full bg-raised shadow-[var(--raise-sm)] ring-1 ring-white/70 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-oxblood" />
      </SliderPrimitive.Root>
    </div>
  );
}

/* ---------- Tabs ---------- */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...rest }: TabsPrimitive.TabsListProps) {
  return <TabsPrimitive.List className={cn("flex max-w-full gap-1 overflow-x-auto rounded-full neo-inset-sm p-1 [scrollbar-width:none]", className)} {...rest} />;
}
export function TabsTrigger({ className, ...rest }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "h-8 shrink-0 rounded-full px-4 text-sm font-medium text-ink-2 transition-all hover:text-ink data-[state=active]:neo-raised-sm data-[state=active]:text-oxblood",
        className,
      )}
      {...rest}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ---------- Tooltip (metric definitions) ---------- */
export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={8} className="z-50 max-w-xs rounded-neo bg-ink px-3 py-2 text-xs leading-relaxed text-ivory shadow-lg">
            {content}
            <TooltipPrimitive.Arrow className="fill-ink" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/* ---------- Modal & Drawer (reference: floating pop-up panel) ---------- */
export function Modal({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#14141433] backdrop-blur-[2px] data-[state=open]:animate-in" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-neo-lg neo-raised-lg", wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-sm text-ink-3">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="grid h-8 w-8 place-items-center rounded-full neo-raised-sm text-ink-2" aria-label="Close">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-hairline/70 px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#1414141f]" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-canvas shadow-[-12px_0_32px_#b9b0a455] transition-transform duration-300">
          <div className="flex items-center justify-between px-5 py-4">
            <DialogPrimitive.Title className="font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            <DialogPrimitive.Close className="grid h-8 w-8 place-items-center rounded-full neo-raised-sm" aria-label="Close"><X className="h-4 w-4" /></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
