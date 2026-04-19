/**
 * threadFilter — split an issue's comments into real conversation
 * vs automated heartbeat / status reports.
 *
 * Detection is heuristic. Two signals combine:
 *   1. Body matches a heartbeat-report template (markdown heading
 *      with the word "heartbeat", "heartbeat summary", "heartbeat_timer",
 *      etc.). This catches PCM's templated posts which on real data
 *      represent 96%+ of the chatter on busy cases.
 *   2. The comment was triggered by a heartbeat run (has runId and
 *      it was a heartbeat_timer run). Cheap fallback when the body
 *      is short ("PCM heartbeat 0745...").
 *
 * Returned alongside the classification is a list of **bursts** —
 * contiguous runs of heartbeat comments in chronological order. A
 * burst groups 1+ heartbeats between two real messages (or between
 * the top of the thread and the first message, etc.). Each burst
 * carries its span (first → last ts), author list, and the
 * underlying comment ids so a caller can render inline summaries
 * with time context intact.
 *
 * Pure function — no React, easy to unit-test.
 */

import type { IssueComment } from "@paperclipai/shared";

export type ThreadItemKind = "message" | "heartbeat";

/** Match a markdown-heading line that references "heartbeat" somewhere
 * on the first non-empty line. Covers "## PCM Heartbeat Summary",
 * "# CEO heartbeat", "## Update — PCM heartbeat" etc. */
const HEARTBEAT_HEADING_RE = /^\s*#{1,6}\s.*heartbeat/i;

/** Short bodies that still should be classified as heartbeat when
 * they start with a heartbeat keyword. Captures "PCM heartbeat
 * 0745e741: queue 0..." and similar compact status posts. */
const HEARTBEAT_SHORT_RE = /^\s*(?:\w+\s+)?heartbeat[\s:]/i;

export interface ClassifiedComment<T extends IssueComment> {
  comment: T;
  kind: ThreadItemKind;
}

export interface HeartbeatBurst {
  /** Where this burst sits in the chronological sequence. Used so a
   * renderer can inject the burst banner in the right spot without
   * having to merge with the message list. */
  afterCommentId: string | null; // null = burst is at the start of the thread
  beforeCommentId: string | null; // null = burst is at the end
  count: number;
  firstTs: number;
  lastTs: number;
  authorIds: string[];
  commentIds: string[];
}

export interface ClassifiedThread<T extends IssueComment> {
  /** All comments with their classification. Order preserved. */
  classified: ClassifiedComment<T>[];
  /** Real conversation comments only — pass to a normal thread
   * renderer. Preserves chronological order. */
  messages: T[];
  /** Heartbeat-only comments, in order — useful if a "full log"
   * view wants to render them flat. */
  heartbeats: T[];
  /** Bursts grouped against message boundaries for inline markers. */
  bursts: HeartbeatBurst[];
  /** Cheap summary counts. */
  heartbeatCount: number;
  messageCount: number;
}

export function classifyThread<T extends IssueComment>(
  comments: T[],
): ClassifiedThread<T> {
  const classified: ClassifiedComment<T>[] = [];
  for (const c of comments) {
    classified.push({ comment: c, kind: classifyOne(c) });
  }
  const messages = classified
    .filter((c) => c.kind === "message")
    .map((c) => c.comment);
  const heartbeats = classified
    .filter((c) => c.kind === "heartbeat")
    .map((c) => c.comment);

  const bursts = buildBursts(classified);

  return {
    classified,
    messages,
    heartbeats,
    bursts,
    heartbeatCount: heartbeats.length,
    messageCount: messages.length,
  };
}

function classifyOne(comment: IssueComment): ThreadItemKind {
  // Human-authored comments are always real messages, regardless
  // of body content. Prevents a clerk who happens to paste a
  // heartbeat-style summary from being silenced.
  if (!comment.authorAgentId) return "message";
  const body = (comment.body ?? "").trim();
  if (body.length === 0) return "message";
  if (HEARTBEAT_HEADING_RE.test(body)) return "heartbeat";
  if (HEARTBEAT_SHORT_RE.test(body)) return "heartbeat";
  return "message";
}

function buildBursts<T extends IssueComment>(
  classified: ClassifiedComment<T>[],
): HeartbeatBurst[] {
  const bursts: HeartbeatBurst[] = [];
  let run: ClassifiedComment<T>[] = [];
  let lastMessageId: string | null = null;

  const flush = (nextMessageId: string | null) => {
    if (run.length === 0) return;
    const first = run[0].comment;
    const last = run[run.length - 1].comment;
    const authorIds = [
      ...new Set(run.map((r) => r.comment.authorAgentId).filter(Boolean) as string[]),
    ];
    bursts.push({
      afterCommentId: lastMessageId,
      beforeCommentId: nextMessageId,
      count: run.length,
      firstTs: new Date(first.createdAt).getTime(),
      lastTs: new Date(last.createdAt).getTime(),
      authorIds,
      commentIds: run.map((r) => r.comment.id),
    });
    run = [];
  };

  for (const c of classified) {
    if (c.kind === "heartbeat") {
      run.push(c);
    } else {
      flush(c.comment.id);
      lastMessageId = c.comment.id;
    }
  }
  flush(null);

  return bursts;
}

/** Human-readable span ("over 3h", "over 2d") for a burst. */
export function formatBurstSpan(burst: HeartbeatBurst): string {
  const ms = Math.max(0, burst.lastTs - burst.firstTs);
  if (ms < 60_000) return "in seconds";
  if (ms < 60 * 60_000) return `over ${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `over ${Math.round(ms / (60 * 60_000))}h`;
  return `over ${Math.round(ms / (24 * 60 * 60_000))}d`;
}
