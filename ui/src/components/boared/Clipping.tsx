import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/*
 * BOARED Clipping — flat bordered rectangle. The card alternative for places
 * where you really need a contained block (dashboard tiles, approval cards).
 *
 * Differs from <Card> by having an optional kicker label baked in and an
 * optional acid corner accent (.acid). Variant `inset` removes the border
 * and uses the paper-2 background, for nested or secondary blocks.
 */
export function Clipping({
  kicker,
  title,
  meta,
  actions,
  children,
  variant = "default",
  className,
}: {
  kicker?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  variant?: "default" | "inset" | "acid";
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative flex flex-col",
        variant === "default" && "border border-foreground bg-card",
        variant === "inset" && "bg-[var(--boared-paper-2)]",
        variant === "acid" && "border border-foreground bg-[var(--boared-acid)] text-[var(--boared-acid-ink)]",
        className
      )}
    >
      {(kicker || title || actions) && (
        <header
          className={cn(
            "flex items-start justify-between gap-3 px-4 pt-4 pb-3",
            (children || meta) && "border-b",
            variant === "acid"
              ? "border-[var(--boared-acid-ink)]/20"
              : "border-[var(--boared-rule)]"
          )}
        >
          <div className="flex-1 min-w-0">
            {kicker && (
              <div
                className={cn(
                  "boared-label mb-1.5",
                  variant === "acid" && "text-[var(--boared-acid-ink)]"
                )}
              >
                {kicker}
              </div>
            )}
            {title && (
              <h3
                className={cn(
                  "boared-display text-[1.15rem] leading-[1.1]",
                  variant === "acid" ? "text-[var(--boared-acid-ink)]" : "text-foreground"
                )}
              >
                {title}
              </h3>
            )}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        </header>
      )}
      {children && <div className="px-4 py-3 flex-1">{children}</div>}
      {meta && (
        <footer
          className={cn(
            "px-4 pt-2 pb-3 font-mono text-[0.62rem] tracking-[0.06em] uppercase",
            variant === "acid"
              ? "text-[var(--boared-acid-ink)]/70 border-t border-[var(--boared-acid-ink)]/20"
              : "text-muted-foreground border-t border-[var(--boared-rule)]"
          )}
        >
          {meta}
        </footer>
      )}
    </article>
  );
}
