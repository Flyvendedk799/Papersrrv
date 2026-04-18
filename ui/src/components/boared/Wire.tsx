import { cn } from "@/lib/utils";
import type { ReactNode, MouseEventHandler } from "react";

/*
 * BOARED Wire — a list row separated by hairline rules. No card chrome.
 * Reads as a stock-ticker line or a newspaper agate column.
 *
 * Slot layout (left → right):
 *   leading  — small mono identifier or status dot (optional)
 *   title    — the primary content; takes remaining width
 *   meta     — secondary mono info (optional, right-aligned)
 *   trailing — actions / chevron / etc. (optional)
 *
 * Wires must live inside a <WireList> for the rules to compose correctly.
 */
export function Wire({
  leading,
  title,
  meta,
  trailing,
  onClick,
  href,
  active,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  href?: string;
  active?: boolean;
  className?: string;
}) {
  const interactive = !!(onClick || href);
  const inner = (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        "group/wire relative flex items-center gap-4 py-3.5 px-1",
        "border-b border-[var(--boared-rule)]",
        "transition-[background-color,color]",
        interactive && "cursor-pointer hover:bg-foreground/[0.03]",
        active && "bg-foreground/[0.04]",
        // Active = thick acid bar at the left edge
        active && "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--boared-acid)]",
        className
      )}
    >
      {leading && <div className="shrink-0 flex items-center">{leading}</div>}
      <div className="flex-1 min-w-0 text-foreground text-[0.82rem] leading-snug">{title}</div>
      {meta && (
        <div className="shrink-0 font-mono uppercase tracking-[0.08em] text-[0.62rem] text-muted-foreground hidden sm:block">
          {meta}
        </div>
      )}
      {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block focus:outline-none focus-visible:[outline:2px_solid_var(--boared-acid)] focus-visible:outline-offset-[-2px]">
        {inner}
      </a>
    );
  }
  return inner;
}

/* Container for a stack of wires. Adds a top rule so the first wire's
 * bottom border closes the run, and removes the trailing border. */
export function WireList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-t border-[var(--boared-rule)] [&>*:last-child]:border-b-0",
        className
      )}
    >
      {children}
    </div>
  );
}
