/* ─────────────────────────────────────────────────────────────────────
 *  <Jargon> — inline wrapper that opens a plain-English definition.
 *
 *  Usage:
 *    <Jargon term="run">runs</Jargon>
 *    <Jargon term="in_progress" label="in progress" />
 *
 *  Renders the children as a dotted-underline span. Click (or keyboard
 *  focus + Enter) opens a small popover with the GLOSSARY entry.
 *  Keyboard accessible via Radix Popover primitives. Falls back to
 *  rendering children unchanged if the term isn't known (never
 *  swallows content).
 *
 *  Safe to scatter across case-file prose without adding visual noise —
 *  the underline is 1px dotted creamDim, visible only close-up.
 * ───────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { glossaryEntry } from "@/lib/glossary";

interface JargonProps {
  /** Glossary key, e.g. "run" or "in_progress". Falls back silently if unknown. */
  term: string;
  /** Optional visible label. Defaults to the wrapped children. */
  children?: ReactNode;
  /** Side where the popover opens (radix semantic). */
  side?: "top" | "right" | "bottom" | "left";
  /** Visual variant — inline uses dotted underline, standalone adds a `?` hint glyph. */
  variant?: "inline" | "standalone";
}

export function Jargon({
  term,
  children,
  side = "top",
  variant = "inline",
}: JargonProps) {
  const entry = glossaryEntry(term);

  // Unknown term → render children unchanged. Never swallow copy.
  if (!entry) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="jargon-trigger inline align-baseline text-left"
          aria-label={`Define: ${entry.title}`}
          style={{
            cursor: "help",
            background: "transparent",
            padding: 0,
            border: "none",
            color: "inherit",
            font: "inherit",
            borderBottom: "1px dotted currentColor",
            opacity: 0.95,
          }}
        >
          {children ?? entry.title.toLowerCase()}
          {variant === "standalone" && (
            <span
              aria-hidden="true"
              style={{ marginLeft: 3, opacity: 0.55, fontSize: "0.85em" }}
            >
              ?
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={6}
        className="max-w-[280px] p-3"
        style={{ fontSize: "0.78rem", lineHeight: 1.45 }}
      >
        <div
          className="font-mono uppercase mb-1.5"
          style={{
            fontSize: "0.56rem",
            letterSpacing: "0.22em",
            color: "var(--boared-ink-faint, #82827A)",
          }}
        >
          {entry.title}
        </div>
        <div style={{ color: "var(--boared-ink, #1A1A18)", marginBottom: entry.long ? 6 : 0 }}>
          {entry.short}
        </div>
        {entry.long && (
          <div
            style={{
              color: "var(--boared-ink-soft, #3F3F3A)",
              marginTop: 6,
              paddingTop: 6,
              borderTop: "1px solid var(--boared-rule, #D8D6CF)",
            }}
          >
            {entry.long}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
