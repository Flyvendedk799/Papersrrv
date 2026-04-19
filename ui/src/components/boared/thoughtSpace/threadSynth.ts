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
  /** When this entry is a comment replying to another, the parent
   * comment's thoughtId. Lets the summary render one level of
   * threading. */
  replyToThoughtId: string | null;
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
 * a first-sentence preview. The heuristic prefers a sentence that
 * ends within 120–220 chars; otherwise falls back to a 160-char cut
 * with ellipsis. Aggressively strips headings / bullets / blockquote
 * chevrons / code fences / numbered-list markers. */
function trimQuote(raw: string, maxChars = 160): string {
  if (!raw) return "";
  let s = raw.trim();
  // Strip code fences (keep the language hint out of the quote)
  s = s.replace(/```[\s\S]*?```/g, "[code]");
  // Strip inline code
  s = s.replace(/`([^`]+)`/g, "$1");
  // Strip image/link tag noise, keep the text
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Strip heading hashes, bullet markers, numbered-list markers, blockquote chevrons
  s = s.replace(/^\s*#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+[.)]\s+/gm, "");
  s = s.replace(/^\s*>+\s?/gm, "");
  // Strip leading @mentions so quotes don't all start with handles
  s = s.replace(/^(@[\w-]+\s+)+/g, "");
  // Drop emphasis markers but keep the text
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2");
  s = s.replace(/(\*|_)(.+?)\1/g, "$2");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  if (s.length === 0) return "";
  // Prefer a sentence that ends within the sweet spot 120–220 chars;
  // this gives the reader a complete clause most of the time.
  const sweetSpot = s.match(/^(.{120,220}?[.!?])(\s|$)/);
  if (sweetSpot) return sweetSpot[1];
  // Otherwise accept a shorter sentence if it lands under maxChars.
  const shortSentence = s.match(/^(.{20,}?[.!?])(\s|$)/);
  if (shortSentence && shortSentence[1].length <= maxChars) return shortSentence[1];
  if (s.length <= maxChars) return s;
  // Fall back: cut at a word boundary near maxChars.
  const cut = s.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars - 30 ? cut.slice(0, lastSpace) : cut).trim() + "…";
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
  const now = Date.now();
  const createdAt = new Date(issue.createdAt).getTime();
  const days = Math.max(0, Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)));
  const ageStr = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  const liveRunCount = runs.filter((r) => LIVE_RUN_STATUSES.has(r.status)).length;
  const totalEvents = comments.length + runs.length + subs.length;
  const reporter = participants.find((p) => p.role === "reporter");
  const reviewerNames = participants.filter((p) => p.role === "reviewer").map((p) => p.name);
  const lastActivityTs = Math.max(
    createdAt,
    ...comments.map((c) => new Date(c.createdAt).getTime()),
    ...runs.map((r) => new Date(r.startedAt ?? r.createdAt ?? 0).getTime()),
  );
  const staleDays = Math.max(0, Math.floor((now - lastActivityTs) / (24 * 60 * 60 * 1000)));

  /* Branch on case shape. Each branch yields at most two sentences.
   * The first is about identity + age; the second is about the
   * current signal (resolution, live, stall, review, quiet). */
  const opener = reporter
    ? `Opened ${ageStr} by ${reporter.name}.`
    : `Opened ${ageStr}.`;

  if (DONE_STATUSES.has(issue.status)) {
    if (issue.status === "cancelled") return `${opener} Cancelled.`;
    if (days === 0) return `${opener} Resolved the same day.`;
    return `${opener} Resolved after ${days} ${days === 1 ? "day" : "days"}.`;
  }

  if (issue.status === "blocked") {
    return `${opener} Stuck — needs a human to step in.`;
  }

  if (liveRunCount > 0) {
    const names = runs
      .filter((r) => LIVE_RUN_STATUSES.has(r.status))
      .map((r) => participants.find((p) => p.id === r.agentId)?.name)
      .filter(Boolean)
      .slice(0, 1);
    const who = names[0] ? `${names[0]} is` : liveRunCount === 1 ? "An agent is" : `${liveRunCount} agents are`;
    return `${opener} ${who} working on it right now.`;
  }

  if (totalEvents === 0) {
    return `${opener} Nothing else yet.`;
  }

  if (staleDays >= 3) {
    return `${opener} Nothing's happened for ${staleDays} ${staleDays === 1 ? "day" : "days"}.`;
  }

  if (reviewerNames.length > 0) {
    return `${opener} ${reviewerNames.slice(0, 2).join(", ")} reviewed.`;
  }

  if (runs.length > 0) {
    const agentCount = new Set(runs.map((r) => r.agentId)).size;
    return `${opener} ${agentCount} ${agentCount === 1 ? "agent" : "agents"} across ${runs.length} ${runs.length === 1 ? "run" : "runs"}.`;
  }

  return `${opener} ${comments.length} ${comments.length === 1 ? "message" : "messages"} in the thread.`;
}

