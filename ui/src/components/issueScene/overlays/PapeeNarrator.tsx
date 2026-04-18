/* ─────────────────────────────────────────────────────────────────────
 *  PapeeNarrator — a small contextual quote card from Papee that sits
 *  inside the Case Companion.
 *
 *  Intentionally minimal. This is NOT a streaming chat surface — the
 *  global PapeeSidebarWidget still owns that. This is a "Papee
 *  whispering a line" card, with a button to open the full chat.
 *
 *  The quote line is chosen by state:
 *    · blocked           → "This one's stuck. Want me to figure out what's in the way?"
 *    · pending approval  → "An agent's asking for your sign-off. Want the summary?"
 *    · stale > 3d        → "Nothing's moved in a while. Want me to poke it?"
 *    · live runs         → "Two agents are on this right now. Want me to narrate?"
 *    · done              → "This one's closed out. Nothing for you to do here."
 *    · otherwise         → a general inviting line
 *
 *  When PapeeContext is not available (e.g. during SSR or a rare
 *  test environment), the component renders the quote but omits the
 *  CTA — it never crashes.
 * ───────────────────────────────────────────────────────────────────── */

import type { Narrative } from "../scene/narrative";
import type { Issue, IssueStatus } from "@paperclipai/shared";
import { usePapeeOptional } from "../../../context/PapeeContext";

interface PapeeNarratorProps {
  issue: Issue;
  narrative: Narrative;
  /** Optional context to pass along when opening chat. */
  issueIdentifier?: string;
}

export function PapeeNarrator({ issue, narrative }: PapeeNarratorProps) {
  const papee = usePapeeOptional();
  const line = pickLine(issue.status as IssueStatus, narrative);

  const handleAsk = () => {
    if (!papee) return;
    // Make sure Papee is visible if the user has it minimized/hidden.
    papee.updatePrefs({ visible: true, minimized: false });
    papee.setChatOpen(true);
  };

  return (
    <section
      className="boared-reveal"
      style={{ animationDelay: "240ms" }}
    >
      <div
        className="font-mono uppercase mb-2"
        style={{
          fontSize: "0.56rem",
          letterSpacing: "0.32em",
          color: "var(--boared-ink-faint, #82827A)",
        }}
      >
        Ask Papee
      </div>

      <div
        className="relative"
        style={{
          border: "1px solid var(--boared-rule, #D8D6CF)",
          background: "var(--boared-paper-2, transparent)",
          padding: "10px 12px",
        }}
      >
        {/* Left opening quote mark — typographic detail */}
        <span
          aria-hidden="true"
          className="font-display italic"
          style={{
            position: "absolute",
            top: 2,
            left: 6,
            fontSize: "1.8rem",
            lineHeight: 1,
            opacity: 0.35,
            color: "var(--boared-acid, currentColor)",
          }}
        >
          &ldquo;
        </span>
        <p
          className="font-display italic leading-snug"
          style={{
            fontSize: "0.92rem",
            color: "var(--boared-ink, inherit)",
            paddingLeft: 18,
          }}
        >
          {line}
        </p>

        {papee && (
          <button
            type="button"
            onClick={handleAsk}
            className="mt-2 font-mono uppercase transition-colors"
            style={{
              fontSize: "0.58rem",
              letterSpacing: "0.24em",
              color: "var(--boared-acid, currentColor)",
              padding: "4px 0 0 18px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Open chat &nbsp;→
          </button>
        )}
      </div>
    </section>
  );
}

function pickLine(status: IssueStatus, narrative: Narrative): string {
  const chipKeys = new Set(narrative.chips.map((c) => c.key));

  if (chipKeys.has("pending-approval")) {
    return "An agent's asking for your sign-off. Want me to summarise what it's proposing?";
  }
  if (status === "blocked") {
    return "This one's stuck. Want me to figure out what's in the way?";
  }
  if (chipKeys.has("live")) {
    return "There's live work happening. Want me to narrate what's going on?";
  }
  if (chipKeys.has("stale")) {
    return "Nothing's happened here in a while. Want me to poke it back to life?";
  }
  if (status === "done") {
    return "This one's closed. Proud of us. Anything else I can help with?";
  }
  if (status === "cancelled") {
    return "This one was dropped. If that was a mistake, I can reopen it for you.";
  }
  return "Want a hand walking through this case? I can explain anything here.";
}
