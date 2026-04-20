/**
 * CaseArcRibbon — a thin narrative arc above the CaseHero.
 *
 * Reads as a three-beat headline:
 *   OPENED · {relative}     ━━━━━━━━━●━━━     RESOLVED · {relative}
 *
 * For an in-flight case the right pin is replaced by an acid live
 * dot. For a cancelled case the right label reads "CANCELLED" in
 * warn colour. The filled bar reflects progress from open → now
 * mapped into [opened, resolution_or_updatedAt].
 *
 * Visual weight: editorial kicker-sized. Designed to sit at the top
 * of the hero and anchor the reader's sense of "where in the arc am
 * I reading?". Complements the ScrollProgressRail which indicates
 * position in the page, not position in the case's life.
 */

import type { Issue } from "@paperclipai/shared";
import { cn, relativeTime } from "../../../lib/utils";

interface Props {
  issue: Issue;
  hasLiveRuns?: boolean;
  className?: string;
}

export function CaseArcRibbon({ issue, hasLiveRuns, className }: Props) {
  const openedAt = new Date(issue.createdAt).getTime();
  const closedAt = issue.completedAt ? new Date(issue.completedAt).getTime() : null;
  const cancelled = issue.status === "cancelled";
  const isResolved = issue.status === "done";
  const now = Date.now();

  // Progress 0..1 mapped from openedAt -> (closedAt or now).
  const endTs = closedAt ?? now;
  const span = Math.max(1, endTs - openedAt);
  const progress = closedAt ? 1 : Math.min(1, Math.max(0.04, (now - openedAt) / span));

  const rightTone = cancelled
    ? "text-[var(--boared-warn)]"
    : isResolved
      ? "text-[var(--boared-success)]"
      : "text-[var(--boared-acid)]";
  const rightLabel = cancelled
    ? "Cancelled"
    : isResolved
      ? "Resolved"
      : hasLiveRuns
        ? "Live now"
        : "In flight";
  const rightTime = closedAt
    ? relativeTime(issue.completedAt!)
    : relativeTime(issue.updatedAt);

  return (
    <div
      className={cn(
        "flex items-center gap-3 font-mono text-[0.56rem] uppercase tracking-[0.22em]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="inline-flex items-center gap-1.5 text-[var(--boared-ink-faint)] shrink-0">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--boared-ink-faint)]" />
        Opened · {relativeTime(issue.createdAt)}
      </div>

      {/* Arc track */}
      <div className="relative flex-1 h-px bg-[var(--boared-rule)]">
        <div
          className="absolute inset-y-0 left-0 h-px"
          style={{
            width: `${progress * 100}%`,
            background:
              cancelled
                ? "var(--boared-warn)"
                : isResolved
                  ? "var(--boared-success)"
                  : "var(--boared-acid)",
          }}
        />
        {/* Live cursor when open */}
        {!closedAt && !cancelled && (
          <span
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: `${progress * 100}%` }}
          >
            <span className="relative flex h-2 w-2 -translate-x-1/2">
              {hasLiveRuns && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--boared-acid)]" />
            </span>
          </span>
        )}
      </div>

      <div className={cn("inline-flex items-center gap-1.5 shrink-0", rightTone)}>
        {rightLabel} · {rightTime}
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            cancelled
              ? "bg-[var(--boared-warn)]"
              : isResolved
                ? "bg-[var(--boared-success)]"
                : "bg-[var(--boared-acid)]",
          )}
        />
      </div>
    </div>
  );
}
