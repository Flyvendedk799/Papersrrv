import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/*
 * BOARED Kicker — the small mono caps eyebrow that lives above a title
 * or section. Pairs naturally with PageHeader, Wire, and Clipping.
 *
 * Convention: a section number prefix (e.g. "§04 · ISSUES") communicates
 * editorial structure without leaning on icons.
 */
export function Kicker({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span" | "h2" | "h3";
}) {
  return <As className={cn("boared-label", className)}>{children}</As>;
}

/* Section header — a Kicker followed by a hairline rule across the row.
 * Used to break up long pages into editorial sections.
 *
 * Accepts an optional `id` so it can act as a scroll-anchor for
 * table-of-contents navigation (e.g. the Case Companion chapter list).
 * We include `scroll-mt-8` so the visible label isn't clipped by any
 * sticky header when jumped-to via hash link. */
export function SectionRule({
  id,
  label,
  meta,
  className,
}: {
  id?: string;
  label: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex items-baseline gap-3 mt-8 mb-3 pb-2 border-b border-[var(--boared-rule)]",
        id ? "scroll-mt-8" : "",
        className
      )}
    >
      <Kicker className="text-foreground">{label}</Kicker>
      <div className="flex-1 h-px" />
      {meta && (
        <span className="font-mono text-[0.62rem] text-muted-foreground">{meta}</span>
      )}
    </div>
  );
}
