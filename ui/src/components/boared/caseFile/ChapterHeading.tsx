/**
 * ChapterHeading — dramatic chapter opener for the case file.
 *
 * Replaces the earlier `CaseSectionRule` (a thin mono line) with a
 * treatment that reads like the opening page of a chapter in a
 * periodical:
 *
 *     ┌────────────────────────────────────────────────────────┐
 *     │  CHAPTER III    ·    13 artifacts      ───────  [↻]   │
 *     │                                                         │
 *     │  What was made                                          │
 *     │  ─────────────                                          │
 *     │  ‹three real results produced during this case›         │
 *     └────────────────────────────────────────────────────────┘
 *
 * Visual devices:
 *   · Roman numeral chapter index (kicker)
 *   · Huge serif italic title (clamp 1.6rem → 2.6rem)
 *   · Subtitle one-liner set as editorial standfirst
 *   · Acid rule underline that extends full-width
 *   · Optional trailing action tucked in top right
 *
 * Designed to be used once per chapter. IDs drive the sticky
 * chapter nav's scroll-spy.
 */

import { useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";

const ROMAN = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

interface Props {
  id?: string;
  /** 1-indexed chapter number. Rendered as a Roman numeral. */
  index?: number;
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  tone?: "ink" | "acid";
  action?: React.ReactNode;
  className?: string;
  /** When true, the title gets tighter vertical rhythm (for
   * less-important chapters like Metadata). */
  compact?: boolean;
}

export function ChapterHeading({
  id,
  index,
  title,
  subtitle,
  meta,
  tone = "ink",
  action,
  className,
  compact,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // First fold is always revealed immediately so the hero + the
    // first chapter don't feel empty on initial paint.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
      el.dataset.revealed = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.revealed = "true";
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <header
      ref={ref}
      id={id}
      data-chapter-reveal
      className={cn(
        "scroll-mt-20 relative group/chapter",
        compact ? "pt-4 pb-2" : "pt-8 pb-4",
        className,
      )}
    >
      {/* Kicker — chapter number + meta */}
      <div className="flex items-baseline gap-3 mb-1.5">
        {typeof index === "number" && (
          <span
            className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--boared-acid)]"
            aria-hidden="true"
          >
            Chapter {ROMAN[Math.max(0, index - 1)] ?? String(index)}
          </span>
        )}
        {meta && (
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] tabular-nums">
            {meta}
          </span>
        )}
        <span
          aria-hidden="true"
          className="flex-1 h-px bg-[var(--boared-rule)]/70"
        />
        {action && <span className="shrink-0">{action}</span>}
      </div>

      {/* Title */}
      <h2
        className={cn(
          "font-serif italic leading-[0.98] tracking-tight",
          tone === "acid" ? "text-[var(--boared-acid)]" : "text-[var(--boared-ink)]",
          compact
            ? "text-[clamp(1.3rem,3vw,1.9rem)]"
            : "text-[clamp(1.65rem,4.2vw,2.65rem)]",
        )}
      >
        {title}
      </h2>

      {/* Standfirst */}
      {subtitle && (
        <p
          className={cn(
            "mt-2 max-w-[56ch] font-serif italic text-[var(--boared-ink-soft)]",
            compact ? "text-[0.9rem] leading-snug" : "text-[1rem] leading-[1.5]",
          )}
        >
          {subtitle}
        </p>
      )}

      {/* Acid underline — draws in on hover for a subtle editorial
       * cue that the chapter is interactive (we'll use this for the
       * sticky chapter nav jump). */}
      <span
        aria-hidden="true"
        className="block mt-3 h-[2px] w-12 bg-[var(--boared-acid)]/70 transition-all duration-500 ease-out group-hover/chapter:w-24"
      />
    </header>
  );
}
