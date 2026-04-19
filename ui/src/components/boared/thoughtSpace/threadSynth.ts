/**
 * threadSynth — transforms raw issue events into a unified, tagged,
 * chronologically-ordered feed of ThreadEntries for the
 * CaseSummary panel. This is the "processed substance" that makes
 * the Dossier faster to read than scrolling comments.
 *
 * Each entry carries:
 *   · author, timestamp, role tag (opener / decision / approval /
 *     blocker / question / report / note / run / subissue)
 *   · a trimmed quote (first meaningful ~140 chars, markdown-ish
 *     stripped) — so the user reads real content at a glance
 *   · a consequence line ("caused 2 runs", "spawned 1 sub-matter",
 *     "led to approval") computed from downstream timestamps
 *   · thoughtId so the panel can cross-reference the 3D scene
 *
 * Role inference is heuristic keyword matching — not AI. The goal
 * isn't perfect labelling; it's showing that the thread has
 * structure and letting the user SCAN by role when they want to
 * find "the decision" or "the approval" fast.
 */

import type {
  Issue,
  IssueComment,
  ActivityEvent,
  Agent,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";

export type ThreadEntryKind = "comment" | "run" | "subissue";

export type ThreadEntryRole =
  | "opener"
  | "decision"
  | "approval"
  | "blocker"
  | "question"
  | "report"
  | "note"
  | "run"
  | "subissue";

export interface ThreadEntry {
  /** Matches IssueThoughtSpace's internal thought id format so the
   * summary panel and the 3D scene share a single cross-reference
   * (comment:{uuid}, run:{uuid}, subissue:{uuid}). */
  thoughtId: string;
  kind: ThreadEntryKind;
  role: ThreadEntryRole;
  authorId: string | null;
  authorName: string;
  ts: number;
  /** The first meaningful line of text. Markdown stripped, ≤ 180 chars. */
  quote: string;
  /** "caused 2 runs" · "spawned 1 sub-matter" · "led to approval" — or null. */
  consequence: string | null;
  /** Raw entity for callers that need more (currently unused by the
   * summary renderer, but the escape hatch is here). */
  raw: IssueComment | RunForIssue | Issue;
}

export interface Participant {
  id: string;
  name: string;
  role: "reporter" | "investigator" | "reviewer" | "contributor";
  commentCount: number;
  runCount: number;
  approvalCount: number;
}

export interface OpenItems {
  liveRuns: Array<{ runId: string; agentName: string; status: string }>;
  openSubs: Array<{ id: string; identifier: string | null; title: string; status: string }>;
}

export interface ThreadSynthesis {
  entries: ThreadEntry[];
  participants: Participant[];
  openItems: OpenItems;
  /** Short prose summary: 1-2 sentences template-generated. */
  headline: string;
}

interface Input {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
}

const LIVE_RUN_STATUSES = new Set(["queued", "running", "in_progress"]);
const DONE_STATUSES = new Set(["done", "cancelled"]);

/* ──────────────────── Quote extraction ────────────────── */

/** Strip markdown-ish syntax the body might carry and collapse to
 * a first-sentence preview. Not exhaustive; good enough for scan. */
function trimQuote(raw: string, maxChars = 180): string {
  if (!raw) return "";
  let s = raw.trim();
  // Strip code fences (keep the language hint out of the quote)
  s = s.replace(/```[\s\S]*?```/g, "[code]");
  // Strip inline code
  s = s.replace(/`([^`]+)`/g, "$1");
  // Strip image/link tag noise, keep the text
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Strip heading hashes and bullet markers
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  // Strip leading @mentions so quotes don't all start with handles
  s = s.replace(/^(@\w+\s+)+/g, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  if (s.length === 0) return "";
  // Prefer cutting at a sentence boundary if the first one is short
  const firstSentenceMatch = s.match(/^(.{20,200}?[.!?])(\s|$)/);
  if (firstSentenceMatch && firstSentenceMatch[1].length <= maxChars) {
    return firstSentenceMatch[1];
  }
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1).trim() + "…";
}

/* ──────────────────── Role inference ────────────────── */

function isFirstNonSystemComment(c: IssueComment, all: IssueComment[]): boolean {
  const sorted = [...all].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return sorted[0]?.id === c.id;
}

function inferCommentRole(
  c: IssueComment,
  all: IssueComment[],
  body: string,
): ThreadEntryRole {
  if (isFirstNonSystemComment(c, all)) return "opener";
  const low = body.toLowerCase();
  // Approval signals come first — "lgtm" and "approved" are strong.
  if (
    /(^|\s)(lgtm|looks good to me|approved|approve\b|ship it)($|\s)/.test(low) ||
    /\bi\s+approve\b/.test(low)
  ) return "approval";
  // Blocker language
  if (
    /\b(blocked|blocker|can'?t|stuck|won'?t work|broken|failing|fails|error)\b/.test(low)
  ) return "blocker";
  // Decision language
  if (
    /\b(let'?s|we should|i['’]ll|we['’]ll|decided|going with|plan is|proposed)\b/.test(low) ||
    /\bfor\s+now\b/.test(low)
  ) return "decision";
  // Question
  if (body.trim().endsWith("?") || /\?(\s|$)/.test(body.slice(0, 180))) return "question";
  // Report-like language
  if (
    /\b(done|completed|finished|merged|deployed|tested|passed|results?|output)\b/.test(low)
  ) return "report";
  return "note";
}

/* ──────────────────── Participant synth ────────────────── */

function computeParticipants(
  issue: Issue,
  comments: IssueComment[],
  runs: RunForIssue[],
  agentMap: Map<string, Agent>,
): Participant[] {
  const map = new Map<string, Participant>();
  const ensure = (id: string, name: string): Participant => {
    let p = map.get(id);
    if (!p) {
      p = { id, name, role: "contributor", commentCount: 0, runCount: 0, approvalCount: 0 };
      map.set(id, p);
    }
    return p;
  };

  for (const c of comments) {
    const id = c.authorAgentId ?? (c.authorUserId ? `user:${c.authorUserId}` : "unknown");
    const name = c.authorAgentId
      ? agentMap.get(c.authorAgentId)?.name ?? "—"
      : c.authorUserId ?? "—";
    ensure(id, name).commentCount += 1;
  }
  for (const r of runs) {
    const name = agentMap.get(r.agentId)?.name ?? "agent";
    ensure(r.agentId, name).runCount += 1;
  }

  // Role heuristic: the first commenter is "reporter" (usually the
  // person who opened the case). Anyone with runs ≥ 2 or role-type
  // "agent" is "investigator". Anyone whose comments include
  // approval-like language becomes "reviewer" (detected upstream).
  const sorted = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const firstCommenter = sorted[0];
  if (firstCommenter) {
    const firstId = firstCommenter.authorAgentId ??
      (firstCommenter.authorUserId ? `user:${firstCommenter.authorUserId}` : null);
    if (firstId && map.has(firstId)) map.get(firstId)!.role = "reporter";
  }
  for (const p of map.values()) {
    if (p.role === "contributor" && p.runCount >= 1) p.role = "investigator";
  }
  // Light reviewer detection: first comment author that emitted an
  // approval-like role in comments.
  for (const c of comments) {
    const role = inferCommentRole(c, comments, c.body ?? "");
    if (role === "approval") {
      const id = c.authorAgentId ?? (c.authorUserId ? `user:${c.authorUserId}` : "unknown");
      const p = map.get(id);
      if (p) {
        p.role = "reviewer";
        p.approvalCount += 1;
      }
    }
  }

  // Sort participants: reporter first, then reviewers, then investigators,
  // then plain contributors. Within a tier, most-active first.
  const roleRank: Record<Participant["role"], number> = {
    reporter: 0, reviewer: 1, investigator: 2, contributor: 3,
  };
  return [...map.values()].sort((a, b) => {
    const rr = roleRank[a.role] - roleRank[b.role];
    if (rr !== 0) return rr;
    return (b.commentCount + b.runCount) - (a.commentCount + a.runCount);
  });
}

/* ──────────────────── Open items ────────────────── */

function computeOpenItems(
  runs: RunForIssue[],
  subs: Issue[],
  agentMap: Map<string, Agent>,
): OpenItems {
  const liveRuns = runs
    .filter((r) => LIVE_RUN_STATUSES.has(r.status))
    .map((r) => ({
      runId: r.runId,
      agentName: agentMap.get(r.agentId)?.name ?? "agent",
      status: r.status,
    }));
  const openSubs = subs
    .filter((s) => !DONE_STATUSES.has(s.status))
    .map((s) => ({
      id: s.id,
      identifier: s.identifier,
      title: s.title,
      status: s.status,
    }));
  return { liveRuns, openSubs };
}

/* ──────────────────── Headline synth ────────────────── */

function synthesiseHeadline(
  issue: Issue,
  comments: IssueComment[],
  runs: RunForIssue[],
  subs: Issue[],
  participants: Participant[],
): string {
  const n = comments.length + runs.length + subs.length;
  const days = Math.max(0, Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
  const ageStr = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  const agentNames = participants.filter((p) => p.runCount >= 1).map((p) => p.name);
  const reviewers = participants.filter((p) => p.role === "reviewer").map((p) => p.name);
  const reporter = participants.find((p) => p.role === "reporter");
  const status = issue.status.replace(/_/g, " ");

  const parts: string[] = [];
  parts.push(`Opened ${ageStr}${reporter ? ` by ${reporter.name}` : ""}.`);
  if (agentNames.length > 0) {
    parts.push(
      `${agentNames.slice(0, 2).join(" and ")}${agentNames.length > 2 ? ` (+${agentNames.length - 2} more)` : ""} worked it across ${runs.length} run${runs.length === 1 ? "" : "s"}.`,
    );
  }
  if (reviewers.length > 0) {
    parts.push(`${reviewers.slice(0, 2).join(", ")} reviewed.`);
  }
  if (DONE_STATUSES.has(issue.status)) {
    parts.push(`Resolved.`);
  } else if (issue.status === "blocked") {
    parts.push(`Currently blocked.`);
  } else {
    const openSubs = subs.filter((s) => !DONE_STATUSES.has(s.status)).length;
    const liveRunCount = runs.filter((r) => LIVE_RUN_STATUSES.has(r.status)).length;
    if (liveRunCount > 0) parts.push(`${liveRunCount} run${liveRunCount === 1 ? "" : "s"} live right now.`);
    else if (openSubs > 0) parts.push(`${openSubs} open sub-matter${openSubs === 1 ? "" : "s"} still pending.`);
    else parts.push(`Status: ${status}.`);
  }
  const out = parts.join(" ");
  // Unused n kept for future tuning; silence the lint.
  void n;
  return out;
}

/* ──────────────────── Entries + consequences ────────────────── */

function consequenceFor(
  entry: { ts: number; authorId: string | null; thoughtId: string; kind: ThreadEntryKind },
  comments: IssueComment[],
  runs: RunForIssue[],
  subs: Issue[],
): string | null {
  // For a comment: count runs/subs that started shortly after, or
  // by the same author within 15 min.
  if (entry.kind === "comment") {
    const startWindow = entry.ts;
    const endWindow = entry.ts + 15 * 60 * 1000;
    const runsAfter = runs.filter((r) => {
      const rTs = new Date(r.startedAt ?? r.createdAt ?? 0).getTime();
      return rTs > startWindow && rTs <= endWindow;
    }).length;
    const subsAfter = subs.filter((s) => {
      const sTs = new Date(s.createdAt).getTime();
      return sTs > startWindow && sTs <= endWindow;
    }).length;
    const parts: string[] = [];
    if (runsAfter > 0) parts.push(`caused ${runsAfter} run${runsAfter === 1 ? "" : "s"}`);
    if (subsAfter > 0) parts.push(`spawned ${subsAfter} sub-matter${subsAfter === 1 ? "" : "s"}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (entry.kind === "run") {
    const r = runs.find((rr) => rr.runId === entry.thoughtId.slice("run:".length));
    if (!r) return null;
    const status = r.status;
    if (LIVE_RUN_STATUSES.has(status)) return "live now";
    if (r.finishedAt) return "finished";
    return status;
  }
  if (entry.kind === "subissue") {
    const s = subs.find((ss) => `subissue:${ss.id}` === entry.thoughtId);
    if (!s) return null;
    return DONE_STATUSES.has(s.status) ? `closed · ${s.status}` : `open · ${s.status.replace(/_/g, " ")}`;
  }
  return null;
}

