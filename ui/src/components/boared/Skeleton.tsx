/**
 * Skeleton primitives — shared shimmer shapes used across pages
 * so loading states have a consistent visual language.
 *
 * All skeletons use the paper-rule tint and respect prefers-
 * reduced-motion (animate-pulse is CSS-level, so reduces
 * automatically in browsers honoring that media query).
 */

import { cn } from "../../lib/utils";

export function SkeletonLine({
  className,
  width,
}: {
  className?: string;
  /** e.g. "50%", "120px". Defaults to full width. */
  width?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-3 bg-[var(--boared-rule)]/45 animate-pulse",
        className,
      )}
      style={width ? { width } : undefined}
    />
  );
}

export function SkeletonBlock({
  className,
  height = "80px",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-[var(--boared-rule)]/30 animate-pulse", className)}
      style={{ height }}
    />
  );
}

/** Table-shaped skeleton: N rows of lines with a leading avatar
 * circle. Used in lists (issues, activity, backlog items). */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-2 border border-[var(--boared-rule)]/60 bg-[var(--boared-paper)]"
        >
          <span
            aria-hidden="true"
            className="h-6 w-6 rounded-full bg-[var(--boared-rule)]/40 animate-pulse shrink-0"
          />
          <span className="flex-1 space-y-1.5">
            <SkeletonLine width={`${30 + ((i * 17) % 40)}%`} />
            <SkeletonLine width={`${50 + ((i * 7) % 30)}%`} className="h-2.5 bg-[var(--boared-rule)]/30" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Grid skeleton: N tiles laid out in a responsive grid. */
export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-3 border border-[var(--boared-rule)]/60 space-y-2"
        >
          <SkeletonLine width="70%" />
          <SkeletonLine width="40%" className="h-2.5 bg-[var(--boared-rule)]/30" />
          <SkeletonBlock height="44px" />
        </div>
      ))}
    </div>
  );
}
