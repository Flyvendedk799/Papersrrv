/**
 * CaseSectionRule — editorial section header.
 *
 *     · · ·   WHAT WAS MADE   · 13 artifacts   ───────────  [↻]
 *
 * Pattern: left-aligned three-dot ornament, small mono kicker,
 * meta pill, flexing rule to the right edge, optional trailing
 * action. Reads as a chapter head in a periodical, not a card
 * header in a SaaS product.
 */

import { cn } from "../../../lib/utils";

interface Props {
  id?: string;
  label: string;
  meta?: React.ReactNode;
  tone?: "ink" | "acid" | "mute";
  action?: React.ReactNode;
  ornament?: string;
  className?: string;
}

const TONE_COLOR: Record<NonNullable<Props["tone"]>, string> = {
  ink: "text-[var(--boared-ink)]",
  acid: "text-[var(--boared-acid)]",
  mute: "text-[var(--boared-ink-faint)]",
};

export function CaseSectionRule({
  id,
  label,
  meta,
  tone = "ink",
  action,
  ornament = "·  ·  ·",
  className,
}: Props) {
  return (
    <header
      id={id}
      className={cn("flex items-center gap-3 scroll-mt-8 pt-1", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "font-mono text-[0.72rem] tracking-[0.3em] shrink-0 text-[var(--boared-ink-faint)]",
        )}
      >
        {ornament}
      </span>
      <h2
        className={cn(
          "font-mono text-[0.66rem] uppercase tracking-[0.26em] shrink-0",
          TONE_COLOR[tone],
        )}
      >
        {label}
      </h2>
      {meta && (
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] tabular-nums shrink-0">
          {meta}
        </span>
      )}
      <span
        aria-hidden="true"
        className="flex-1 min-w-[24px] h-px bg-[var(--boared-rule)]"
      />
      {action && <span className="shrink-0">{action}</span>}
    </header>
  );
}
