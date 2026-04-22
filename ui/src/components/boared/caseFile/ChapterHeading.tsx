/**
 * ChapterHeading — compact, product-grade chapter marker.
 *
 * Earlier version read like a newspaper page opener (Roman numerals,
 * big italic title, editorial standfirst). This version is tighter:
 *
 *     [●] HOW IT GOT HERE · 5 STEPS ────────────────  [↻]
 *
 * One row, kicker-sized. Acid dot anchors the row. Title in mono
 * caps, lightly tracked. Rule flexes to the right edge. Optional
 * action tucks in the trailing slot. Section count / meta lives
 * inline instead of below. All sections are created equal — no
 * "Chapter III · Chapter IV" scaffolding.
 *
 * Still scroll-reveals (opacity + 8px rise, 400 ms) so entering a
 * chapter has a subtle cinematic cue without the drama.
 */

import { useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";

interface Props {
  id?: string;
  title: string;
  meta?: React.ReactNode;
  tone?: "ink" | "acid";
  action?: React.ReactNode;
  className?: string;
  /** Legacy prop — deprecated; kept so existing callers don't error.
   * No longer rendered; the page got too wordy. */
  index?: number;
  subtitle?: React.ReactNode;
  compact?: boolean;
}

export function ChapterHeading({
  id,
  title,
  meta,
  tone = "ink",
  action,
  className,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
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
        "scroll-mt-20 flex items-center gap-3",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full shrink-0",
          tone === "acid" ? "bg-[var(--boared-acid)]" : "bg-[var(--boared-ink)]",
        )}
      />
      <h2
        className={cn(
          "font-mono text-[0.72rem] uppercase tracking-[0.22em] shrink-0",
          tone === "acid" ? "text-[var(--boared-acid)]" : "text-[var(--boared-ink)]",
        )}
      >
        {title}
      </h2>
      {meta && (
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-[var(--boared-ink-faint)] tabular-nums shrink-0">
          {meta}
        </span>
      )}
      <span
        aria-hidden="true"
        className="flex-1 h-px bg-[var(--boared-rule)]"
      />
      {action && <span className="shrink-0">{action}</span>}
    </header>
  );
}
