/**
 * buildNeurolayerCase — convert the issue-page props bundle into the
 * `CASE` payload that ui/public/neurolayer/{mindspace.js, ui.js} expect.
 *
 * The neurolayer engine is an untyped vanilla-JS 3D scene that reads a
 * single immutable blob containing:
 *
 *   - thoughts[]       normalized from issue + comments + runs + subissues
 *                      + activity, each tagged with surface kind + semantic
 *                      intent (delegation / decision / block / retry / …)
 *   - parents/children causal DAG (explicit fields first, 30-min time
 *                      proximity fallback for orphans)
 *   - depth            BFS from root
 *   - critical         acid-highlighted path from root → terminal approval
 *   - agents/users + agentMap/userMap   roster, keyed by id
 *   - rawIssue / comments / activity / runs / childIssues (pass-through)
 *   - palette          scene tokens (BG/WARM/WARM_DIM/ACID)
 *
 * The algorithm mirrors `public/neurolayer/case-data.js` exactly so the
 * injected and demo payloads render the same. When the demo changes,
 * port the delta here.
 */

import type {
  ActivityEvent,
  Agent,
  Issue,
  IssueComment,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";

/* ───────────────────────── Types (match the demo) ───────────────────────── */

export type NeurolayerThoughtKind =
  | "issue"
  | "comment"
  | "run"
  | "subissue"
  | "activity";

export type NeurolayerSemantic =
  | "root"
  | "thinking"
  | "delegation"
  | "decision"
  | "block"
  | "retry"
  | "complete";

export interface NeurolayerThought {
  id: string;
  kind: NeurolayerThoughtKind;
  label: string;
  body: string | null;
  author: string;
  authorName: string;
  hue: number;
  isAgent?: boolean;
  ts: number;
  isLive: boolean;
  status?: string;
  semantic: NeurolayerSemantic;
  payload?: Record<string, unknown>;
  ref: unknown;
}

export interface NeurolayerAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  adapterType: string;
  hue: number;
}

export interface NeurolayerUser {
  id: string;
  name: string;
  hue: number;
}

export interface NeurolayerCase {
  caseId: string;
  title: string;
  subtitle: string | null;
  rootId: string;
  thoughts: NeurolayerThought[];
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  depth: Map<string, number>;
  critical: Set<string>;
  agents: NeurolayerAgent[];
  users: NeurolayerUser[];
  agentMap: Map<string, NeurolayerAgent>;
  userMap: Map<string, NeurolayerUser>;
  rawIssue: Issue;
  comments: IssueComment[];
  activity: ActivityEvent[];
  runs: RunForIssue[];
  childIssues: Issue[];
  palette: { BG: string; WARM: string; WARM_DIM: string; ACID: string };
}

/* ───────────────────────── Public API ───────────────────────── */

export interface BuildNeurolayerCaseInput {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  /** Optional user roster; keyed by userId. Defaults to a single
   * placeholder so `authorInfo` for user-authored thoughts still
   * resolves to a stable name + hue. */
  users?: NeurolayerUser[];
}

