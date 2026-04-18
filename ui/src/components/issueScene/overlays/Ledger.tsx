/* ─────────────────────────────────────────────────────────────────────
 *  Ledger — persistent bottom-center brief over the Deliberation Sphere.
 *
 *  Plain-English verdict in the Boared editorial voice. Replaces the
 *  prior serif-italic "§04 · The Docket" chrome. Structure:
 *
 *    [STATUS · PRIORITY]                     mono-caps verdict line
 *    The issue itself: one clear sentence.   plain English body
 *    [CHIP] [CHIP] [CHIP]                    signal chips (live, alerts)
 *    [→ NEXT ACTION]                         single opinionated CTA
 *
 *  Uses Boared tokens (--boared-*) so it tracks the rest of the app's
 *  theme and prints readable against both light and dark atmospheres.
 * ───────────────────────────────────────────────────────────────────── */

import type {
  Narrative,
  NarrativeChip,
  NarrativeNextAction,
  ChipTone,
} from "../scene/narrative";

interface LedgerProps {
  narrative: Narrative;
  /** Fade/translate in when reveal has reached this stage. */
  visible: boolean;
  /** Fires when the user clicks the CTA. Parent decides what to do. */
  onNextAction?: () => void;
  /** When true, drop the prose and render just the chip strip. */
  compact?: boolean;
  /** Optional verdict overrides (status + priority text). The Ledger
   *  falls back to pulling these from the narrative clauses. */
  statusLabel?: string;
  priorityLabel?: string;
}

const CHIP_TONE: Record<ChipTone, { fg: string; border: string; bg: string }> = {
  live:    { fg: "#0F8A5A", border: "#0F8A5A66", bg: "#0F8A5A14" },
  alert:   { fg: "#B22B1A", border: "#B22B1A66", bg: "#B22B1A12" },
  warn:    { fg: "#8A5A00", border: "#8A5A0066", bg: "#F7C26A22" },
  info:    { fg: "#1A4E8A", border: "#1A4E8A55", bg: "#1A4E8A12" },
  good:    { fg: "#176B3A", border: "#176B3A55", bg: "#176B3A12" },
  neutral: { fg: "var(--boared-ink-soft, #3F3F3A)", border: "var(--boared-rule, #D8D6CF)", bg: "transparent" },
};

export function Ledger({
  narrative,
  visible,
  onNextAction,
  compact = false,
  statusLabel,
  priorityLabel,
}: LedgerProps) {
  const { plainEnglish, lede, chips, nextAction } = narrative;
  // Prefer the plain-English translation as the body; fall back to lede.
  const body = plainEnglish || lede;

  if (compact) {
    if (chips.length === 0) return null;
    return (
      <div
        className="absolute left-1/2 z-20 select-none pointer-events-none"
        style={{
          bottom: 16,
          transform: `translate(-50%, ${visible ? 0 : 8}px)`,
          opacity: visible ? 1 : 0,
          transition:
            "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          {chips.map((chip) => <Chip key={chip.key} chip={chip} />)}
        </div>
      </div>
    );
  }

  return (
    <div
      data-ledger
      className="absolute left-1/2 z-20 select-none"
      style={{
        bottom: 20,
        transform: `translate(-50%, ${visible ? 0 : 12}px)`,
        opacity: visible ? 1 : 0,
        transition:
          "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        width: "min(620px, calc(100% - 40px))",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        className="flex flex-col gap-2 rounded-md border px-4 py-3"
        style={{
          background:
            "color-mix(in oklch, var(--boared-paper, #F2F0EA) 92%, transparent)",
          borderColor: "var(--boared-rule, #D8D6CF)",
          color: "var(--boared-ink, #1A1A18)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          boxShadow:
            "0 8px 28px color-mix(in oklch, var(--boared-ink, #1A1A18) 18%, transparent)",
        }}
      >
        {/* Verdict eyebrow — STATUS · PRIORITY */}
        {(statusLabel || priorityLabel) && (
          <div
            className="font-mono uppercase"
            style={{
              fontSize: "0.56rem",
              letterSpacing: "0.26em",
              color: "var(--boared-ink-soft, #3F3F3A)",
            }}
          >
            {statusLabel}
            {statusLabel && priorityLabel && <span style={{ margin: "0 0.6em", opacity: 0.5 }}>·</span>}
            {priorityLabel}
          </div>
        )}

        {/* Plain-English body */}
        <p
          style={{
            fontSize: "0.9rem",
            lineHeight: 1.45,
            color: "var(--boared-ink, #1A1A18)",
            margin: 0,
          }}
        >
          {body}
        </p>

        {/* Chip strip */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => <Chip key={chip.key} chip={chip} />)}
          </div>
        )}

        {/* Next action CTA */}
        {nextAction && (
          <NextActionButton action={nextAction} onClick={onNextAction} />
        )}
      </div>
    </div>
  );
}

/** Inline chip row for embedding inside other cards. */
export function LedgerChipStrip({ narrative }: { narrative: Narrative }) {
  const { chips } = narrative;
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => <Chip key={chip.key} chip={chip} />)}
    </div>
  );
}

function Chip({ chip }: { chip: NarrativeChip }) {
  const tone = CHIP_TONE[chip.tone];
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded-sm border font-mono uppercase"
      style={{
        color: tone.fg,
        borderColor: tone.border,
        background: tone.bg,
        fontSize: "0.56rem",
        letterSpacing: "0.2em",
        animation: chip.pulse
          ? "ledger-chip-pulse 1.8s ease-in-out infinite"
          : undefined,
      }}
    >
      {chip.label}
    </span>
  );
}

function NextActionButton({
  action,
  onClick,
}: {
  action: NarrativeNextAction;
  onClick?: () => void;
}) {
  const isLoud = action.tone === "alert" || action.tone === "warn";
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-0.5 inline-flex self-start items-center gap-2 rounded-md px-3 py-1.5 border font-mono uppercase transition-colors cursor-pointer"
      style={{
        background: isLoud
          ? "var(--boared-acid, #B22B1A)"
          : "var(--boared-ink, #1A1A18)",
        color: isLoud
          ? "var(--boared-acid-ink, #F2F0EA)"
          : "var(--boared-paper, #F2F0EA)",
        borderColor: isLoud
          ? "var(--boared-acid, #B22B1A)"
          : "var(--boared-ink, #1A1A18)",
        fontSize: "0.62rem",
        letterSpacing: "0.2em",
      }}
    >
      <span aria-hidden="true">→</span>
      <span>{action.label}</span>
    </button>
  );
}

/* Keyframes for chip pulse — injected once at module load. */
if (typeof document !== "undefined" && !document.getElementById("ledger-keyframes")) {
  const el = document.createElement("style");
  el.id = "ledger-keyframes";
  el.textContent = `
    @keyframes ledger-chip-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.04); opacity: 0.9; }
    }
  `;
  document.head.appendChild(el);
}
