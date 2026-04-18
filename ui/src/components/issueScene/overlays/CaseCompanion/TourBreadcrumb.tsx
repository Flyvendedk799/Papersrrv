/* ─────────────────────────────────────────────────────────────────────
 *  CaseCompanion / TourBreadcrumb — minimal mode during guided tour.
 *
 *  The TourPlayer overlay owns the screen during tour playback.
 *  The Companion collapses to a compact chapter progress strip +
 *  a cancel button — that way the user always sees which chapter
 *  they're on and how to exit without being distracted by overview/
 *  inspector content.
 * ───────────────────────────────────────────────────────────────────── */

import type { Chapter } from "../../data/chapters";
import { CompanionHeader } from "./header";

interface TourBreadcrumbProps {
  chapters: Chapter[];
  current: Chapter | null;
  onCancel: () => void;
}

export function TourBreadcrumb({
  chapters,
  current,
  onCancel,
}: TourBreadcrumbProps) {
  const idx = current ? chapters.findIndex((c) => c.key === current.key) : -1;
  return (
    <div>
      <CompanionHeader
        title="On tour"
        subtitle={current ? `${current.numeral} · ${current.title}` : null}
      />
      <ol className="space-y-1.5">
        {chapters.map((ch, i) => {
          const past = i < idx;
          const here = i === idx;
          return (
            <li
              key={ch.key}
              className="flex items-baseline gap-2 font-mono uppercase"
              style={{
                fontSize: "0.56rem",
                letterSpacing: "0.24em",
                color: here
                  ? "var(--boared-acid, currentColor)"
                  : past
                    ? "var(--boared-ink-soft, inherit)"
                    : "var(--boared-ink-faint, inherit)",
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: here ? 14 : 6,
                  height: 2,
                  background: past
                    ? "var(--boared-ink-soft, currentColor)"
                    : here
                      ? "var(--boared-acid, currentColor)"
                      : "var(--boared-ink-faint, currentColor)",
                  opacity: past ? 0.6 : 1,
                  transition: "width 250ms ease",
                }}
              />
              <span style={{ width: 28 }}>§ {ch.numeral}</span>
              <span>{ch.title}</span>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full text-center font-mono uppercase transition-colors"
        style={{
          fontSize: "0.58rem",
          letterSpacing: "0.28em",
          padding: "8px 0",
          color: "var(--boared-ink-faint, currentColor)",
          background: "transparent",
          border: "1px solid var(--boared-rule, currentColor)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.color = "var(--boared-acid, currentColor)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.color =
            "var(--boared-ink-faint, currentColor)")
        }
      >
        Exit tour · Esc
      </button>
    </div>
  );
}
