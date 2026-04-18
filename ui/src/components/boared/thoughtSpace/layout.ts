import type { Stream } from "./stream";

/* ─────────────────────────────────────────────────────────────────────
 *  layout — placing thoughts on the stream.
 *
 *  Each thought maps to a stream parameter `u` derived from its
 *  timestamp, then is pushed perpendicular to the stream by `kind`:
 *    · runs     — high above the stream
 *    · comments — above the stream
 *    · issue    — on the stream, at u=0.03 (the source)
 *    · activity — below the stream
 *    · subissue — far below the stream (tributary)
 *
 *  If multiple thoughts of the same kind fall near the same u, we stack
 *  them further out along the perpendicular axis so they don't overlap.
 *  The issue itself always sits at the source of the river.
 * ───────────────────────────────────────────────────────────────────── */

export type ThoughtKind = "issue" | "comment" | "activity" | "subissue" | "run";

export interface Thought {
  id: string;
  kind: ThoughtKind;
  label: string;
  body?: string;
  author: string;      // stable author key ("__issue__"/"__sub__"/"system"/agentId/"unknown")
  authorName: string;
  ts: number;
  isLive?: boolean;
  payload: unknown;
}

export interface LaidNode {
  thought: Thought;
  u: number;
  perp: number;
  tx: number;
  ty: number;
  phase: number;
  radius: number;
  color: string;
  introDelay: number;
}

const RADII: Record<ThoughtKind, number> = {
  issue: 26,
  run: 12,
  subissue: 11,
  comment: 8,
  activity: 6,
};

const BASE_PERP: Record<ThoughtKind, number> = {
  issue: 0,
  run: -150,
  comment: -70,
  activity: 70,
  subissue: 150,
};

export function layoutThoughts(
  thoughts: Thought[],
  stream: Stream,
  nowMs: number,
  colorOf: (authorId: string) => string,
): LaidNode[] {
  const issue = thoughts.find((t) => t.kind === "issue");
  if (!issue) return [];

  // u mapping: issue at 0.03 (near source), `now` at 0.97. A ≥10-minute
  // minimum span keeps brand-new issues from collapsing everything to u=0.
  const t0 = issue.ts;
  const span = Math.max(nowMs - t0, 10 * 60_000);
  const uOf = (ts: number) => {
    const raw = (ts - t0) / span;
    const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    return 0.03 + clamped * 0.94;
  };

  const nodes: LaidNode[] = [];

  // Issue core — always at u=0.03, dead centre of stream.
  const core = stream.offsetFrom(0.03, 0);
  nodes.push({
    thought: issue,
    u: 0.03,
    perp: 0,
    tx: core.x,
    ty: core.y,
    phase: 0,
    radius: RADII.issue,
    color: colorOf("__issue__"),
    introDelay: 0,
  });

  // Sort remainder by timestamp so introDelay staggers chronologically.
  const rest = thoughts
    .filter((t) => t.kind !== "issue")
    .sort((a, b) => a.ts - b.ts);

  // per-kind collision lists
  const placed: Record<string, Array<{ u: number; perp: number }>> = {};

  rest.forEach((t, i) => {
    const u = uOf(t.ts);
    const base = BASE_PERP[t.kind];
    const sign = base === 0 ? 1 : base / Math.abs(base);
    const list = placed[t.kind] ?? (placed[t.kind] = []);
    let level = 0;
    let perp = base;
    while (level < 8) {
      perp = base + sign * level * 26;
      const conflict = list.some(
        (e) => Math.abs(e.u - u) < 0.022 && Math.abs(e.perp - perp) < 22,
      );
      if (!conflict) break;
      level++;
    }
    list.push({ u, perp });
    const pt = stream.offsetFrom(u, perp);
    nodes.push({
      thought: t,
      u,
      perp,
      tx: pt.x,
      ty: pt.y,
      phase: Math.random() * Math.PI * 2,
      radius: RADII[t.kind],
      color: colorOf(t.author),
      introDelay: 90 + i * 9,
    });
  });

  return nodes;
}