export function buildNeurolayerCase(input: BuildNeurolayerCaseInput): NeurolayerCase {
  const issue = input.issue;
  const comments = input.comments ?? [];
  const activity = input.activity ?? [];
  const childIssues = input.childIssues ?? [];
  const runs = input.linkedRuns ?? [];
  const users = input.users ?? [];

  /* Derive a stable hue per agent id so two runs of the same agent
   * keep the same color, without requiring the Agent type to carry
   * a hue field (our real Agents don't; the demo's do). */
  const agents: NeurolayerAgent[] = Array.from(input.agentMap.values()).map((a) => ({
    id: a.id,
    name: a.name,
    role: String(a.role),
    status: String(a.status),
    adapterType: String(a.adapterType),
    hue: hueFromKey(a.id),
  }));
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  /* ────────── authorInfo ────────── */
  const authorInfo = (
    authorAgentId: string | null,
    authorUserId: string | null,
    actorType?: string,
    actorId?: string,
  ): { authorId: string; authorName: string; isAgent: boolean; hue: number } => {
    if (authorAgentId) {
      const a = agentMap.get(authorAgentId);
      return {
        authorId: authorAgentId,
        authorName: a?.name ?? "Agent",
        isAgent: true,
        hue: a?.hue ?? 200,
      };
    }
    if (authorUserId) {
      const u = userMap.get(authorUserId);
      return {
        authorId: authorUserId,
        authorName: u?.name ?? "User",
        isAgent: false,
        hue: u?.hue ?? hueFromKey(authorUserId),
      };
    }
    if (actorType === "agent" && actorId) {
      const a = agentMap.get(actorId);
      return {
        authorId: actorId,
        authorName: a?.name ?? "Agent",
        isAgent: true,
        hue: a?.hue ?? 200,
      };
    }
    if (actorType === "user" && actorId) {
      const u = userMap.get(actorId);
      return {
        authorId: actorId,
        authorName: u?.name ?? "User",
        isAgent: false,
        hue: u?.hue ?? hueFromKey(actorId),
      };
    }
    return { authorId: "system", authorName: "System", isAgent: false, hue: 0 };
  };

  /* ────────── build thoughts ────────── */
  const thoughts: NeurolayerThought[] = [];

  thoughts.push({
    id: `issue:${issue.id}`,
    kind: "issue",
    label: `${issue.identifier ?? issue.id.slice(0, 8)} · ${issue.title}`,
    body: issue.description,
    author: "system",
    authorName: "Root",
    hue: 42,
    ts: new Date(issue.createdAt).getTime(),
    isLive: false,
    semantic: "root",
    ref: issue,
  });

  for (const c of comments) {
    const info = authorInfo(c.authorAgentId, c.authorUserId);
    thoughts.push({
      id: `comment:${c.id}`,
      kind: "comment",
      label: truncate(c.body, 90),
      body: c.body,
      author: info.authorId,
      authorName: info.authorName,
      hue: info.hue,
      isAgent: info.isAgent,
      ts: new Date(c.createdAt).getTime(),
      isLive: false,
      semantic: "thinking",
      payload: { id: c.id, replyToCommentId: c.replyToCommentId ?? null },
      ref: c,
    });
  }

  for (const r of runs) {
    const a = agentMap.get(r.agentId);
    thoughts.push({
      id: `run:${r.runId}`,
      kind: "run",
      label: `${a?.name ?? "Agent"} · run ${r.runId.slice(-3)}`,
      body: `Run ${r.runId} · status: ${r.status} · source: ${r.invocationSource}`,
      author: r.agentId,
      authorName: a?.name ?? "Agent",
      hue: a?.hue ?? 200,
      isAgent: true,
      ts: new Date(r.startedAt ?? r.createdAt).getTime(),
      isLive: r.status === "running" || r.status === "queued",
      status: r.status,
      semantic: "thinking",
      payload: {
        triggeredByCommentId: r.triggeredByCommentId ?? null,
        triggeredByActivityId: r.triggeredByActivityId ?? null,
      },
      ref: r,
    });
  }

  for (const s of childIssues) {
    const a = s.assigneeAgentId ? agentMap.get(s.assigneeAgentId) : undefined;
    thoughts.push({
      id: `subissue:${s.id}`,
      kind: "subissue",
      label: `${s.identifier ?? s.id.slice(0, 8)} · ${s.title}`,
      body: `${s.title} — ${s.status} · priority ${s.priority}`,
      author: s.assigneeAgentId ?? "system",
      authorName: a?.name ?? "Unassigned",
      hue: a?.hue ?? 42,
      isAgent: !!s.assigneeAgentId,
      ts: new Date(s.createdAt).getTime(),
      isLive: s.status === "in_progress",
      status: String(s.status),
      semantic: "delegation",
      payload: {
        createdFromCommentId: s.createdFromCommentId ?? null,
        createdFromRunId: s.createdFromRunId ?? null,
      },
      ref: s,
    });
  }

  for (const a of activity) {
    const info = authorInfo(null, null, a.actorType, a.actorId);
    thoughts.push({
      id: `activity:${a.id}`,
      kind: "activity",
      label: (a.action ?? "").replace(/\./g, " → "),
      body: `${info.authorName} · ${a.action} · ${a.entityType}:${a.entityId}`,
      author: info.authorId,
      authorName: info.authorName,
      hue: info.hue,
      isAgent: info.isAgent,
      ts: new Date(a.createdAt).getTime(),
      isLive: false,
      semantic: "thinking",
      payload: {
        runId: a.runId ?? null,
        triggeredByCommentId: a.triggeredByCommentId ?? null,
      },
      ref: a,
    });
  }

  thoughts.sort((a, b) => a.ts - b.ts);

  /* ────────── semantic intent (comments scanned by keyword; others by shape) ────────── */
  const DELEGATION_WORDS =
    /\b(delegat|assign|take (point|the lead)|hand(ing)? off|pass(ing)? to|over to you|please (own|handle|pick up)|can you (own|take|handle)|you own this|own the|spawning|spinning up|i'?ll delegate)\b/i;
  const DECISION_WORDS =
    /\b(decision|approved|let'?s go with|we'?ll go with|final (call|answer)|chose|chosen|picking|i'?ll pick|selected|go with|ship it)\b/i;
  const BLOCK_WORDS =
    /\b(block(ed|ing)?|stuck|fail(ed|ure)|error|can'?t|cannot|stall|flag(ged)?|defender|rejected|denied|timeout)\b/i;
  const RETRY_WORDS = /\b(retry|re-?run|re-?try|another (pass|attempt)|trying again|let me try|take two|v2)\b/i;
  const COMPLETE_WORDS =
    /\b(done|complete[d]?|ship(p|)ed|shipped|resolve[d]?|merged|finish(ed)?|landed|delivered|deployed|live now|out the door)\b/i;

  for (const t of thoughts) {
    const text = (t.body ?? "") + " " + t.label;
    if (t.kind === "issue") {
      t.semantic = "root";
    } else if (t.kind === "activity") {
      const act = (t.ref as ActivityEvent | undefined)?.action ?? "";
      if (/approved|resolved|merged/.test(act)) t.semantic = "complete";
      else if (/assigned|delegated/.test(act)) t.semantic = "delegation";
      else if (/failed|blocked|rejected/.test(act)) t.semantic = "block";
      else if (/retry|rerun/.test(act)) t.semantic = "retry";
      else t.semantic = "thinking";
    } else if (t.kind === "run") {
      if (t.status === "failed") t.semantic = "block";
      else if (t.status === "succeeded") t.semantic = "complete";
      else t.semantic = "thinking";
    } else if (t.kind === "subissue") {
      t.semantic = "delegation";
    } else if (t.kind === "comment") {
      if (DECISION_WORDS.test(text)) t.semantic = "decision";
      else if (BLOCK_WORDS.test(text)) t.semantic = "block";
      else if (RETRY_WORDS.test(text)) t.semantic = "retry";
      else if (DELEGATION_WORDS.test(text)) t.semantic = "delegation";
      else if (COMPLETE_WORDS.test(text)) t.semantic = "complete";
      else t.semantic = "thinking";
    }
  }

  /* ────────── causal graph ────────── */
  const byId = new Map(thoughts.map((t) => [t.id, t]));
  const parents = new Map<string, string[]>(thoughts.map((t) => [t.id, []]));
  const ROOT = `issue:${issue.id}`;

  const addParent = (childId: string, parentId: string) => {
    if (!byId.has(childId) || !byId.has(parentId) || childId === parentId) return;
    const arr = parents.get(childId)!;
    if (!arr.includes(parentId)) arr.push(parentId);
  };

  // Pass 1 — explicit edges.
  for (const t of thoughts) {
    const p = t.payload as Record<string, string | null> | undefined;
    if (!p) continue;
    if (t.kind === "comment") {
      if (p.replyToCommentId) addParent(t.id, `comment:${p.replyToCommentId}`);
    } else if (t.kind === "run") {
      if (p.triggeredByCommentId) addParent(t.id, `comment:${p.triggeredByCommentId}`);
      if (p.triggeredByActivityId) addParent(t.id, `activity:${p.triggeredByActivityId}`);
    } else if (t.kind === "subissue") {
      if (p.createdFromCommentId) addParent(t.id, `comment:${p.createdFromCommentId}`);
      if (p.createdFromRunId) addParent(t.id, `run:${p.createdFromRunId}`);
    } else if (t.kind === "activity") {
      if (p.runId) addParent(t.id, `run:${p.runId}`);
      if (p.triggeredByCommentId) addParent(t.id, `comment:${p.triggeredByCommentId}`);
    }
  }

  // Pass 2 — fallback attachment for orphans (30-min proximity, same author preferred).
  const THIRTY_MIN = 30 * 60_000;
  for (const t of thoughts) {
    if (t.id === ROOT) continue;
    if ((parents.get(t.id) ?? []).length) continue;
    let best: NeurolayerThought | null = null;
    let bestDt = THIRTY_MIN + 1;
    for (const other of thoughts) {
      if (other.id === t.id || other.ts >= t.ts) continue;
      const dt = t.ts - other.ts;
      if (dt > THIRTY_MIN) continue;
      if (
        other.author === t.author ||
        other.kind === "comment" ||
        other.kind === "issue"
      ) {
        if (dt < bestDt) {
          best = other;
          bestDt = dt;
        }
      }
    }
    addParent(t.id, best ? best.id : ROOT);
  }

  // children + BFS depth.
  const children = new Map<string, string[]>(thoughts.map((t) => [t.id, []]));
  for (const t of thoughts) {
    for (const p of parents.get(t.id) ?? []) {
      children.get(p)!.push(t.id);
    }
  }

  const depth = new Map<string, number>();
  depth.set(ROOT, 0);
  const queue: string[] = [ROOT];
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const ch of children.get(id) ?? []) {
      if (!depth.has(ch) || depth.get(ch)! > d + 1) {
        depth.set(ch, d + 1);
        queue.push(ch);
      }
    }
  }
  for (const t of thoughts) if (!depth.has(t.id)) depth.set(t.id, 1);

  // Critical path — root → latest "approved" activity.
  const critical = new Set<string>();
  const approved = thoughts.find(
    (t) => t.kind === "activity" && /(approved|resolved|merged)/.test(
      (t.ref as ActivityEvent | undefined)?.action ?? "",
    ),
  );
  if (approved) {
    let cur = approved.id;
    critical.add(cur);
    while (cur !== ROOT) {
      const ps = parents.get(cur) ?? [];
      if (!ps.length) break;
      // Earliest parent = most direct line back to root.
      ps.sort((a, b) => (byId.get(a)?.ts ?? 0) - (byId.get(b)?.ts ?? 0));
      cur = ps[0];
      critical.add(cur);
    }
  }

  return {
    caseId: issue.identifier ?? issue.id.slice(0, 8),
    title: issue.title,
    subtitle: issue.description,
    rootId: ROOT,
    thoughts,
    parents,
    children,
    depth,
    critical,
    agents,
    users,
    agentMap,
    userMap,
    rawIssue: issue,
    comments,
    activity,
    runs,
    childIssues,
    palette: { BG: "#1A1815", WARM: "#F2E6C4", WARM_DIM: "#7A6F50", ACID: "#FF6B4A" },
  };
}

/* ───────────────────────── Helpers ───────────────────────── */

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 2) + "…" : s;
}

/* Cheap stable hash → 0..359 hue. Good enough for visual continuity
 * across graph ↔ tiles ↔ avatars without dragging a palette table. */
function hueFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}
