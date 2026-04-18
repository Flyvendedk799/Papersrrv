/**
 * FileRow — the unified file row primitive used by the tree, the
 * Overview lanes, the quick-open palette, the Inspector, and the
 * review queue. One row shape keeps scanning the page effortless and
 * guarantees the hover/keyboard affordances stay consistent.
 *
 * Visual anatomy:
 *
 *   [dot] [icon] filename                            [badges] [sparkline] [avatars] [time]
 *                path/to/filename                                                    [hover actions]
 *
 * The row is a <button> so keyboard focus + J/K navigation from the
 * parent list works naturally. Hover actions live in an absolutely-
 * positioned slot so they don't shift layout.
 */

import { forwardRef, type ReactNode } from "react";
import { Lock, AlertTriangle, Sparkles, FileQuestion } from "lucide-react";
import { ChurnSparkline } from "./ChurnSparkline";
import { AgentPresenceChip } from "./AgentPresenceChip";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";

export type FileRowBadge = "locked" | "conflict" | "evidence" | "review";

export interface FileRowProps {
  filePath: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Small coloured dot slotted to the very left (project/agent colour). */
  scopeColor?: string | null;
  scopeLabel?: string | null;
  lastAgent?: string | null;
  lastAt?: string | null;
  agents?: string[];
  presenceReason?: "lock" | "recent" | "both" | "touched";
  lockedBy?: string | null;
  sparkline?: number[];
  churn?: number;
  badges?: FileRowBadge[];
  selected?: boolean;
  subtitle?: string | null;
  /** Hover action cluster, rendered right-aligned inside the row. */
  actions?: ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  /** Depth-based indent for tree mode. */
  indent?: number;
  ariaLabel?: string;
}

function filenameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;
}
function dirnameOf(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

const badgeStyle: Record<FileRowBadge, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  locked: { label: "LOCKED", icon: Lock, tone: "text-amber-400 border-amber-400/40" },
  conflict: { label: "CONFLICT", icon: AlertTriangle, tone: "text-[var(--boared-acid)] border-[var(--boared-acid)]/40" },
  evidence: { label: "EVIDENCE", icon: Sparkles, tone: "text-cyan-300 border-cyan-400/30" },
  review: { label: "REVIEW", icon: FileQuestion, tone: "text-violet-300 border-violet-400/30" },
};

export const FileRow = forwardRef<HTMLDivElement, FileRowProps>(function FileRow(
  {
    filePath,
    icon: Icon,
    scopeColor,
    scopeLabel,
    lastAgent,
    lastAt,
    agents,
    presenceReason,
    lockedBy,
    sparkline,
    churn,
    badges,
    selected,
    subtitle,
    actions,
    onClick,
    onDoubleClick,
    className,
    indent = 0,
    ariaLabel,
  },
  ref,
) {
  const name = filenameOf(filePath);
  const dir = subtitle ?? dirnameOf(filePath);
  const showSpark = Array.isArray(sparkline) && sparkline.length > 0;

  return (
    <div
      ref={ref}
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5 text-[13px]",
        "border-l border-transparent",
        selected
          ? "bg-accent/70 border-l-foreground text-foreground"
          : "hover:bg-accent/50 focus-visible:bg-accent/60",
        className,
      )}
      style={indent ? { paddingLeft: `${indent * 12 + 8}px` } : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-label={ariaLabel ?? `Open ${filePath}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-[2px] focus-visible:ring-ring rounded-sm"
      >
        {scopeColor ? (
          <span
            aria-hidden
            title={scopeLabel ?? undefined}
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: scopeColor }}
          />
        ) : (
          <span aria-hidden className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30" />
        )}
        {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : null}
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="truncate text-foreground font-medium">{name}</span>
          {dir && (
            <span className="truncate text-[0.62rem] font-mono text-muted-foreground/80">
              {dir}
            </span>
          )}
        </div>
      </button>

      {badges && badges.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {badges.map((b) => {
            const s = badgeStyle[b];
            const IconB = s.icon;
            return (
              <span
                key={b}
                className={cn(
                  "inline-flex items-center gap-1 border px-1 py-[1px] font-mono text-[0.5rem] uppercase tracking-[0.08em]",
                  s.tone,
                )}
              >
                <IconB className="h-2.5 w-2.5" />
                {s.label}
              </span>
            );
          })}
        </div>
      )}

      {showSpark && (
        <span
          className="shrink-0 hidden md:inline-flex items-center gap-1"
          title={churn != null ? `${churn} changes` : undefined}
        >
          <ChurnSparkline values={sparkline!} width={56} height={14} />
          {typeof churn === "number" && churn > 0 && (
            <span className="font-mono text-[0.6rem] text-muted-foreground">{churn}</span>
          )}
        </span>
      )}

      {agents && agents.length > 0 && (
        <AgentPresenceChip
          agents={agents}
          reason={presenceReason ?? "touched"}
          lockedBy={lockedBy ?? null}
          className="shrink-0 hidden sm:inline-flex"
        />
      )}

      {lastAt && (
        <span className="shrink-0 font-mono text-[0.6rem] text-muted-foreground hidden md:inline">
          {lastAgent ? `${lastAgent} · ` : ""}
          {timeAgo(lastAt)}
        </span>
      )}

      {actions && (
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
});
