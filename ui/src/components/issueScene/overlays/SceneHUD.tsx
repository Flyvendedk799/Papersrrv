/* ─────────────────────────────────────────────────────────────────────
 *  SceneHUD — DOM overlays on top of the R3F canvas.
 *
 *  Provides the user-interaction scaffolding that makes the 3D scene
 *  actually USABLE as an investigative tool:
 *
 *    · StatsStrip   — counts of each layer + status / priority of the
 *                     focal issue so the scope is legible in one glance.
 *    · LayerFilters — toggle pills to show/hide each scene layer.
 *                     Essential for isolating (e.g.) "only show runs".
 *    · AgentSwatch  — bottom-left legend of every agent contributing
 *                     with their signature color. Makes it trivial to
 *                     read who did what in the orbit.
 *
 *  All three pieces are pure DOM and live above the canvas via z-index.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import type { IssueGraph, SceneFilters, SceneLayerKey } from "../data/types";
import { SCENE, statusColor } from "../colors";

/* ─── Stats strip (top) ──────────────────────────────────────────── */

interface StatsStripProps {
  graph: IssueGraph;
}

export function StatsStrip({ graph }: StatsStripProps) {
  const core = statusColor(graph.status);

  return (
    <div
      className="absolute top-5 left-5 right-5 z-10 pointer-events-none flex items-center justify-between gap-4 flex-wrap"
      style={{ color: SCENE.cream }}
    >
      <div className="flex items-center gap-3 font-mono text-[0.54rem] uppercase tracking-[0.22em]">
        <span style={{ color: SCENE.creamDim, opacity: 0.65 }}>
          Case file
        </span>
        <span style={{ color: SCENE.cream }}>
          § {graph.root.identifier ?? graph.root.id.slice(0, 8)}
        </span>
        <StatusDot color={core} />
        <span style={{ color: core }}>
          {graph.status.toUpperCase().replace(/_/g, " ")}
        </span>
        <span style={{ color: SCENE.creamDim, opacity: 0.7 }}>·</span>
        <span style={{ color: SCENE.creamDim }}>
          {graph.priority.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: 8,
        height: 8,
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}

/* ─── Layer filter pills (top-right) ─────────────────────────────── */

const LAYER_META: Array<{
  key: SceneLayerKey;
  label: string;
  color: string;
  countKey: keyof IssueGraph;
}> = [
  { key: "ancestors", label: "Parents", color: "#C4A44A", countKey: "ancestors" },
  { key: "descendants", label: "Sub-matters", color: "#34D399", countKey: "descendants" },
  { key: "runs", label: "Runs", color: "#FB923C", countKey: "runs" },
  { key: "comments", label: "Comments", color: "#60A5FA", countKey: "comments" },
  { key: "events", label: "Activity", color: "#94A3B8", countKey: "events" },
  { key: "approvals", label: "Approvals", color: "#FBBF24", countKey: "approvals" },
  /* Timeline is a layout view, not a node count. Use rawActivity so
   * the pill only appears when there's any activity to narrate. */
  { key: "timeline", label: "Timeline", color: "#F5E9CB", countKey: "rawActivity" },
];

interface LayerFiltersProps {
  graph: IssueGraph;
  filters: SceneFilters;
  onToggle: (key: SceneLayerKey) => void;
  onIsolate: (key: SceneLayerKey) => void;
  onResetAll: () => void;
}

export function LayerFilters({
  graph,
  filters,
  onToggle,
  onIsolate,
  onResetAll,
}: LayerFiltersProps) {
  const anyDisabled = Object.values(filters).some((v) => !v);

  return (
    <div
      className="absolute top-16 right-4 z-10 flex flex-col gap-1 pointer-events-auto"
      style={{ color: SCENE.cream }}
    >
      {LAYER_META.map(({ key, label, color, countKey }) => {
        const arr = graph[countKey];
        const count = Array.isArray(arr) ? arr.length : 0;
        const active = filters[key];
        if (count === 0) return null;
        const title = active
          ? `${label}: ${count}. Click to hide · shift-click to isolate`
          : `${label}: ${count} (hidden). Click to show`;
        return (
          <button
            key={key}
            type="button"
            title={title}
            onClick={(e) => {
              if (e.shiftKey) {
                onIsolate(key);
              } else {
                onToggle(key);
              }
            }}
            className="inline-flex items-center justify-between gap-3 px-2 h-7 font-mono text-[0.52rem] uppercase tracking-[0.18em] border transition-all"
            style={{
              width: 152,
              background: active ? "rgba(20,20,28,0.7)" : "rgba(10,10,14,0.55)",
              borderColor: active ? SCENE.creamDim : "#2a2a33",
              color: active ? SCENE.cream : SCENE.creamDim,
              opacity: active ? 1 : 0.55,
            }}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: active ? color : "transparent",
                  border: active ? "none" : `1px solid ${color}`,
                  boxShadow: active ? `0 0 6px ${color}` : "none",
                }}
              />
              {label}
            </span>
            <span style={{ color: active ? color : SCENE.creamDim, opacity: 0.85 }}>
              {count}
            </span>
          </button>
        );
      })}
      {anyDisabled && (
        <button
          type="button"
          onClick={onResetAll}
          className="mt-1 px-2 h-6 font-mono text-[0.5rem] uppercase tracking-[0.18em] border"
          style={{
            borderColor: SCENE.creamDim,
            color: SCENE.cream,
            background: "rgba(20,20,28,0.7)",
          }}
        >
          ▸ show all
        </button>
      )}
    </div>
  );
}

