import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/*
 * BOARED PageHeader — the editorial title block that opens every page.
 * Layout (top to bottom):
 *   1. Kicker (mono caps eyebrow): "ISSUE · 0428"
 *   2. Huge italic Fraunces title
 *   3. Optional dateline / standfirst (mono small)
 *   4. Hairline rule
 *   5. Optional `actions` slot rendered to the right of the title
 *
 * Pages should wrap their main content in a `<div className="boared-reveal">`
 * with the PageHeader as its first child to get the staggered page-load
 * animation that the brand uses as its one orchestrated motion moment.
 */
export function PageHeader({
  kicker,
  title,
  dateline,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  dateline?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative pb-5 mb-6 border-b border-[var(--boared-rule)]", className)}>
      {kicker && <div className="boared-label mb-3">{kicker}</div>}
      <div className="flex items-end justify-between gap-6">
        <h1 className="boared-display text-[clamp(2.25rem,5vw,3.75rem)] leading-[0.95] text-foreground max-w-[24ch]">
          {title}
        </h1>
        {actions && <div className="flex items-center gap-2 pb-2 shrink-0">{actions}</div>}
      </div>
      {dateline && (
        <p className="font-mono text-[0.7rem] tracking-tight text-muted-foreground mt-3">
          {dateline}
        </p>
      )}
    </header>
  );
}

/* Lighter, smaller variant for sub-pages that already have a parent header. */
export function SubPageHeader({
  kicker,
  title,
  dateline,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  dateline?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative pb-3 mb-4 border-b border-[var(--boared-rule)]", className)}>
      {kicker && <div className="boared-label mb-2">{kicker}</div>}
      <div className="flex items-end justify-between gap-4">
        <h2 className="boared-display text-[1.85rem] leading-[1] text-foreground">{title}</h2>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {dateline && (
        <p className="font-mono text-[0.66rem] tracking-tight text-muted-foreground mt-1.5">
          {dateline}
        </p>
      )}
    </header>
  );
}
