"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "./cn";

const button = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[box-shadow,transform,background-color] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        primary:
          "neo-accent hover:bg-[var(--brand-oxblood-hover)] active:bg-[var(--brand-oxblood-press)] active:shadow-[var(--press-accent)] active:translate-y-px",
        neutral:
          "neo-raised-sm text-ink hover:shadow-[var(--raise-md)] active:shadow-[var(--inset-sm)] active:translate-y-px",
        ghost: "text-ink-2 hover:bg-sunken/60 active:shadow-[var(--inset-sm)]",
        danger:
          "neo-raised-sm text-oxblood ring-1 ring-oxblood/25 hover:shadow-[var(--raise-md)] active:shadow-[var(--inset-sm)]",
      },
      size: {
        sm: "h-8 rounded-full px-3.5 text-xs",
        md: "h-10 rounded-full px-5 text-sm",
        lg: "h-12 rounded-full px-6 text-[0.95rem]",
        icon: "h-10 w-10 rounded-full",
        iconSm: "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, className, variant, size, children, ...rest }: React.ComponentProps<typeof Link> & VariantProps<typeof button>) {
  return (
    <Link href={href} className={cn(button({ variant, size }), className)} {...rest}>
      {children}
    </Link>
  );
}

/** Compact circular control (approve, reject, copy…) — always carries an accessible label. */
export function IconButton({ label, className, variant = "neutral", size = "icon", ...rest }: Omit<ButtonProps, "aria-label"> & { label: string }) {
  return <Button aria-label={label} title={label} variant={variant} size={size} className={className} {...rest} />;
}
