import { cn } from "./cn";

export function Surface({
  as: Tag = "section",
  elevation = "md",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "aside"; elevation?: "sm" | "md" | "lg" | "inset" }) {
  const cls = { sm: "neo-raised-sm", md: "neo-raised", lg: "neo-raised-lg", inset: "neo-inset" }[elevation];
  return (
    <Tag className={cn(cls, "rounded-neo-lg", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <Surface className={cn("flex min-w-0 flex-col", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="truncate text-[0.95rem] font-semibold text-ink">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("flex-1 px-5 pb-5 pt-3", bodyClassName)}>{children}</div>
    </Surface>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-neo neo-inset-sm px-6 py-10 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full neo-raised-sm text-ink-2">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="max-w-md text-sm text-ink-3">{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("neo-skeleton h-4", className)} aria-hidden />;
}
