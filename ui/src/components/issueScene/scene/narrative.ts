/* ─────────────────────────────────────────────────────────────────────
 *  narrative — turn an IssueGraph into prose + signals.
 *
 *  The scene's main storytelling layer is DATA, not visuals. This module
 *  derives everything the overlays render:
 *
 *   · lede        — "Resolved after 5 days." / "Blocked. Open 3 days."
 *   · clauses     — "12 runs · 3 agents", "4 comments", "under § PAP-100"
 *   · chips       — signal badges that appear only when something's UP
 *   · nextAction  — the one CTA the user should consider, or null
 *   · milestones  — chronological pins for the time-spine ribbon
 *   · mentionLinks — comment→descendant pairs for 3D arc rendering
 *
 *  Design rules:
 *   1. Pure. No React, no three.js, no DOM. Deterministic on (graph, issue).
 *   2. Quiet by default. Empty chip list is correct when nothing unusual.
 *   3. Exactly one nextAction or none. Multiple CTAs = no CTA.
 *   4. All numbers formatted human-side. Don't ship Date objects to the UI.
 * ───────────────────────────────────────────────────────────────────── */

import type { Issue, IssueStatus } from "@paperclipai/shared";
import type { IssueGraph } from "../data/types";

/* ─── Types ─────────────────────────────────────────────────────── */

export type ChipTone = "live" | "alert" | "warn" | "info" | "good" | "neutral";

export interface NarrativeChip {
  /** Stable React key. */
  key: string;
  /** Visible label, e.g. "LIVE × 2". Already uppercased / shaped for display. */
  label: string;
  /** Dictates color + whether to apply the pulse animation. */
  tone: ChipTone;
  /** When true the renderer applies a slow scale pulse. */
  pulse?: boolean;
}

/** Discriminator telling the CTA handler what to DO.
 *   - "approvals" → scroll + expand Approvals collapsible + select pending
 *   - "composer"  → scroll to Correspondence + focus comment composer
 *   - "run"       → selectAndFocus newest live run
 */
export type NextActionKind = "approvals" | "composer" | "run";

export interface NarrativeNextAction {
  label: string;
  tone: "primary" | "warn" | "alert";
  kind: NextActionKind;
}

export type MilestoneKind =
  | "created"
  | "firstRun"
  | "firstComment"
  | "lastActivity"
  | "now";

export interface NarrativeMilestone {
  kind: MilestoneKind;
  label: string;
  timestamp: number;
  /** Preformatted "5d ago" / "just now" / "now". */
  agoPhrase: string;
}

export interface NarrativeMentionLink {
  /** Source comment (by id + its orbitAngle, so renderer can position). */
  commentId: string;
  commentAngle: number;
  /** Target descendant identifier + its fan angle. */
  descendantId: string;
  descendantAngle: number;
  /** Stable key for React. */
  key: string;
}

export interface Narrative {
  /** One-line headline. */
  lede: string;
  /** Supporting clauses — short, stackable. */
  clauses: string[];
  /** Signal chips. Ordered by importance. Empty when all is calm. */
  chips: NarrativeChip[];
  /** Primary CTA, or null if none. */
  nextAction: NarrativeNextAction | null;
  /** Chronological pins for the time-spine ribbon. */
  milestones: NarrativeMilestone[];
  /** Comment→descendant relationships to draw as 3D arcs. */
  mentionLinks: NarrativeMentionLink[];
  /** True when graph is essentially empty — used for empty-state styling. */
  isQuiet: boolean;
  /** Plain-English, non-jargon translation. 1–3 short sentences, ≤ 280 chars.
   *  Spoken TO a non-technical Board Operator: replaces "run" with
   *  "an agent's attempt", "in review" with "waiting on approval",
   *  "blocked" with "stuck", etc. Used by the Companion panel. */
  plainEnglish: string;
}

/* ─── Helpers ───────────────────────────────────────────────────── */

const MENTION_RE = /\b([A-Z]{1,8}-\d+)\b/g;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : pluralForm ?? singular + "s";
}

function agoPhrase(deltaMs: number): string {
  if (deltaMs < MINUTE_MS) return "just now";
  if (deltaMs < HOUR_MS) {
    const m = Math.floor(deltaMs / MINUTE_MS);
    return `${m}m ago`;
  }
  if (deltaMs < DAY_MS) {
    const h = Math.floor(deltaMs / HOUR_MS);
    return `${h}h ago`;
  }
  const d = Math.floor(deltaMs / DAY_MS);
  return `${d}d ago`;
}

function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.floor(Math.abs(b - a) / DAY_MS));
}

