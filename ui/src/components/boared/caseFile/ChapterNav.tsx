/**
 * ChapterNav — vertical floating rail on desktop, hidden on mobile.
 *
 * Shows all chapters in the case file with:
 *   · a tiny index tick on the left
 *   · a serif italic chapter label
 *   · the active chapter highlighted with an acid dot + bold ink
 *
 * Scroll-spy: observes each chapter's section via
 * IntersectionObserver; the chapter most visible in the viewport is
 * marked active. Clicking jumps to the section smoothly.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../../lib/utils";

export interface ChapterEntry {
  /** DOM id of the chapter's <header> or section anchor. */
  id: string;
  /** Short label shown in the nav. */
  label: string;
}

export function ChapterNav({
  chapters,
  className,
}: {
  chapters: ChapterEntry[];
  className?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    chapters[0]?.id ?? null,
  );
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (observerRef.current) observerRef.current.disconnect();
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId) setActiveId(bestId);
      },
      {
        // Favour chapters whose tops have passed the upper third of
        // the viewport so the active highlight moves early, not late.
        rootMargin: "-25% 0% -60% 0%",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const c of chapters) {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    }
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [chapters]);

  const items = useMemo(() => chapters, [chapters]);
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Case chapters"
      className={cn(
        "hidden xl:block fixed left-4 top-1/2 -translate-y-1/2 z-[35]",
        className,
      )}
    >
      <ul className="space-y-0.5 pl-3 border-l border-[var(--boared-rule)] py-2">
        {items.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(c.id);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                className={cn(
                  "group/nav inline-flex items-center gap-2 py-1 pr-2 text-left text-[0.82rem] leading-tight transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
                  active
                    ? "text-[var(--boared-ink)]"
                    : "text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-all",
                    active
                      ? "bg-[var(--boared-acid)] scale-125"
                      : "bg-[var(--boared-rule)] group-hover/nav:bg-[var(--boared-ink-faint)]",
                  )}
                />
                <span
                  className={cn(
                    "font-serif italic",
                    active && "tracking-tight",
                  )}
                >
                  {c.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
