/* ─────────────────────────────────────────────────────────────────────
 *  TourPlayer — full-viewport caption overlay while the guided tour
 *  is playing.
 *
 *  Minimal. One caption line at bottom-center, a chapter progress
 *  row, and a subtle "press Esc to cancel" hint.
 *
 *  Position: fixed, pointer-events: none EXCEPT for the cancel button.
 *  This means the tour lets the user still scroll and interact — the
 *  caption is purely informational, not modal.
 * ───────────────────────────────────────────────────────────────────── */

import type { Chapter } from "../data/chapters";

interface TourPlayerProps {
  /** Null when the tour is not running. */
  caption: string | null;
  /** Currently-active chapter. Used for the progress dots. */
  current: Chapter | null;
  /** Full chapter list so we can render one dot per chapter. */
  chapters: Chapter[];
  /** Fires when user hits the Cancel button. */
  onCancel: () => void;
}

export function TourPlayer({
  caption,
  current,
  chapters,
  onCancel,
}: TourPlayerProps) {
  if (!caption || !current) return null;

  const activeIndex = chapters.findIndex((c) => c.key === current.key);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 pointer-events-none flex flex-col items-center"
      style={{ paddingBottom: "min(6vh, 48px)" }}
    >
      {/* Caption card */}
      <div
        className="pointer-events-auto"
        style={{
          maxWidth: "min(620px, calc(100% - 32px))",
          padding: "14px 22px",
          background: "rgba(8,8,10,0.9)",
          color: "#F5E9CB",
          border: "1px solid rgba(245,233,203,0.22)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
        }}
      >
        {/* Chapter eyebrow */}
        <div
          className="font-mono uppercase flex items-baseline gap-3 mb-2"
          style={{
            fontSize: "0.52rem",
            letterSpacing: "0.34em",
            color: "#A89A70",
          }}
        >
          <span>§ {current.numeral}</span>
          <span style={{ opacity: 0.6 }}>·</span>
          <span>{current.title}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            className="transition-colors"
            style={{
              background: "transparent",
              border: "none",
              color: "#A89A70",
              fontFamily: "inherit",
              fontSize: "inherit",
              letterSpacing: "inherit",
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FF6B4A")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#A89A70")}
          >
            Esc · Exit tour
          </button>
        </div>

        {/* The narration line */}
        <p
          className="font-display italic leading-snug"
          style={{
            fontSize: "clamp(1rem, 2.2vw, 1.2rem)",
            color: "#F5E9CB",
          }}
        >
          {caption}
        </p>

        {/* Progress dots — one per chapter */}
        <div className="mt-3 flex items-center gap-1.5">
          {chapters.map((ch, i) => {
            const past = i < activeIndex;
            const here = i === activeIndex;
            return (
              <span
                key={ch.key}
                aria-hidden="true"
                style={{
                  width: here ? 18 : 7,
                  height: 3,
                  background: past
                    ? "rgba(245,233,203,0.5)"
                    : here
                      ? "#FF6B4A"
                      : "rgba(245,233,203,0.15)",
                  transition: "width 400ms ease, background 400ms ease",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
