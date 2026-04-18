/* ─────────────────────────────────────────────────────────────────────
 *  CompanionHeader — shared header for all Companion modes.
 *
 *  Purpose: every mode shows the same masthead (title + optional chip
 *  strip) so the user's visual anchor doesn't move as the Companion
 *  switches modes. Only the body changes.
 * ───────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import type { Narrative } from "../../scene/narrative";
import { LedgerChipStrip } from "../Ledger";

interface CompanionHeaderProps {
  /** Masthead text ("The Case Companion" / "Inspector" / "Chapter IV"). */
  title: ReactNode;
  /** Optional subtitle line — e.g. chapter blurb, selected kind. */
  subtitle?: ReactNode;
  /** Narrative — when present, chips render under the subtitle. */
  narrative?: Narrative;
  /** Close / reset button — rendered when a handler is passed. */
  onClose?: () => void;
  /** Label for the close button. */
  closeLabel?: string;
}

export function CompanionHeader({
  title,
  subtitle,
  narrative,
  onClose,
  closeLabel = "Back",
}: CompanionHeaderProps) {
  return (
    <div className="mb-4">
      <div
        className="font-mono uppercase flex items-center gap-3"
        style={{
          fontSize: "0.52rem",
          letterSpacing: "0.4em",
          color: "var(--boared-ink-faint, currentColor)",
        }}
      >
        <span
          className="block h-px flex-1"
          style={{
            background: "var(--boared-rule, currentColor)",
            opacity: 0.7,
          }}
        />
        <span>{title}</span>
        <span
          className="block h-px flex-1"
          style={{
            background: "var(--boared-rule, currentColor)",
            opacity: 0.7,
          }}
        />
      </div>

      {subtitle && (
        <div
          className="mt-2 text-center"
          style={{
            fontSize: "0.68rem",
            color: "var(--boared-ink-soft, inherit)",
            letterSpacing: "0.04em",
          }}
        >
          {subtitle}
        </div>
      )}

      {narrative && (
        <div className="mt-3 flex justify-center">
          <LedgerChipStrip narrative={narrative} />
        </div>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-2 font-mono uppercase transition-colors"
          style={{
            fontSize: "0.5rem",
            letterSpacing: "0.28em",
            color: "var(--boared-ink-faint, currentColor)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 0",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--boared-acid, currentColor)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color =
              "var(--boared-ink-faint, currentColor)")
          }
        >
          ← {closeLabel}
        </button>
      )}
    </div>
  );
}
