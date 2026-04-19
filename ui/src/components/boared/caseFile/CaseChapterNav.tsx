/**
 * CaseChapterNav — a slim floating column of chapter markers
 * pinned to the left edge of the page on desktop. Clicking a
 * marker scrolls to that section. An IntersectionObserver marks
 * the currently-visible chapter as active.
 *
 * On mobile this is hidden — the page scrolls normally and the
 * sticky mobile header handles orientation.
 *
 * Visual: tiny paper-card column with vertical mono labels rotated
 * 90° — reads like the ribbons along the spine of a bound dossier.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils";

export interface ChapterMarker {
  id: string;
  label: string;
}

interface Props {
  markers: ChapterMarker[];
  className?: string;
}

export function CaseChapterNav({ markers, className }: Props) {
  const [active, setActive] = useState<string | null>(markers[0]?.id ?? null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const els = markers
      .map((m) => ({ id: m.id, el: document.getElementById(m.id) }))
      .filter((x): x is { id: string; el: HTMLElement } => !!x.el);
    if (els.length === 0) return;
    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        // Pick the highest-ratio entry; ties resolved by document order.
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const m of markers) {
          const r = visibility.get(m.id) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            bestId = m.id;
          }
        }
        if (bestId) setActive(bestId);
      },
      {
        rootMargin: "-20% 0px -50% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const { el } of els) observer.observe(el);
    return () => observer.disconnect();
  }, [markers]);

  const onJump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav
      ref={navRef}
      aria-label="Chapter navigation"
      className={cn(
        "hidden lg:flex flex-col items-center gap-1",
        "sticky top-8 self-start",
        className,
      )}
    >
      <div className="font-mono text-[0.48rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-2">
        Chapters
      </div>
      {markers.map((m) => {
        const isActive = active === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onJump(m.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "group relative flex items-center gap-2 w-full py-1 pr-2 transition-colors focus-visible:outline-none",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-[2px] transition-all",
                isActive
                  ? "w-6 bg-[var(--boared-acid)]"
                  : "w-3 bg-[var(--boared-rule)] group-hover:bg-[var(--boared-ink-soft)]",
              )}
            />
            <span
              className={cn(
                "font-mono text-[0.54rem] uppercase tracking-[0.18em] whitespace-nowrap transition-colors",
                isActive
                  ? "text-[var(--boared-ink)]"
                  : "text-[var(--boared-ink-faint)] group-hover:text-[var(--boared-ink)]",
              )}
            >
              {m.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
