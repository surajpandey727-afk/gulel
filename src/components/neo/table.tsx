import { cn } from "./cn";

/** Dense, scannable table on an inset well. Use <ResponsiveList> for the mobile card variant. */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-neo neo-inset-sm", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}
export function Th({ className, children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap px-4 py-2.5 text-left text-[0.7rem] font-medium uppercase tracking-[0.06em] text-ink-3", className)} {...rest}>{children}</th>;
}
export function Td({ className, children, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-t border-hairline/60 px-4 py-3 align-middle text-ink-2", className)} {...rest}>{children}</td>;
}
export function Tr({ className, children, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-raised/70", className)} {...rest}>{children}</tr>;
}
