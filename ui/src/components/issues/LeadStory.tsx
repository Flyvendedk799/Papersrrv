/* ─────────────────────────────────────────────────────────────────────
 *  LeadStory — the front-page hero for the single most urgent issue.
 *
 *  Picks the "top of the fold" story: live > blocked > critical > high,
 *  then most-recent. Renders it like a newspaper lead:
 *    · kicker (category tag)
 *    · massive Fraunces italic headline with hanging quote
 *    · dek (1-line sub-headline)
 *    · dropcap paragraph with the description
 *    · byline (identifier · status · priority · timeAgo)
 *
 *  Links to the issue's detail page. Falls back to null when the list
 *  is empty or still loading — caller shows a different slot.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { useCompany } from "../../context/CompanyContext";
import { timeAgo } from "../../lib/timeAgo";

interface LeadStoryProps {
  issues: Issue[];
  liveIssueIds: Set<string>;
}

const URGENCY: Record<string, number> = {
  blocked: 100,
  in_progress: 80,
  in_review: 70,
  todo: 40,
  backlog: 20,
  done: 5,
  cancelled: 0,
};
const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 40,
  high: 28,
  medium: 14,
  low: 4,
};

function pickLead(issues: Issue[], liveIds: Set<string>): Issue | null {
  if (issues.length === 0) return null;
  const scored = issues
    .filter((i) => i.status !== "done" && i.status !== "cancelled")
    .map((i) => {
      const live = liveIds.has(i.id) ? 90 : 0;
      const status = URGENCY[i.status] ?? 0;
      const priority = PRIORITY_WEIGHT[i.priority] ?? 0;
      const updatedTs =
        i.updatedAt instanceof Date
          ? i.updatedAt.getTime()
          : new Date(i.updatedAt as unknown as string).getTime();
      const recency = Math.max(0, 20 - (Date.now() - updatedTs) / (1000 * 60 * 60 * 24));
      return { i, score: live + status + priority + recency };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.i ?? null;
}

function kickerFor(issue: Issue, live: boolean): string {
  if (live) return "Breaking · On the wire";
  if (issue.status === "blocked") return "Bulletin · Stuck";
  if (issue.priority === "critical") return "Urgent · Top of the fold";
  if (issue.status === "in_review") return "Under consideration";
  if (issue.status === "in_progress") return "In flight";
  return "Of the day";
}

function deckFor(issue: Issue): string {
  const p =
    issue.priority === "critical"
      ? "A critical matter"
      : issue.priority === "high"
        ? "A high-priority matter"
        : "A matter";
  const s =
    issue.status === "blocked"
      ? "sits blocked at the desk"
      : issue.status === "in_progress"
        ? "is presently in hand"
        : issue.status === "in_review"
          ? "awaits judgement"
          : issue.status === "todo"
            ? "has been filed and awaits a starter"
            : "rests in the backlog";
  return `${p} that ${s}.`;
}

export function LeadStory({ issues, liveIssueIds }: LeadStoryProps) {
  const lead = useMemo(() => pickLead(issues, liveIssueIds), [issues, liveIssueIds]);
  const { selectedCompany } = useCompany();
  if (!lead) return null;

  const isLive = liveIssueIds.has(lead.id);
  const kicker = kickerFor(lead, isLive);
  const deck = deckFor(lead);
  const updatedTs =
    lead.updatedAt instanceof Date
      ? lead.updatedAt
      : new Date(lead.updatedAt as unknown as string);

  // Strip trailing punctuation, clamp length.
  const desc = (lead.description ?? "").trim();
  const bodyRaw = desc.length > 320 ? desc.slice(0, 317) + "…" : desc;
  const firstChar = bodyRaw.charAt(0);
  const rest = bodyRaw.slice(1);

  const href = selectedCompany
    ? `/${selectedCompany.issuePrefix}/issues/${lead.identifier ?? lead.id}`
    : `#`;

  return (
    <article className="gazette-lead">
      {/* Rule + kicker */}
      <header className="gazette-lead-head">
        <span className="gazette-kicker">
          {isLive && <span className="gazette-live-dot gazette-live-dot-lg" />}
          {kicker}
        </span>
        <span className="gazette-lead-meta">
          <span className="gazette-lead-meta-k">{lead.identifier ?? "—"}</span>
          <span className="gazette-lead-meta-sep">/</span>
          <span>{lead.status.replace(/_/g, " ").toUpperCase()}</span>
          <span className="gazette-lead-meta-sep">/</span>
          <span>{lead.priority.toUpperCase()}</span>
        </span>
      </header>

      {/* Headline */}
      <Link to={href} className="gazette-lead-headline-link">
        <h2 className="gazette-lead-headline">
          <span className="gazette-lead-quote" aria-hidden="true">&ldquo;</span>
          {lead.title}
          <span className="gazette-lead-quote" aria-hidden="true">&rdquo;</span>
        </h2>
      </Link>

      {/* Dek */}
      <p className="gazette-lead-deck">{deck}</p>

      {/* Body with dropcap */}
      {bodyRaw && (
        <p className="gazette-lead-body">
          <span aria-hidden="true" className="gazette-dropcap">{firstChar}</span>
          <span>{rest}</span>
        </p>
      )}

      {/* Byline */}
      <footer className="gazette-byline">
        <span className="gazette-byline-rule" />
        <span className="gazette-byline-text">
          Filed <time>{timeAgo(updatedTs)}</time>
        </span>
        <Link to={href} className="gazette-byline-link">
          Read the file →
        </Link>
      </footer>
    </article>
  );
}
