/**
 * CaseStickyBar — a slim sticky bar that appears when the hero
 * scrolls past the viewport. Keeps the reader oriented in a long
 * document: identity, status, a row of chip-style chapter shortcuts.
 *
 * Hidden until an IntersectionObserver reports the hero leaving
 * the top of the viewport. Slides in from the top.
 */

import { useEffect, useRef, useState } from "react";
import type { Issue } from "@paperclipai/shared";
import { cn, relativeTime } from "../../../lib/utils";
import { StatusIcon } from "../../StatusIcon";

export interface StickyChapter {
  id: string;
  label: string;
}

interface Props {
  issue: Issue;
  heroAnchorId: string;
  chapters: StickyChapter[];
  /** When set, this chapter id is highlighted as currently-viewed. */
  activeChapter?: string | null;
  className?: string;
}

export function CaseStickyBar({
  issue,
  heroAnchorId,
  chapters,
  activeChapter,
  className,
}: Props) {
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = document.getElementById(heroAnchorId);
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Visible only after the hero has fully scrolled past, so the
        // bar doesn't fight with the hero while the reader can still
        // see it.
        const heroBottom = entry.boundingClientRect.bottom;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setVisible(heroBottom < 20);
        });
      },
      { threshold: [0, 0.1, 0.5, 1] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [heroAnchorId]);

  const onJump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className={cn(
        "hidden md:block fixed top-0 left-0 right-0 z-40 transition-[transform,opacity] duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none",
        className,
      )}
      aria-hidden={!visible}
    >
      <div className="mx-auto w-full max-w-[1280px] px-3 md:px-6">
        <div className="mt-2 flex items-center gap-3 px-3 py-2 border border-[var(--boared-rule)] bg-[var(--boared-paper)]/95 backdrop-blur-sm shadow-sm">
          {/* Identity block */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] shrink-0">
              § {issue.identifier ?? issue.id.slice(0, 8)}
            </span>
            <span className="truncate font-serif italic text-[0.92rem] text-[var(--boared-ink)]">
              {issue.title}
            </span>
          </div>
          {/* Status */}
          <span className="shrink-0">
            <StatusIcon status={issue.status} />
          </span>
          {/* Chapter shortcuts */}
          <nav aria-label="Jump to section" className="ml-auto hidden lg:flex items-center gap-1 shrink-0">
            {chapters.map((c) => {
              const isActive = activeChapter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onJump(c.id)}
                  className={cn(
                    "px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] transition-colors",
                    isActive
                      ? "text-[var(--boared-acid)]"
                      : "text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </nav>
          {/* Relative updated time — small right-aligned */}
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] shrink-0 tabular-nums">
            {relativeTime(issue.updatedAt)}
          </span>
          {/* Back-to-top */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            title="Back to top"
            className="inline-flex items-center justify-center h-6 w-6 border border-[var(--boared-rule)] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] hover:bg-[var(--boared-paper-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/40"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M 5 2 L 5 8 M 5 2 L 2 5 M 5 2 L 8 5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
