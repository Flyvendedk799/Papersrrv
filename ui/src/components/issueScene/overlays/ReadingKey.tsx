/* ─────────────────────────────────────────────────────────────────────
 *  ReadingKey — the always-visible decoder for the Deliberation Sphere.
 *
 *  A compact card, top-left, below the StatsStrip. Collapsible (but
 *  default-open on first visit). Every row is one clean decoding:
 *  what the shape/color/angle means, in plain English, in the Boared
 *  editorial voice.
 *
 *  Uses the design-system tokens (`--boared-*`) so it fits the rest
 *  of the app and carries through dark mode.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

const STORAGE_KEY = "paperclip.issueScene.readingKeyOpen";

interface Row {
  glyph: string;
  label: string;
  body: string;
}

const ROWS: Row[] = [
  { glyph: "🧠", label: "Core", body: "this matter — color = status" },
  { glyph: "⚡", label: "Ink trails", body: "synapses — pulse = live" },
  { glyph: "●", label: "Inner shell", body: "runs — size = effort, angle = when" },
  { glyph: "○", label: "Outer shell", body: "correspondence — angle = when" },
  { glyph: "↑", label: "Above", body: "parent matters" },
  { glyph: "↓", label: "Below", body: "sub-matters spawned from this" },
  { glyph: "◎", label: "Poles", body: "approvals awaiting your sign-off" },
];

export function ReadingKey() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  return (
    <div
      data-reading-key
      className="absolute top-14 left-5 z-10 pointer-events-auto select-none"
      style={{
        maxWidth: 280,
      }}
    >
      <div
        className="rounded-md border px-3 py-2.5"
        style={{
          background: "color-mix(in oklch, var(--boared-paper, #F2F0EA) 88%, transparent)",
          borderColor: "var(--boared-rule, #D8D6CF)",
          color: "var(--boared-ink, #1A1A18)",
          boxShadow: "0 1px 0 color-mix(in oklch, var(--boared-ink, #1A1A18) 4%, transparent)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 cursor-pointer"
          aria-expanded={open}
        >
          <span
            className="font-mono uppercase"
            style={{
              fontSize: "0.55rem",
              letterSpacing: "0.26em",
              color: "var(--boared-ink-soft, #3F3F3A)",
            }}
          >
            Reading this sphere
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: "0.7rem",
              color: "var(--boared-ink-faint, #82827A)",
            }}
            aria-hidden="true"
          >
            {open ? "–" : "+"}
          </span>
        </button>

        {open && (
          <ul className="mt-2 space-y-1">
            {ROWS.map((row) => (
              <li
                key={row.label}
                className="flex items-start gap-2"
                style={{
                  fontSize: "0.72rem",
                  lineHeight: 1.35,
                }}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 inline-flex items-center justify-center"
                  style={{
                    width: 14,
                    height: 14,
                    color: "var(--boared-ink-soft, #3F3F3A)",
                  }}
                >
                  {row.glyph}
                </span>
                <span style={{ color: "var(--boared-ink, #1A1A18)" }}>
                  <strong style={{ fontWeight: 600 }}>{row.label}</strong>
                  <span
                    style={{
                      color: "var(--boared-ink-soft, #3F3F3A)",
                      marginLeft: 6,
                    }}
                  >
                    {row.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