/* ──────────────────── Entries + consequences ────────────────── */

/** Find approval-request activity events (approval.created /
 * approval.requested) within a short window after `ts`. Returns the
 * count. When the approval schema isn't surfaced to the activity log
 * in a given deployment this is simply 0. */
function approvalRequestsAfter(
  ts: number,
  activity: ActivityEvent[],
  windowMs: number,
): number {
  const end = ts + windowMs;
  let n = 0;
  for (const e of activity) {
    const t = new Date(e.createdAt).getTime();
    if (t <= ts || t > end) continue;
    if (e.action === "approval.created" || e.action === "approval.requested") n++;
  }
  return n;
}

function consequenceFor(
  entry: { ts: number; authorId: string | null; thoughtId: string; kind: ThreadEntryKind },
  comments: IssueComment[],
  runs: RunForIssue[],
  subs: Issue[],
  activity: ActivityEvent[],
): string | null {
  // For a comment: count runs / subs / approval-requests that
  // landed shortly after. 10 min window — tighter than before to
  // reduce spurious attributions. Order the parts so the strongest
  // signal appears first.
  if (entry.kind === "comment") {
    const startWindow = entry.ts;
    const windowMs = 10 * 60 * 1000;
    const endWindow = entry.ts + windowMs;
    const runsAfter = runs.filter((r) => {
      const rTs = new Date(r.startedAt ?? r.createdAt ?? 0).getTime();
      return rTs > startWindow && rTs <= endWindow;
    }).length;
    const subsAfter = subs.filter((s) => {
      const sTs = new Date(s.createdAt).getTime();
      return sTs > startWindow && sTs <= endWindow;
    }).length;
    const approvalsAfter = approvalRequestsAfter(entry.ts, activity, windowMs);
    const parts: string[] = [];
    if (approvalsAfter > 0) parts.push(`led to ${approvalsAfter > 1 ? `${approvalsAfter} approvals` : "approval"}`);
    if (runsAfter > 0) parts.push(`caused ${runsAfter} run${runsAfter === 1 ? "" : "s"}`);
    if (subsAfter > 0) parts.push(`spawned ${subsAfter} related case${subsAfter === 1 ? "" : "s"}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (entry.kind === "run") {
    const r = runs.find((rr) => rr.runId === entry.thoughtId.slice("run:".length));
    if (!r) return null;
    const rTs = new Date(r.startedAt ?? r.createdAt ?? 0).getTime();
    const approvalsAfter = approvalRequestsAfter(rTs, activity, 10 * 60 * 1000);
    const parts: string[] = [];
    const status = r.status;
    if (LIVE_RUN_STATUSES.has(status)) parts.push("live now");
    else if (r.finishedAt) parts.push("finished");
    else parts.push(status);
    if (approvalsAfter > 0) parts.push(`led to ${approvalsAfter > 1 ? `${approvalsAfter} approvals` : "approval"}`);
    return parts.join(" · ");
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
  const {
    issue,
    comments = [],
    activity = [],
    linkedRuns = [],
    childIssues = [],
    agentMap,
  } = input;

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
      replyToThoughtId: c.replyToCommentId ? `comment:${c.replyToCommentId}` : null,
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
      replyToThoughtId: null,
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
      quote: `Related case filed: ${s.identifier ?? s.id.slice(0, 6)} · ${s.title}`,
      consequence: null,
      replyToThoughtId: null,
      raw: s,
    });
  }

  // Sort ascending by ts
  entries.sort((a, b) => a.ts - b.ts);

  // Compute consequences (needs the sorted list to find "shortly after")
  for (const e of entries) {
    e.consequence = consequenceFor(e, comments, linkedRuns, childIssues, activity);
  }

  const participants = computeParticipants(issue, comments, linkedRuns, agentMap);
  const openItems = computeOpenItems(linkedRuns, childIssues, agentMap);
  const headline = synthesiseHeadline(issue, comments, linkedRuns, childIssues, participants);

  return { entries, participants, openItems, headline };
}