/* ─── Main ──────────────────────────────────────────────────────── */

export function narrativeFor(graph: IssueGraph, issue: Issue): Narrative {
  const now = Date.now();

  /* Baseline facts */
  const createdAt =
    (issue.createdAt instanceof Date
      ? issue.createdAt.getTime()
      : issue.createdAt
        ? new Date(issue.createdAt as unknown as string).getTime()
        : 0) || now;

  const ageDays = daysBetween(createdAt, now);
  const agentIds = new Set(graph.runs.map((r) => r.agentId));
  const liveRuns = graph.runs.filter((r) => r.isLive).length;

  const pendingApprovals = graph.approvals.filter(
    (a) => a.status === "pending",
  ).length;

  const lastActivity = Math.max(
    createdAt,
    ...graph.comments.map((c) => c.createdAt),
    ...graph.events.map((e) => e.createdAt),
    ...graph.runs.map((r) => r.startedAt),
  );
  const staleMs = Math.max(0, now - lastActivity);
  const staleDays = Math.floor(staleMs / DAY_MS);

  /* Lede — the one sentence at the top of the ledger. */
  const status = issue.status as IssueStatus;
  let lede: string;
  if (status === "done") {
    lede =
      ageDays === 0
        ? "Resolved today."
        : `Resolved after ${ageDays} ${plural(ageDays, "day")}.`;
  } else if (status === "cancelled") {
    lede =
      ageDays === 0
        ? "Cancelled today."
        : `Cancelled after ${ageDays} ${plural(ageDays, "day")}.`;
  } else if (status === "blocked") {
    lede = `Blocked — open ${Math.max(1, ageDays)} ${plural(Math.max(1, ageDays), "day")}.`;
  } else if (liveRuns > 0) {
    lede = `Live — ${liveRuns} ${plural(liveRuns, "run")} in flight.`;
  } else if (ageDays === 0) {
    lede = "Just opened.";
  } else {
    lede = `Open ${ageDays} ${plural(ageDays, "day")}.`;
  }

  /* Clauses — supporting facts, terse. */
  const clauses: string[] = [];
  if (graph.runs.length > 0) {
    clauses.push(
      `${graph.runs.length} ${plural(graph.runs.length, "run")} · ${agentIds.size} ${plural(agentIds.size, "agent")}`,
    );
  }
  if (graph.comments.length > 0) {
    clauses.push(
      `${graph.comments.length} ${plural(graph.comments.length, "comment")}`,
    );
  }
  if (graph.descendants.length > 0) {
    const direct = graph.descendants.filter((d) => d.kind === "direct").length;
    clauses.push(`${direct || graph.descendants.length} ${plural(direct || graph.descendants.length, "subtask")}`);
  }
  if (graph.ancestors.length > 0) {
    const topmost = graph.ancestors[graph.ancestors.length - 1];
    clauses.push(`under § ${topmost.identifier}`);
  }
  if (graph.events.length > 0 && graph.events.length > graph.comments.length) {
    clauses.push(`${graph.events.length} activity events`);
  }

  /* Chips — signal badges. Silence is golden; only emit when relevant. */
  const chips: NarrativeChip[] = [];

  if (liveRuns > 0) {
    chips.push({
      key: "live",
      label: liveRuns === 1 ? "LIVE" : `LIVE × ${liveRuns}`,
      tone: "live",
      pulse: true,
    });
  }
  if (status === "blocked") {
    const d = Math.max(1, ageDays);
    chips.push({
      key: "blocked",
      label: `BLOCKED ${d}D`,
      tone: "alert",
      pulse: true,
    });
  }
  if (pendingApprovals > 0) {
    chips.push({
      key: "pending-approval",
      label:
        pendingApprovals === 1
          ? "AWAITING APPROVAL"
          : `${pendingApprovals} AWAITING APPROVAL`,
      tone: "warn",
    });
  }
  if (
    issue.priority === "critical" &&
    status !== "done" &&
    status !== "cancelled" &&
    status !== "blocked"
  ) {
    // Suppress "critical" chip when we're already showing BLOCKED — would
    // be redundant and busy.
    chips.push({ key: "critical", label: "CRITICAL", tone: "alert" });
  }
  if (
    staleDays >= 3 &&
    status !== "done" &&
    status !== "cancelled" &&
    liveRuns === 0
  ) {
    chips.push({
      key: "stale",
      label: `STALE ${staleDays}D`,
      tone: "warn",
    });
  }
  if (graph.runs.length >= 20) {
    chips.push({
      key: "high-activity",
      label: `${graph.runs.length} RUNS`,
      tone: "info",
    });
  }
  if (status === "done" && ageDays <= 1) {
    chips.push({ key: "fresh-resolution", label: "FRESH RESOLUTION", tone: "good" });
  }
  if (graph.descendants.length >= 8) {
    chips.push({
      key: "wide-subtree",
      label: `${graph.descendants.length} SUBTASKS`,
      tone: "info",
    });
  }

  /* Next action — single opinionated CTA. Priority:
   *   1. Pending approval   (highest — a human must decide)
   *   2. Blocked            (somebody has to unblock)
   *   3. Live runs          (watch them)
   *   4. null               (no action implied)
   *
   * Notably we do NOT surface "add a comment" or similar — those are
   * discovery actions, not story actions, and they belong elsewhere.
   */
  let nextAction: NarrativeNextAction | null = null;
  if (pendingApprovals > 0) {
    nextAction = {
      label:
        pendingApprovals === 1
          ? "Review pending approval"
          : `Review ${pendingApprovals} pending approvals`,
      tone: "warn",
      kind: "approvals",
    };
  } else if (status === "blocked") {
    nextAction = {
      label: "Write a note to unblock",
      tone: "alert",
      kind: "composer",
    };
  } else if (liveRuns > 0) {
    nextAction = {
      label:
        liveRuns === 1
          ? "Watch run in flight"
          : `Watch ${liveRuns} runs in flight`,
      tone: "primary",
      kind: "run",
    };
  } else if (
    staleDays >= 3 &&
    status !== "done" &&
    status !== "cancelled"
  ) {
    nextAction = {
      label: "Nudge the thread",
      tone: "primary",
      kind: "composer",
    };
  }

  /* Milestones — the pins on the time-spine. Each is emitted only if
   * it carries NEW information (e.g. firstComment == created isn't shown).
   */
  const milestones: NarrativeMilestone[] = [];
  milestones.push({
    kind: "created",
    label: "Opened",
    timestamp: createdAt,
    agoPhrase: agoPhrase(now - createdAt),
  });

  if (graph.runs.length > 0) {
    const firstRun = graph.runs.reduce(
      (acc, r) => (r.startedAt < acc ? r.startedAt : acc),
      Number.POSITIVE_INFINITY,
    );
    if (firstRun !== Number.POSITIVE_INFINITY && firstRun > createdAt) {
      milestones.push({
        kind: "firstRun",
        label: "First run",
        timestamp: firstRun,
        agoPhrase: agoPhrase(now - firstRun),
      });
    }
  }

  if (graph.comments.length > 0) {
    const firstComment = graph.comments.reduce(
      (acc, c) => (c.createdAt < acc ? c.createdAt : acc),
      Number.POSITIVE_INFINITY,
    );
    if (firstComment !== Number.POSITIVE_INFINITY && firstComment > createdAt) {
      milestones.push({
        kind: "firstComment",
        label: "Discussion",
        timestamp: firstComment,
        agoPhrase: agoPhrase(now - firstComment),
      });
    }
  }

  if (lastActivity > createdAt) {
    milestones.push({
      kind: "lastActivity",
      label: "Last action",
      timestamp: lastActivity,
      agoPhrase: agoPhrase(now - lastActivity),
    });
  }

  milestones.push({
    kind: "now",
    label: "Now",
    timestamp: now,
    agoPhrase: "now",
  });

  /* MentionLinks — pairs where a comment's body references a
   * descendant's identifier. We cap the total so a discussion full of
   * #XXX-99 references doesn't spawn a mesh explosion. */
  const MAX_LINKS = 12;
  const mentionLinks: NarrativeMentionLink[] = [];
  const descByIdent = new Map<string, (typeof graph.descendants)[number]>();
  for (const d of graph.descendants) {
    if (d.identifier) descByIdent.set(d.identifier, d);
  }
  outer: for (const c of graph.comments) {
    const body = c.payload?.body ?? "";
    if (!body) continue;
    // Reset lastIndex because of the /g flag.
    MENTION_RE.lastIndex = 0;
    const seenForComment = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(body))) {
      const id = m[1];
      if (!id || seenForComment.has(id)) continue;
      seenForComment.add(id);
      const d = descByIdent.get(id);
      if (!d) continue;
      mentionLinks.push({
        commentId: c.id,
        commentAngle: c.orbitAngle,
        descendantId: d.id,
        descendantAngle: d.angle,
        key: `${c.id}→${d.id}`,
      });
      if (mentionLinks.length >= MAX_LINKS) break outer;
    }
  }

  const isQuiet =
    graph.runs.length === 0 &&
    graph.comments.length === 0 &&
    graph.events.length === 0 &&
    graph.descendants.length === 0;

  /* plainEnglish — the non-jargon translation. Picks a state sentence,
   * then appends an activity sentence, then (if applicable) a next-action
   * sentence. Keeps total length under ~280 chars so it fits in the
   * Companion panel without scroll. */
  const plainEnglish = assemblePlainEnglish({
    status,
    ageDays,
    staleDays,
    liveRuns,
    runCount: graph.runs.length,
    agentCount: agentIds.size,
    commentCount: graph.comments.length,
    descendantCount: graph.descendants.length,
    pendingApprovals,
    isQuiet,
  });

  return {
    lede,
    clauses,
    chips,
    nextAction,
    milestones,
    mentionLinks,
    isQuiet,
    plainEnglish,
  };
}