/* ──────────────────── Public entry-point ────────────────── */

export function synthesiseThread(input: Input): ThreadSynthesis {
  const { issue, comments = [], linkedRuns = [], childIssues = [], agentMap } = input;

  const entries: ThreadEntry[] = [];

  // Comments
  for (const c of comments) {
    const id = c.authorAgentId ?? (c.authorUserId ? `user:${c.authorUserId}` : null);
    const name = c.authorAgentId
      ? agentMap.get(c.authorAgentId)?.name ?? "—"
      : c.authorUserId ?? "—";
    const body = c.body ?? "";
    const role = inferCommentRole(c, comments, body);
    entries.push({
      thoughtId: `comment:${c.id}`,
      kind: "comment",
      role,
      authorId: id,
      authorName: name,
      ts: new Date(c.createdAt).getTime(),
      quote: trimQuote(body),
      consequence: null,
      raw: c,
    });
  }

  // Runs
  for (const r of linkedRuns) {
    const name = agentMap.get(r.agentId)?.name ?? "agent";
    const verb = LIVE_RUN_STATUSES.has(r.status)
      ? "is working on a run"
      : r.status === "done"
        ? "finished a run"
        : `${r.status.replace(/_/g, " ")} a run`;
    entries.push({
      thoughtId: `run:${r.runId}`,
      kind: "run",
      role: "run",
      authorId: r.agentId,
      authorName: name,
      ts: new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime(),
      quote: `${name} ${verb}.`,
      consequence: null,
      raw: r,
    });
  }

  // Sub-matters
  for (const s of childIssues) {
    entries.push({
      thoughtId: `subissue:${s.id}`,
      kind: "subissue",
      role: "subissue",
      authorId: s.createdByAgentId ?? (s.createdByUserId ? `user:${s.createdByUserId}` : null),
      authorName: s.createdByAgentId
        ? agentMap.get(s.createdByAgentId)?.name ?? "—"
        : s.createdByUserId ?? "—",
      ts: new Date(s.createdAt).getTime(),
      quote: `Sub-matter filed: ${s.identifier ?? s.id.slice(0, 6)} · ${s.title}`,
      consequence: null,
      raw: s,
    });
  }

  // Sort ascending by ts
  entries.sort((a, b) => a.ts - b.ts);

  // Compute consequences (needs the sorted list to find "shortly after")
  for (const e of entries) {
    e.consequence = consequenceFor(e, comments, linkedRuns, childIssues);
  }

  const participants = computeParticipants(issue, comments, linkedRuns, agentMap);
  const openItems = computeOpenItems(linkedRuns, childIssues, agentMap);
  const headline = synthesiseHeadline(issue, comments, linkedRuns, childIssues, participants);

  return { entries, participants, openItems, headline };
}
