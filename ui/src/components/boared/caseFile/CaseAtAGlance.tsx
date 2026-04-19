/**
 * CaseAtAGlance — a compact stats band that sits under the hero.
 * Four pillars of "where does this case stand" in one glanceable
 * line: delegation count, attempt count, related-cases resolution,
 * conversation length. Each pillar is a tiny vertical stack of
 * label + big number, separated by a thin rule.
 *
 * This is the page's spatial hint that the case is ACTIVE.
 * Reading this gets you 80% of the case's state without reading
 * the abstract or the thread.
 */

import { cn } from "../../../lib/utils";
import type { CaseSynthesisPayload } from "../../../api/issues";

interface Props {
  synthesis: CaseSynthesisPayload | null;
  commentsTotal: number;
  className?: string;
}

export function CaseAtAGlance({ synthesis, commentsTotal, className }: Props) {
  const delegations = synthesis?.graph.nodes.filter((n) => n.kind === "delegation") ?? [];
  const subIssues = synthesis?.graph.nodes.filter((n) => n.kind === "sub-issue") ?? [];
  const resolvedSubs = subIssues.filter((n) => n.status === "done").length;

  const totalAttempts = delegations.reduce((acc, d) => {
    // sublabel pattern: "<N> attempt(s) · <outcome>"
    const match = d.sublabel?.match(/^(\d+)\s+attempt/);
    return acc + (match ? parseInt(match[1], 10) : 0);
  }, 0);
  const liveDelegations = delegations.filter((d) => d.status === "live").length;

  const pillars: Array<{ label: string; big: string; sub?: string; tone?: "ink" | "acid" }> = [
    {
      label: "Delegated to",
      big: String(delegations.length),
      sub: delegations.length === 1 ? "agent" : "agents",
      tone: liveDelegations > 0 ? "acid" : "ink",
    },
    {
      label: "Total attempts",
      big: String(totalAttempts),
    },
    {
      label: subIssues.length > 0 ? "Related cases" : "Conversation",
      big:
        subIssues.length > 0
          ? `${resolvedSubs}/${subIssues.length}`
          : String(commentsTotal),
      sub: subIssues.length > 0 ? "resolved" : commentsTotal === 1 ? "message" : "messages",
    },
  ];

  // Avoid rendering a band that adds nothing — if there's no real
  // activity on the case, skip.
  if (delegations.length === 0 && subIssues.length === 0 && commentsTotal === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-stretch divide-x divide-[var(--boared-rule)] border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]",
        className,
      )}
    >
      {pillars.map((p, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col gap-0.5 px-4 py-3 min-w-0"
        >
          <div className="font-mono text-[0.52rem] uppercase tracking-[0.2em] text-[var(--boared-ink-faint)]">
            {p.label}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-serif italic text-[1.8rem] leading-none tabular-nums",
                p.tone === "acid"
                  ? "text-[var(--boared-acid)]"
                  : "text-[var(--boared-ink)]",
              )}
            >
              {p.big}
            </span>
            {p.sub && (
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                {p.sub}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
