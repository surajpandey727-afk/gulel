import { forwardRef } from "react";
import { cn } from "./cn";

const fieldCls =
  "w-full rounded-neo neo-inset-sm px-4 text-sm text-ink placeholder:text-ink-3/80 outline-none transition-shadow focus-visible:outline-2 focus-visible:outline-oxblood aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-oxblood";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldCls, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, "min-h-28 py-3 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(fieldCls, "h-11 cursor-pointer appearance-none pr-10", className)}
      style={{ backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "12px", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%233d3a36' stroke-width='1.6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">{label}</label>
      {children}
      {error ? (
        <p className="text-xs text-oxblood" role="alert">⚠ {error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
