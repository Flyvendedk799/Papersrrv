/* ─────────────────────────────────────────────────────────────────────
 *  NextActionButton — the single promoted CTA for the page.
 *
 *  Reads `nextAction.tone` for its color. Click fires the handler
 *  passed by the parent (which resolves to: scroll to approvals /
 *  focus composer / fly to live run, based on narrative.nextAction.kind).
 *
 *  Deliberately loud — italic Fraunces, status-toned border, hover
 *  glow. One loud button per page at any given time.
 * ───────────────────────────────────────────────────────────────────── */

import type { NarrativeNextAction } from "../../scene/narrative";

interface Props {
  nextAction: NarrativeNextAction;
  onClick: () => void;
}

export function NextActionButton({ nextAction, onClick }: Props) {
  const toneColor =
    nextAction.tone === "alert"
      ? "var(--boared-acid, #B22B1A)"
      : nextAction.tone === "warn"
        ? "#A76B0F"
        : "var(--boared-ink, currentColor)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left font-display italic flex items-baseline gap-3 transition-all"
      style={{
        fontSize: "1rem",
        padding: "10px 12px",
        border: `1px solid ${toneColor}`,
        background: "var(--boared-paper-2, transparent)",
        color: toneColor,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${toneColor}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span aria-hidden="true" style={{ opacity: 0.8 }}>
        →
      </span>
      <span>{nextAction.label}</span>
    </button>
  );
}