/* ─── plainEnglish assembly ─────────────────────────────────────── */

interface PlainEnglishInputs {
  status: IssueStatus;
  ageDays: number;
  staleDays: number;
  liveRuns: number;
  runCount: number;
  agentCount: number;
  commentCount: number;
  descendantCount: number;
  pendingApprovals: number;
  isQuiet: boolean;
}

function assemblePlainEnglish(i: PlainEnglishInputs): string {
  const parts: string[] = [];

  /* ── Sentence 1: what state, how long ────────────────────────── */
  if (i.status === "done") {
    parts.push(
      i.ageDays === 0
        ? "This one was resolved earlier today."
        : i.ageDays === 1
          ? "This one was resolved yesterday."
          : `This one was resolved ${i.ageDays} days after it was opened.`,
    );
  } else if (i.status === "cancelled") {
    parts.push(
      i.ageDays <= 1
        ? "This one was dropped — it won't be worked on."
        : `This one was dropped after ${i.ageDays} days.`,
    );
  } else if (i.status === "blocked") {
    parts.push(
      i.ageDays <= 1
        ? "This one's stuck — it needs a human to step in before it can continue."
        : `This one's been stuck for ${i.ageDays} days and needs a human to step in.`,
    );
  } else if (i.liveRuns > 0) {
    parts.push(
      i.liveRuns === 1
        ? "An agent is actively working on this right now."
        : `${i.liveRuns} agents are actively working on this right now.`,
    );
  } else if (i.ageDays === 0) {
    parts.push("This one was just opened — no work has started yet.");
  } else {
    parts.push(
      i.ageDays === 1
        ? "This one was opened yesterday."
        : `This one has been open for ${i.ageDays} days.`,
    );
  }

  /* ── Sentence 2: activity summary ─────────────────────────────── */
  if (!i.isQuiet) {
    const bits: string[] = [];
    if (i.runCount > 0) {
      if (i.agentCount === 1) {
        bits.push(
          i.runCount === 1
            ? "One agent has taken a swing at it"
            : `One agent has taken ${i.runCount} swings at it`,
        );
      } else {
        bits.push(
          `${i.agentCount} agents have tried to work on it across ${i.runCount} attempts`,
        );
      }
    }
    if (i.commentCount > 0) {
      bits.push(
        i.commentCount === 1
          ? "there's one message in the thread"
          : `there are ${i.commentCount} messages in the thread`,
      );
    }
    if (i.descendantCount > 0 && bits.length === 0) {
      // Only mention sub-matters here if we haven't already got a run/comment sentence.
      bits.push(
        i.descendantCount === 1
          ? "it's spawned one smaller task"
          : `it's spawned ${i.descendantCount} smaller tasks`,
      );
    }
    if (bits.length > 0) {
      parts.push(cap(bits.join(", and ")) + ".");
    }
  }

  /* ── Sentence 3: next action, if any ─────────────────────────── */
  if (i.pendingApprovals > 0) {
    parts.push(
      i.pendingApprovals === 1
        ? "An agent is asking for your sign-off before continuing."
        : `${i.pendingApprovals} agents are asking for your sign-off.`,
    );
  } else if (i.status === "blocked") {
    parts.push("You'll need to decide what to do next.");
  } else if (
    i.staleDays >= 3 &&
    i.status !== "done" &&
    i.status !== "cancelled" &&
    i.liveRuns === 0
  ) {
    parts.push(
      `Nothing's happened here in ${i.staleDays} days — it may be forgotten.`,
    );
  }

  // Join with single spaces; cap total length.
  let out = parts.join(" ").trim();
  if (out.length > 320) out = out.slice(0, 317).trimEnd() + "…";
  return out;
}

function cap(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
