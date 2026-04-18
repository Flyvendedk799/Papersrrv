/* ─────────────────────────────────────────────────────────────────────
 *  CompanionPlainEnglish — the top block of the Case Companion.
 *
 *  The Board Operator's first question is "what is this?". This block
 *  answers it with a short, non-jargon paragraph assembled in
 *  narrative.ts. Inline Jargon popovers are layered OVER words that a
 *  newcomer might still want defined — but the paragraph reads cleanly
 *  without ever clicking.
 *
 *  Visual grammar matches the editorial voice: Fragment Mono eyebrow
 *  above, Fraunces italic body below.
 * ───────────────────────────────────────────────────────────────────── */

import type { Narrative } from "../scene/narrative";
import type { Issue } from "@paperclipai/shared";
import { Jargon } from "../../Jargon";

interface CompanionPlainEnglishProps {
  issue: Issue;
  narrative: Narrative;
}

export function CompanionPlainEnglish({
  issue,
  narrative,
}: CompanionPlainEnglishProps) {
  return (
    <section
      className="boared-reveal"
      style={{ animationDelay: "0ms" }}
    >
      <div
        className="font-mono uppercase mb-2"
        style={{
          fontSize: "0.56rem",
          letterSpacing: "0.32em",
          color: "var(--boared-ink-faint, #82827A)",
        }}
      >
        In plain English
      </div>

      {/* The headline — Fraunces italic. Always one sentence. */}
      <p
        className="font-display italic leading-snug mb-2"
        style={{
          fontSize: "clamp(1.05rem, 1.5vw, 1.2rem)",
          color: "var(--boared-ink, inherit)",
        }}
      >
        {injectJargon(splitFirstSentence(narrative.plainEnglish).first)}
      </p>

      {/* The rest of the paragraph, body font. Rendered only if the
          narrative had more than one sentence. */}
      {splitFirstSentence(narrative.plainEnglish).rest && (
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--boared-ink-soft, inherit)" }}
        >
          {injectJargon(splitFirstSentence(narrative.plainEnglish).rest!)}
        </p>
      )}

      {/* A tiny metadata line with priority + status dots for
          accessibility. Status text uses a Jargon wrapper so newcomers
          can click the dotted word to learn what "in progress" means. */}
      <div
        className="mt-3 font-mono uppercase flex items-center gap-2"
        style={{
          fontSize: "0.52rem",
          letterSpacing: "0.22em",
          color: "var(--boared-ink-faint, inherit)",
        }}
      >
        <span>Status:</span>
        <Jargon term={issue.status}>{issue.status.replace(/_/g, " ")}</Jargon>
        {issue.priority === "critical" && (
          <>
            <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>
            <Jargon term="priority_critical">critical</Jargon>
          </>
        )}
      </div>
    </section>
  );
}

/** Split on the first period-space, returning (first sentence, rest). */
function splitFirstSentence(s: string): { first: string; rest: string | null } {
  const m = s.match(/^([^.!?]+[.!?])\s+(.*)$/);
  if (!m) return { first: s, rest: null };
  return { first: m[1], rest: m[2] };
}

/** Wrap known jargon words with <Jargon> so clicking reveals the
 *  plain-English definition. Intentionally conservative — we only wrap
 *  a few high-value terms so the paragraph doesn't look like a rash
 *  of dotted underlines. */
function injectJargon(text: string): React.ReactNode {
  // Terms we intercept (case-insensitive match on whole words).
  const terms: { re: RegExp; term: string }[] = [
    { re: /\b(agents?)\b/i, term: "agent" },
    { re: /\b(runs?|attempts?|swings?)\b/i, term: "run" },
    { re: /\b(sign[- ]off|approvals?)\b/i, term: "approval" },
    { re: /\b(stuck)\b/i, term: "blocked" },
    { re: /\b(sub[- ]matters?|smaller tasks?)\b/i, term: "sub_matter" },
  ];

  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Greedy: for each scan we find the earliest match across all
  // patterns, emit plain text before it, then the Jargon span.
  // Loop until no more matches.
  while (true) {
    let earliest: { idx: number; len: number; term: string; text: string } | null = null;
    for (const { re, term } of terms) {
      const m = re.exec(remaining);
      if (m && m.index >= 0) {
        if (!earliest || m.index < earliest.idx) {
          earliest = {
            idx: m.index,
            len: m[0].length,
            term,
            text: m[0],
          };
        }
      }
    }
    if (!earliest) {
      if (remaining) nodes.push(<span key={`p-${key++}`}>{remaining}</span>);
      break;
    }
    if (earliest.idx > 0) {
      nodes.push(
        <span key={`p-${key++}`}>{remaining.slice(0, earliest.idx)}</span>,
      );
    }
    nodes.push(
      <Jargon key={`j-${key++}`} term={earliest.term}>
        {earliest.text}
      </Jargon>,
    );
    remaining = remaining.slice(earliest.idx + earliest.len);
  }

  return <>{nodes}</>;
}
