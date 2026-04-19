/**
 * Derive natural "chapters" of an issue's lifecycle from its raw
 * event data. The Dossier uses these as pins on the timeline ribbon
 * and as title cards during replay. Pure, no side-effects.
 *
 * Chapter kinds:
 *   opened       — issue created (always present)
 *   triaged      — first assignment OR first status transition into
 *                  {todo, in_progress, in_review} after opening
 *   investigated — first comment OR first agent run (whichever earlier)
 *   reviewed     — first approval requested
 *   blocked      — the start of the first blocked period (if any)
 *   resolved     — completedAt or cancelledAt (if set)
 *
 * Each chapter returns its `ts` so the Dossier can place its pin on
 * the compressed time axis via timeMap.toX. Deduplicated: if two
 * chapters would collide (e.g. opened and triaged at the same ts),
 * only the earlier-in-the-enum wins.
 */

import type { Issue, IssueComment, ActivityEvent } from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";

export type ChapterKind =
  | "opened"
  | "triaged"
  | "investigated"
  | "reviewed"
  | "blocked"
  | "resolved";

export interface Chapter {
  kind: ChapterKind;
  label: string;
  ts: number;
}

interface Input {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  linkedRuns?: RunForIssue[];
}

const LIVE_RUN = new Set(["queued", "running", "in_progress"]);

export function detectChapters({
  issue,
  comments,
  activity,
  linkedRuns,
}: Input): Chapter[] {
  const out: Chapter[] = [];

  // ── opened ──
  const openedTs = new Date(issue.createdAt).getTime();
  out.push({ kind: "opened", label: "Opened", ts: openedTs });

  // ── triaged ──
  // Earliest of: issue.startedAt, or first activity that's an
  // assignment or status update after opening.
  let triagedTs: number | null = null;
  if (issue.startedAt) {
    triagedTs = new Date(issue.startedAt).getTime();
  }
  for (const ev of activity ?? []) {
    if (ev.action === "issue.assigned" || ev.action === "issue.status_changed") {
      const evTs = new Date(ev.createdAt).getTime();
      if (evTs > openedTs && (triagedTs === null || evTs < triagedTs)) {
        triagedTs = evTs;
      }
    }
  }
  if (triagedTs !== null && triagedTs > openedTs) {
    out.push({ kind: "triaged", label: "Triaged", ts: triagedTs });
  }

  // ── investigated ──
  // Earliest of: first comment, first run.
  let investigatedTs: number | null = null;
  if ((comments ?? []).length > 0) {
    const firstCommentTs = Math.min(
      ...(comments ?? []).map((c) => new Date(c.createdAt).getTime()),
    );
    investigatedTs = firstCommentTs;
  }
  if ((linkedRuns ?? []).length > 0) {
    const firstRunTs = Math.min(
      ...(linkedRuns ?? []).map((r) =>
        new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime(),
      ),
    );
    if (investigatedTs === null || firstRunTs < investigatedTs) {
      investigatedTs = firstRunTs;
    }
  }
  if (investigatedTs !== null && investigatedTs > openedTs + 1) {
    out.push({ kind: "investigated", label: "Investigation", ts: investigatedTs });
  }

  // ── reviewed ──
  let reviewedTs: number | null = null;
  for (const ev of activity ?? []) {
    if (ev.action === "issue.approval_requested" || ev.action === "approval.created") {
      const evTs = new Date(ev.createdAt).getTime();
      if (reviewedTs === null || evTs < reviewedTs) reviewedTs = evTs;
    }
  }
  if (reviewedTs !== null) {
    out.push({ kind: "reviewed", label: "Under review", ts: reviewedTs });
  }

  // ── blocked ──
  let blockedTs: number | null = null;
  for (const ev of activity ?? []) {
    if (ev.action === "issue.status_changed") {
      const details = (ev.details ?? {}) as { to?: string; status?: string };
      if (details.to === "blocked" || details.status === "blocked") {
        const evTs = new Date(ev.createdAt).getTime();
        if (blockedTs === null || evTs < blockedTs) blockedTs = evTs;
      }
    }
  }
  if (blockedTs === null && issue.status === "blocked") {
    // Fallback when status is currently blocked but the transition
    // wasn't logged as an activity event — use issue.updatedAt.
    blockedTs = new Date(issue.updatedAt).getTime();
  }
  if (blockedTs !== null) {
    out.push({ kind: "blocked", label: "Blocked", ts: blockedTs });
  }

  // ── resolved ──
  const resolvedAt = issue.completedAt ?? issue.cancelledAt ?? null;
  if (resolvedAt) {
    out.push({
      kind: "resolved",
      label: issue.status === "cancelled" ? "Cancelled" : "Resolved",
      ts: new Date(resolvedAt).getTime(),
    });
  } else if ((linkedRuns ?? []).some((r) => LIVE_RUN.has(r.status))) {
    // No resolution, but live work in progress — don't add a
    // chapter; the timeline's "now" marker is enough.
  }

  // Dedup near-simultaneous chapters — preserve the earliest-kind
  // winner on collision within 2 min.
  const order: Record<ChapterKind, number> = {
    opened: 0, triaged: 1, investigated: 2, reviewed: 3, blocked: 4, resolved: 5,
  };
  const dedup: Chapter[] = [];
  for (const c of out.sort((a, b) => a.ts - b.ts || order[a.kind] - order[b.kind])) {
    const tooClose = dedup.find((d) => Math.abs(d.ts - c.ts) < 2 * 60 * 1000);
    if (!tooClose) dedup.push(c);
  }
  return dedup;
}
