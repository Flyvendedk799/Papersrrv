import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "../../lib/utils";

/*
 * BOARED Marginalia — slim mono-caps numeric column for the data hounds.
 * Used as the right rail on the Dashboard so the raw numbers stay
 * scannable next to the prose-y Memo and Wire feed.
 *
 * Each item is mono caps label + tabular figure value, separated by a
 * hairline rule. Items can optionally link to detail pages.
 *
 * Layout:
 *   AGENTS         12
 *   ─────────────────
 *   RUNNING         8
 *   ─────────────────
 *   OPEN MATTERS   47
 */
export interface MarginaliaItem {
  label: string;
  value: ReactNode;
  to?: string;
  /** Optional acid-dot prefix to mark "live" or "alert" lines. */
  accent?: boolean;
}

interface MarginaliaProps {
  items: MarginaliaItem[];
  className?: string;
  /** Optional eyebrow label above the column. */
  eyebrow?: string;
}

export function Marginalia({ items, className, eyebrow }: MarginaliaProps) {
  return (
    <aside
      className={cn(
        "border-t border-foreground",
        className
      )}
      aria-label="Marginalia"
    >
      {eyebrow && (
        <div className="boared-label text-foreground py-3 px-1">
          {eyebrow}
        </div>
      )}
      <dl className="divide-y divide-[var(--boared-rule)] border-b border-[var(--boared-rule)]">
        {items.map((item) => {
          const inner = (
            <div
              className={cn(
                "flex items-baseline justify-between gap-3 py-3 px-1 group/marg transition-colors",
                item.to && "cursor-pointer hover:bg-foreground/[0.025]"
              )}
            >
              <dt className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-2">
                {item.accent && (
                  <span className="size-1.5 bg-[var(--boared-acid)]" aria-hidden />
                )}
                {item.label}
              </dt>
              <dd
                className={cn(
                  "font-mono text-[1.1rem] tabular-nums text-foreground tracking-tight",
                  item.to && "group-hover/marg:[text-decoration:underline] group-hover/marg:[text-decoration-color:var(--boared-acid)] group-hover/marg:[text-decoration-thickness:2px] group-hover/marg:[text-underline-offset:4px]"
                )}
              >
                {item.value}
              </dd>
            </div>
          );
          if (item.to) {
            return (
              <Link
                key={item.label}
                to={item.to}
                className="block text-inherit no-underline focus:outline-none focus-visible:[outline:2px_solid_var(--boared-acid)] focus-visible:outline-offset-[-2px]"
              >
                {inner}
              </Link>
            );
          }
          return <div key={item.label}>{inner}</div>;
        })}
      </dl>
    </aside>
  );
}
