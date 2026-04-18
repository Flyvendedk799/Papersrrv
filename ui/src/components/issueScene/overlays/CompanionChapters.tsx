/* ─────────────────────────────────────────────────────────────────────
 *  CompanionChapters — the "table of contents" of the case file.
 *
 *  Renders the chapter list from data/chapters.ts as a clickable
 *  vertical stack. Clicking a row scrolls the page to the matching
 *  anchor in IssueDetail. In Cut 2 we also request the matching
 *  camera pose via an optional onSelect callback.
 *
 *  Visual grammar:
 *    · Roman numeral on the left, Fragment Mono, spaced letters
 *    · Title on the right, Fraunces, medium weight
 *    · Blurb below title in small muted body
 *    · Active chapter (based on scroll-spy) gets a thin acid underline
 *      and a small dot glyph
 * ───────────────────────────────────────────────────────────────────── */

import type { Chapter } from "../data/chapters";

interface CompanionChaptersProps {
  chapters: Chapter[];
  /** Key of the currently-active chapter (scroll-spied). Optional. */
  activeKey?: string | null;
  /** Invoked when the user picks a chapter. Parent handles scroll + pose. */
  onSelect?: (chapter: Chapter) => void;
}

export function CompanionChapters({
  chapters,
  activeKey,
  onSelect,
}: CompanionChaptersProps) {
  return (
    <section className="boared-reveal" style={{ animationDelay: "160ms" }}>
      <div
        className="font-mono uppercase mb-2 flex items-center justify-between"
        style={{
          fontSize: "0.56rem",
          letterSpacing: "0.32em",
          color: "var(--boared-ink-faint, #82827A)",
        }}
      >
        <span>Chapters</span>
        <span style={{ opacity: 0.6 }}>{chapters.length}</span>
      </div>

      <ol className="space-y-2">
        {chapters.map((ch) => {
          const isActive = ch.key === activeKey;
          return (
            <li key={ch.key}>
              <a
                href={`#${ch.anchorId}`}
                onClick={(e) => {
                  if (onSelect) {
                    e.preventDefault();
                    onSelect(ch);
                  }
                }}
                className="group block w-full text-left transition-colors"
                style={{
                  padding: "6px 0",
                  borderTop: "1px solid var(--boared-rule, #D8D6CF)",
                  color: "var(--boared-ink, inherit)",
                  textDecoration: "none",
                }}
              >
                <div className="flex items-baseline gap-3">
                  <span
                    className="font-mono shrink-0"
                    style={{
                      fontSize: "0.56rem",
                      letterSpacing: "0.26em",
                      color: isActive
                        ? "var(--boared-acid, #B22B1A)"
                        : "var(--boared-ink-faint, inherit)",
                      width: 24,
                    }}
                  >
                    § {ch.numeral}
                  </span>
                  <span className="flex-1">
                    <span
                      className="font-display italic"
                      style={{
                        fontSize: "0.98rem",
                        fontWeight: 500,
                        color: isActive
                          ? "var(--boared-acid, inherit)"
                          : "var(--boared-ink, inherit)",
                        borderBottom: isActive
                          ? "1px solid var(--boared-acid, currentColor)"
                          : "1px solid transparent",
                        paddingBottom: 1,
                        transition: "color 160ms ease, border-color 160ms ease",
                      }}
                    >
                      {ch.title}
                    </span>
                    <span
                      className="block text-xs mt-0.5"
                      style={{
                        color: "var(--boared-ink-soft, inherit)",
                        lineHeight: 1.35,
                      }}
                    >
                      {ch.blurb}
                    </span>
                  </span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="shrink-0"
                      style={{
                        width: 6,
                        height: 6,
                        background: "var(--boared-acid, currentColor)",
                        marginTop: 8,
                      }}
                    />
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