/* ─── Agent swatch legend (bottom-left) ──────────────────────────── */

interface AgentSwatchProps {
  graph: IssueGraph;
  onHoverAgent?: (agentId: string | null) => void;
}

export function AgentSwatch({ graph, onHoverAgent }: AgentSwatchProps) {
  // Collect unique agents from runs + comments, along with their
  // signature color. Sort by contribution volume descending so the
  // most active agents read first.
  const agents = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number; live: boolean }>();
    for (const r of graph.runs) {
      const entry = map.get(r.agentId) ?? {
        name: r.agentName,
        color: r.color,
        count: 0,
        live: false,
      };
      entry.count++;
      if (r.isLive) entry.live = true;
      map.set(r.agentId, entry);
    }
    for (const c of graph.comments) {
      if (!c.author || c.author === "system") continue;
      const entry = map.get(c.author) ?? {
        name: c.authorName,
        color: c.color,
        count: 0,
        live: false,
      };
      entry.count++;
      map.set(c.author, entry);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [graph.runs, graph.comments]);

  if (agents.length === 0) return null;

  return (
    <div
      className="absolute bottom-4 left-4 z-10 pointer-events-auto max-w-[240px]"
      style={{ color: SCENE.cream }}
    >
      <div
        className="font-mono text-[0.5rem] uppercase tracking-[0.22em] mb-1"
        style={{ color: SCENE.creamDim, opacity: 0.7 }}
      >
        Actors ({agents.length})
      </div>
      <div className="flex flex-col gap-[3px]">
        {agents.map((a) => (
          <div
            key={a.id}
            onMouseEnter={() => onHoverAgent?.(a.id)}
            onMouseLeave={() => onHoverAgent?.(null)}
            className="flex items-center gap-2 font-mono text-[0.56rem] cursor-default"
            style={{ color: SCENE.cream }}
          >
            <span
              className="inline-block rounded-full shrink-0"
              style={{
                width: 8,
                height: 8,
                background: a.color,
                boxShadow: a.live
                  ? `0 0 10px ${a.color}, 0 0 4px ${a.color}`
                  : `0 0 4px ${a.color}`,
  
              }}
            />
            <span className="truncate" style={{ letterSpacing: "0.04em" }}>
              {a.name}
            </span>
            <span
              className="ml-auto tabular-nums"
              style={{ color: SCENE.creamDim, opacity: 0.7 }}
            >
              {a.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Counts strip — compact numbers row below stats ─────────────── */

interface CountsStripProps {
  graph: IssueGraph;
}

export function CountsStrip({ graph }: CountsStripProps) {
  const liveRuns = graph.runs.filter((r) => r.isLive).length;
  const pendingApprovals = graph.approvals.filter((a) => a.status === "pending").length;

  const entries: Array<{ label: string; value: string | number; color: string; highlight?: boolean }> = [
    {
      label: "Parents",
      value: graph.ancestors.length,
      color: "#C4A44A",
    },
    {
      label: "Sub-matters",
      value: graph.descendants.length,
      color: "#34D399",
    },
    {
      label: "Runs",
      value: liveRuns > 0 ? `${graph.runs.length} (${liveRuns} live)` : graph.runs.length,
      color: "#FB923C",
      highlight: liveRuns > 0,
    },
    {
      label: "Comments",
      value: graph.comments.length,
      color: "#60A5FA",
    },
    {
      label: "Activity",
      value: graph.events.length,
      color: "#94A3B8",
    },
  ];
  if (graph.approvals.length > 0) {
    entries.push({
      label: "Approvals",
      value: pendingApprovals > 0 ? `${graph.approvals.length} (${pendingApprovals} pending)` : graph.approvals.length,
      color: "#FBBF24",
      highlight: pendingApprovals > 0,
    });
  }

  return (
    <div
      className="absolute top-12 left-5 z-10 pointer-events-none flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.5rem] uppercase tracking-[0.18em]"
      style={{ color: SCENE.creamDim, maxWidth: "calc(100% - 200px)" }}
    >
      {entries
        .filter((e) => Number(String(e.value).split(" ")[0]) > 0)
        .map((e) => (
          <div key={e.label} className="flex items-center gap-1.5">
            <span
              className={
                e.highlight
                  ? "inline-block rounded-full animate-pulse"
                  : "inline-block rounded-full"
              }
              style={{
                width: 6,
                height: 6,
                background: e.color,
                boxShadow: e.highlight ? `0 0 6px ${e.color}` : undefined,
              }}
            />
            <span style={{ color: e.highlight ? e.color : SCENE.cream }}>
              {e.value}
            </span>
            <span style={{ opacity: 0.65 }}>{e.label}</span>
          </div>
        ))}
    </div>
  );
}
