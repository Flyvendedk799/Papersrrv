/**
 * Tiny avatar stack + live dot used to signal which agents are touching
 * a file right now (or in the last few minutes). The dot pulses for
 * "locked" state and stays solid for "recent writes only".
 */

import { cn } from "@/lib/utils";

export interface AgentPresenceChipProps {
  agents: string[];
  reason?: "lock" | "recent" | "both" | "touched";
  lockedBy?: string | null;
  max?: number;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s\-_]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Deterministic hue for a label. Not meant to communicate identity —
 * just to differentiate overlapping initials in a stack.
 */
function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function AgentPresenceChip({
  agents,
  reason = "touched",
  lockedBy,
  max = 3,
  size = "sm",
  className,
  ariaLabel,
}: AgentPresenceChipProps) {
  if (!agents.length) return null;

  const visible = agents.slice(0, max);
  const overflow = Math.max(0, agents.length - max);
  const box = size === "md" ? "h-5 w-5 text-[0.58rem]" : "h-4 w-4 text-[0.5rem]";
  const dotClass =
    reason === "lock" || reason === "both"
      ? "bg-amber-400 animate-pulse"
      : reason === "recent"
        ? "bg-cyan-400 animate-pulse"
        : "bg-muted-foreground/60";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={
        ariaLabel ??
        (lockedBy
          ? `Locked by ${lockedBy}; ${agents.length} agent${agents.length === 1 ? "" : "s"}`
          : `${agents.length} agent${agents.length === 1 ? "" : "s"}`)
      }
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} aria-hidden />
      <span className="inline-flex">
        {visible.map((name, i) => (
          <span
            key={`${name}-${i}`}
            title={name}
            className={cn(
              box,
              "inline-flex items-center justify-center rounded-full border border-[var(--boared-rule)] font-mono text-foreground/90",
              i > 0 && "-ml-1.5",
            )}
            style={{
              backgroundColor: `oklch(0.62 0.05 ${hue(name)} / 0.28)`,
            }}
          >
            {initials(name)}
          </span>
        ))}
        {overflow > 0 && (
          <span
            className={cn(
              box,
              "inline-flex items-center justify-center rounded-full border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] text-muted-foreground font-mono -ml-1.5",
            )}
          >
            +{overflow}
          </span>
        )}
      </span>
    </span>
  );
}
