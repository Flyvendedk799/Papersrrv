/**
 * PlanProgressBand (F4) — horizontal strip of small blocks, one per
 * plan step. Colours convey done / in-flight / spawned-but-pending /
 * not-yet-spawned. Compact so it sits under the plan title or inside
 * a dashboard card.
 */

import type { PlanProgress } from "@paperclipai/shared";
import { cn } from "../../../lib/utils";

export function PlanProgressBand({
  progress,
  className,
  compact,
}: {
  progress: PlanProgress;
  className?: string;
  compact?: boolean;
}) {
  const total = Math.max(progress.total, 1);
  const segments: Array<{ color: string; label: string; count: number }> = [
    {
      color: "bg-[var(--boared-success)]",
      label: "done",
      count: progress.done,
    },
    {
      color: "bg-[var(--boared-acid)]",
      label: "in flight",
      count: progress.inFlight,
    },
    {
      color: "bg-[var(--boared-ink-faint)]/40",
      label: "cancelled",
      count: progress.cancelled,
    },
    {
      color: "bg-[var(--boared-rule)]",
      label: "pending",
      count: Math.max(progress.pending, 0),
    },
  ];

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("flex w-full overflow-hidden border border-[var(--boared-rule)]", compact ? "h-1.5" : "h-2.5")}>
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.label}
                title={`${s.count} ${s.label}`}
                className={cn("h-full", s.color)}
                style={{ width: `${(s.count / total) * 100}%` }}
              />
            ),
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-3 font-mono text-[0.52rem] uppercase tracking-[0.16em] text-[var(--boared-ink-faint)]">
          <span className="text-[var(--boared-ink)]">
            {progress.done}/{progress.total}
          </span>
          <span>spawned {progress.spawned}</span>
          <span>in flight {progress.inFlight}</span>
          {progress.cancelled > 0 && <span>cancelled {progress.cancelled}</span>}
          <span>pending {progress.pending}</span>
        </div>
      )}
    </div>
  );
}
