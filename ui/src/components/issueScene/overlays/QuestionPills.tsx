/* ─────────────────────────────────────────────────────────────────────
 *  QuestionPills — the lens bar.
 *
 *  Sits above the sphere (or as an overlay along the top edge of the
 *  canvas). Clicking a pill activates a question-driven highlight that
 *  dims non-answer nodes and flies the camera to a fitted pose.
 *
 *  The pills deliberately read as questions, not layer names, so the
 *  user thinks in terms of "what am I asking?" not "what 3D stuff?".
 * ───────────────────────────────────────────────────────────────────── */

import type { LensKey } from "../state/useLens";

interface Pill {
  key: LensKey;
  label: string;
  glyph: string;
}

const PILLS: Pill[] = [
  { key: "free", label: "Free", glyph: "◇" },
  { key: "blocking", label: "What's blocking?", glyph: "◎" },
  { key: "who", label: "Who's on this?", glyph: "●" },
  { key: "recent", label: "What changed?", glyph: "↻" },
  { key: "story", label: "Story", glyph: "▷" },
];

interface QuestionPillsProps {
  lens: LensKey;
  onChange: (l: LensKey) => void;
  /** Optional counts to annotate each pill (e.g. "2 pending"). Keys
   *  match LensKey. */
  counts?: Partial<Record<LensKey, string | number | undefined>>;
  /** Optional caption line shown next to the pills (lens result). */
  caption?: string | null;
}

export function QuestionPills({
  lens,
  onChange,
  counts,
  caption,
}: QuestionPillsProps) {
  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto flex flex-col items-center gap-1.5"
    >
      <div className="flex items-center gap-1.5">
        {PILLS.map((p) => {
          const active = lens === p.key;
          const count = counts?.[p.key];
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              aria-pressed={active}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 h-7 transition-colors cursor-pointer"
              style={{
                background: active
                  ? "var(--boared-ink, #1A1A18)"
                  : "color-mix(in oklch, var(--boared-paper, #F2F0EA) 88%, transparent)",
                color: active
                  ? "var(--boared-paper, #F2F0EA)"
                  : "var(--boared-ink, #1A1A18)",
                borderColor: active
                  ? "var(--boared-ink, #1A1A18)"
                  : "var(--boared-rule, #D8D6CF)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.62rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true" style={{ opacity: 0.72 }}>
                {p.glyph}
              </span>
              <span>{p.label}</span>
              {count !== undefined && count !== "" && (
                <span
                  style={{
                    opacity: 0.7,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {caption && (
        <div
          className="rounded-sm px-2 py-0.5 pointer-events-none"
          style={{
            background:
              "color-mix(in oklch, var(--boared-paper, #F2F0EA) 80%, transparent)",
            color: "var(--boared-ink-soft, #3F3F3A)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.58rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
