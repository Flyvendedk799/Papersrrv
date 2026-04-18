/* ─────────────────────────────────────────────────────────────────────
 *  useLens — question-driven highlighting for the Deliberation Sphere.
 *
 *  Each lens maps to a SceneFilters set, a highlight-id set, a caption,
 *  and (optionally) a named camera pose. Parent component passes the
 *  resulting sets to <Synapses highlightIds=...>, the filter pills, and
 *  the camera choreographer.
 *
 *  Keys:
 *    · "free"     — no lens; everything visible
 *    · "blocking" — pending approvals + blocked children
 *    · "who"      — live runs and their agent's full contribution
 *    · "recent"   — the last 5 activity events
 *    · "story"    — hands off to the existing TourPlayer
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useMemo, useState } from "react";
import type { IssueGraph } from "../data/types";
import type { CameraPoseKey } from "../scene/cinematography";

export type LensKey = "free" | "blocking" | "who" | "recent" | "story";

export interface LensResult {
  lens: LensKey;
  setLens: (l: LensKey) => void;
  /** Node ids that are currently highlighted. Empty set = no lens active. */
  highlightedIds: Set<string>;
  /** Short caption to show above or below the scene. */
  caption: string | null;
  /** Named camera pose to fly to (or null to keep current). */
  cameraPose: CameraPoseKey | null;
  /** Auto-picked initial lens key based on state urgency. */
  suggestedInitialLens: LensKey;
}

export function useLens(graph: IssueGraph): LensResult {
  const suggestedInitialLens: LensKey = useMemo(() => {
    const liveRuns = graph.runs.filter((r) => r.isLive).length;
    const pending = graph.approvals.filter((a) => a.status === "pending").length;
    if (pending > 0) return "blocking";
    if (liveRuns > 0) return "who";
    return "free";
  }, [graph]);

  const [lens, setLensState] = useState<LensKey>(suggestedInitialLens);

  const setLens = useCallback((l: LensKey) => setLensState(l), []);

  const { highlightedIds, caption, cameraPose } = useMemo(() => {
    const ids = new Set<string>();
    let cap: string | null = null;
    let pose: CameraPoseKey | null = null;

    switch (lens) {
      case "free": {
        return { highlightedIds: ids, caption: null, cameraPose: null };
      }
      case "blocking": {
        const pending = graph.approvals.filter((a) => a.status === "pending");
        for (const a of pending) ids.add(a.id);
        for (const d of graph.descendants) {
          if (d.status === "blocked") ids.add(d.id);
        }
        ids.add(graph.root.id); // so pillar remains bright
        if (pending.length > 0 || ids.size > 1) {
          cap =
            pending.length > 0
              ? `${pending.length} approval${pending.length === 1 ? "" : "s"} awaiting your sign-off`
              : "No approvals pending — nothing blocking.";
        } else {
          cap = "Nothing is blocking this matter.";
        }
        pose = "APPROVALS";
        break;
      }
      case "who": {
        // Agent with the most live runs wins.
        const agentActivity = new Map<string, { name: string; live: number; total: number }>();
        for (const r of graph.runs) {
          const prev = agentActivity.get(r.agentId) ?? {
            name: r.agentName,
            live: 0,
            total: 0,
          };
          prev.total += 1;
          if (r.isLive) prev.live += 1;
          agentActivity.set(r.agentId, prev);
        }
        const ranked = Array.from(agentActivity.entries()).sort(
          (a, b) => b[1].live - a[1].live || b[1].total - a[1].total,
        );
        const [topAgentId, topAgentInfo] = ranked[0] ?? [null, null];
        if (topAgentId && topAgentInfo) {
          for (const r of graph.runs) {
            if (r.agentId === topAgentId) ids.add(r.runId);
          }
          for (const c of graph.comments) {
            if (c.author === topAgentId) ids.add(c.id);
          }
          ids.add(graph.root.id);
          cap = topAgentInfo.live > 0
            ? `${topAgentInfo.name} — ${topAgentInfo.live} run${topAgentInfo.live === 1 ? "" : "s"} live now`
            : `${topAgentInfo.name} — ${topAgentInfo.total} run${topAgentInfo.total === 1 ? "" : "s"} on record`;
        } else {
          cap = "No agents have worked on this matter yet.";
        }
        pose = "RUNS";
        break;
      }
      case "recent": {
        const recent = [...graph.rawActivity]
          .sort((a, b) => {
            const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string).getTime();
            const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string).getTime();
            return tb - ta;
          })
          .slice(0, 5);
        for (const e of recent) ids.add(e.id);
        // Also the most-recent comment and run in the UI graph.
        const latestComment = graph.comments[graph.comments.length - 1];
        if (latestComment) ids.add(latestComment.id);
        const latestRun = graph.runs[graph.runs.length - 1];
        if (latestRun) ids.add(latestRun.runId);
        ids.add(graph.root.id);
        cap = recent.length > 0
          ? `Last ${recent.length} change${recent.length === 1 ? "" : "s"}`
          : "No recent changes.";
        pose = "OVERVIEW";
        break;
      }
      case "story": {
        // Hands off to the tour; no highlight set needed.
        cap = "Playing the case story…";
        pose = "OVERVIEW";
        break;
      }
    }
    return { highlightedIds: ids, caption: cap, cameraPose: pose };
  }, [lens, graph]);

  return {
    lens,
    setLens,
    highlightedIds,
    caption,
    cameraPose,
    suggestedInitialLens,
  };
}
