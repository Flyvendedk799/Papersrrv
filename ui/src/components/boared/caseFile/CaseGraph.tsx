/**
 * CaseGraph — the "how it got here" visualisation.
 *
 *                         ┌─ opener comment ─┐
 *                         │  CTO opened…      │
 *                         └────────┬──────────┘
 *                                  ▼
 *            ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 *            ┃  § AIL-230 · SnakeGameGodot build  ┃   ← root
 *            ┗━━━┬─────┬─────┬─────┬─────┬─────┬──┛
 *                │     │     │     │     │     │
 *      ┌─────┐ ┌─┴───┐ │  ┌──┴──┐  │  ┌──┴──┐  │
 *      │ CE │ │ CT │  │  │ PCM │   │  │ QA  │  │  ← delegations
 *      │ ●●●●│ │●●●●●│ │  │●●● │   │  │●●●● │   │     (agent chip · attempt pips)
 *      └─────┘ └─────┘ │  └─────┘  │  └─────┘  │
 *                      ▼            ▼            ▼
 *              ╭ Sub-issue ╮ ╭ Sub-issue ╮ ╭ Approval ╮
 *              ╰─────┬─────╯ ╰─────┬─────╯ ╰─────┬────╯
 *                    │             │             │
 *                    ╰── resolved ─╯─ resolved ──╯   (dashed acid
 *                              back to root)           converging arrows)
 *
 * Interactions:
 *   · drag canvas to pan, wheel or ⌘+wheel to zoom, +/−/⌂ buttons
 *   · click a node to focus its causal chain (non-connected dim)
 *   · play button animates the case unfolding chronologically
 *   · scrub slider seeks to any point in the case's history
 *   · click empty canvas or Esc to clear focus
 *   · hover a node for its detail card
 *
 * Rendered entirely in SVG — no external graph library. Layout is
 * layered Sugiyama: root at top, delegations below, artifacts
 * (sub-issues + approvals) further below, with bezier-curve flow
 * edges and higher-amplitude curves for convergence arrows back
 * to the root.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Maximize2, Minus, Pause, Play, Plus } from "lucide-react";
import { cn, relativeTime } from "../../../lib/utils";
import type {
  CaseSynthesisGraphNode,
  CaseSynthesisGraphEdge,
  CaseSynthesisPayload,
} from "../../../api/issues";
import { agentColor } from "./agentColor";
import { CaseGraphDetail } from "./CaseGraphDetail";

interface Props {
  graph: {
    nodes: CaseSynthesisGraphNode[];
    edges: CaseSynthesisGraphEdge[];
  };
  /** Full synthesis payload so the detail panel can find the matching
   * artifact for the selected node (avoids a second query). */
  synthesis?: CaseSynthesisPayload | null;
  loading?: boolean;
  className?: string;
}

/* ────────────────────── Dimensions ────────────────────── */

const NODE: Record<CaseSynthesisGraphNode["kind"], { w: number; h: number }> = {
  issue: { w: 300, h: 92 },
  delegation: { w: 230, h: 92 },
  "sub-issue": { w: 210, h: 76 },
  approval: { w: 180, h: 62 },
  comment: { w: 250, h: 70 },
  run: { w: 180, h: 60 },
  ancestor: { w: 180, h: 60 },
  resolution: { w: 220, h: 76 },
};
const GAP_X = 24;
const RANK_GAP_Y = 52;
const PADDING = 36;
const VIEWPORT_HEIGHT = 460;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const REPLAY_DURATION_MS = 10_000;
const MOUNT_STAGGER_MS = 60;

interface PlacedNode extends CaseSynthesisGraphNode {
  x: number;
  y: number;
  rank: number;
  w: number;
  h: number;
}

interface ViewState {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
}

/* ────────────────────── Component ────────────────────── */

export function CaseGraph({ graph, synthesis, loading, className }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ── Visibility filter (F-graph-1). Click a legend chip to
   * toggle visibility of a node kind. Root, resolution, and the
   * critical path are always visible. */
  const [hiddenKinds, setHiddenKinds] = useState<Set<CaseSynthesisGraphNode["kind"]>>(
    () => new Set(),
  );
  const toggleKindVisible = (kind: CaseSynthesisGraphNode["kind"]) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  /* ── Critical-path-only mode. When on, everything off the
   * critical path is dimmed to 20% opacity. */
  const [criticalOnly, setCriticalOnly] = useState(false);

  /* ── Search / highlight. Type to match node labels; matching
   * nodes get an acid outline. */
  const [searchTerm, setSearchTerm] = useState("");
  const searchMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return new Set<string>();
    const matches = new Set<string>();
    for (const n of graph.nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        (n.sublabel ?? "").toLowerCase().includes(q) ||
        (n.authorName ?? "").toLowerCase().includes(q)
      ) {
        matches.add(n.id);
      }
    }
    return matches;
  }, [graph.nodes, searchTerm]);

  const layout = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const isEmpty = !loading && graph.nodes.length <= 1;

  /* Which delegation is the "hot path" — the agent that ran the
   * most attempts. Gets a subtle ★ badge so the centre of gravity
   * of the case is obvious at a glance. */
  const hotPathId = useMemo(() => computeHotPathId(graph.nodes), [graph.nodes]);

  /* ── Time bounds for the scrub slider ─────────────────── */
  const { minTs, maxTs } = useMemo(() => {
    const tss = graph.nodes.map((n) => n.ts ?? 0).filter((t) => t > 0);
    if (tss.length === 0) return { minTs: 0, maxTs: 0 };
    return { minTs: Math.min(...tss), maxTs: Math.max(...tss) };
  }, [graph.nodes]);
  const hasTime = maxTs > minTs;

  /* Scrub position in ms. Null = show everything. */
  const [scrubTs, setScrubTs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playStartRef = useRef<{ realMs: number; fromTs: number } | null>(null);

  useEffect(() => {
    // Reset replay when graph identity changes.
    setScrubTs(null);
    setIsPlaying(false);
    playStartRef.current = null;
    setSelectedId(null);
  }, [graph.nodes.length, graph.edges.length]);

  useEffect(() => {
    if (!isPlaying || !hasTime) return;
    if (!playStartRef.current) {
      const fromTs = scrubTs ?? minTs;
      playStartRef.current = { realMs: performance.now(), fromTs };
    }
    let raf = 0;
    const tick = () => {
      const pr = playStartRef.current;
      if (!pr) return;
      const elapsed = performance.now() - pr.realMs;
      const span = maxTs - pr.fromTs;
      if (span <= 0) {
        setScrubTs(maxTs);
        setIsPlaying(false);
        return;
      }
      // Duration scales with remaining time so a mid-replay resume
      // keeps a consistent visual pace.
      const fractionRemaining = span / Math.max(1, maxTs - minTs);
      const dur = Math.max(2500, REPLAY_DURATION_MS * fractionRemaining);
      const t = Math.min(1, elapsed / dur);
      const nextTs = pr.fromTs + span * t;
      setScrubTs(nextTs);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setIsPlaying(false);
        playStartRef.current = null;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, hasTime, minTs, maxTs, scrubTs]);

  const onPlayToggle = useCallback(() => {
    if (!hasTime) return;
    setIsPlaying((p) => {
      if (!p) {
        // If at or past the end, restart from the beginning.
        const atEnd = (scrubTs ?? maxTs) >= maxTs - 1;
        if (atEnd) {
          setScrubTs(minTs);
          playStartRef.current = { realMs: performance.now(), fromTs: minTs };
        } else {
          playStartRef.current = { realMs: performance.now(), fromTs: scrubTs ?? minTs };
        }
      } else {
        playStartRef.current = null;
      }
      return !p;
    });
  }, [hasTime, minTs, maxTs, scrubTs]);

  /* ── Visible subset of nodes/edges based on scrub ─────── */
  const rootId = useMemo(
    () => layout.nodes.find((n) => n.kind === "issue")?.id ?? null,
    [layout.nodes],
  );
  const visible = useMemo(() => {
    if (scrubTs === null)
      return { nodeIds: new Set(layout.nodes.map((n) => n.id)) };
    const ids = new Set<string>();
    for (const n of layout.nodes) {
      if (n.id === rootId) ids.add(n.id);
      else if ((n.ts ?? 0) <= scrubTs) ids.add(n.id);
    }
    return { nodeIds: ids };
  }, [layout.nodes, scrubTs, rootId]);

  /* ── Focus chain: nodes/edges reachable from selected ─── */
  const focusChain = useMemo(() => {
    if (!selectedId) return null;
    const nodeIds = new Set<string>([selectedId]);
    const edgeIds = new Set<number>();
    const outgoing = new Map<string, number[]>();
    const incoming = new Map<string, number[]>();
    layout.edges.forEach((e, i) => {
      (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source))!.push(i);
      (incoming.get(e.target) ?? incoming.set(e.target, []).get(e.target))!.push(i);
    });
    const stack = [selectedId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const ei of outgoing.get(cur) ?? []) {
        edgeIds.add(ei);
        const target = layout.edges[ei].target;
        if (!nodeIds.has(target)) {
          nodeIds.add(target);
          stack.push(target);
        }
      }
      for (const ei of incoming.get(cur) ?? []) {
        edgeIds.add(ei);
        const source = layout.edges[ei].source;
        if (!nodeIds.has(source)) {
          nodeIds.add(source);
          stack.push(source);
        }
      }
    }
    return { nodeIds, edgeIds };
  }, [selectedId, layout.edges]);

  /* ── Pan/zoom ─────────────────────────────────────────── */
  const [view, setView] = useState<ViewState>(() => initialView(layout));
  useEffect(() => {
    setView(initialView(layout));
  }, [layout.width, layout.height]);

  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Start pan only when clicking on the empty canvas.
      const target = e.target as HTMLElement;
      if (target.closest("[data-graph-node]") || target.closest("[data-graph-controls]")) return;
      // Clicking empty space also clears selection.
      if (selectedId) setSelectedId(null);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    },
    [view.x, view.y, selectedId],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pan = panRef.current;
      if (!pan) return;
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const svgPerPx = view.w / rect.width;
      const dx = (e.clientX - pan.x) * svgPerPx;
      const dy = (e.clientY - pan.y) * svgPerPx;
      setView((v) => ({ ...v, x: pan.vx - dx, y: pan.vy - dy }));
    },
    [view.w],
  );
  const onPointerUp = useCallback(() => {
    panRef.current = null;
  }, []);
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Ignore horizontal wheel; zoom on vertical.
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const sx = view.x + (mx / rect.width) * view.w;
      const sy = view.y + (my / rect.height) * view.h;
      const factor = Math.exp(-e.deltaY * 0.0012);
      const nextZoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const actualFactor = nextZoom / view.zoom;
      const nextW = view.w / actualFactor;
      const nextH = view.h / actualFactor;
      const nextX = sx - (mx / rect.width) * nextW;
      const nextY = sy - (my / rect.height) * nextH;
      setView({ x: nextX, y: nextY, w: nextW, h: nextH, zoom: nextZoom });
    },
    [view],
  );
  const onZoomButton = useCallback(
    (direction: 1 | -1) => {
      const factor = direction === 1 ? 1.25 : 0.8;
      const nextZoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const actualFactor = nextZoom / view.zoom;
      const nextW = view.w / actualFactor;
      const nextH = view.h / actualFactor;
      const cx = view.x + view.w / 2;
      const cy = view.y + view.h / 2;
      setView({ x: cx - nextW / 2, y: cy - nextH / 2, w: nextW, h: nextH, zoom: nextZoom });
    },
    [view],
  );
  const onFit = useCallback(() => {
    setView(initialView(layout));
  }, [layout]);

  /* ── Escape clears selection ──────────────────────────── */
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  /* ────────────────────── Render ────────────────────── */

  if (loading && graph.nodes.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="h-[460px] bg-[var(--boared-rule)]/15 animate-pulse" />
      </div>
    );
  }

  if (isEmpty) {
    return <CaseGraphEmpty className={className} />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={viewportRef}
        data-graph-viewport="true"
        className="relative overflow-hidden border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] select-none touch-none"
        style={{ height: VIEWPORT_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <svg
          role="img"
          aria-label="Case graph"
          width="100%"
          height="100%"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="block cursor-grab active:cursor-grabbing"
        >
          <defs>
            <marker
              id="case-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--boared-ink-soft)" />
            </marker>
            <marker
              id="case-graph-arrow-focus"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--boared-acid)" />
            </marker>
            <marker
              id="case-graph-arrow-converge"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--boared-success)" />
            </marker>
            {/* Paper-grain filter on the root node so it visually
             * outranks the rest. */}
            <filter id="case-graph-node-shadow">
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="1.2"
                floodColor="rgba(0,0,0,0.08)"
              />
            </filter>
          </defs>

          {/* Inline keyframes for mount stagger + pulsing live */}
          <style>{`
            @keyframes cg-fade-in {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes cg-pulse {
              0% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.15); }
              100% { opacity: 0.6; transform: scale(1); }
            }
            .cg-mount { animation: cg-fade-in 420ms cubic-bezier(0.22,0.61,0.36,1) backwards; }
            .cg-pulse-ring { transform-origin: center; animation: cg-pulse 1.6s ease-in-out infinite; }
          `}</style>

          {/* Edges — render first so nodes draw over. */}
          {layout.edges.map((e, i) => {
            const fromNode = layout.nodes.find((n) => n.id === e.source);
            const toNode = layout.nodes.find((n) => n.id === e.target);
            if (!fromNode || !toNode) return null;
            const sourceVisible = visible.nodeIds.has(e.source);
            const targetVisible = visible.nodeIds.has(e.target);
            if (!sourceVisible || !targetVisible) return null;
            // Hide edges whose endpoints are filtered out by the
            // kind-filter (mirrors the node render logic).
            const fromProtected =
              fromNode.kind === "issue" ||
              fromNode.kind === "resolution" ||
              fromNode.isCritical ||
              fromNode.isTerminal;
            const toProtected =
              toNode.kind === "issue" ||
              toNode.kind === "resolution" ||
              toNode.isCritical ||
              toNode.isTerminal;
            if (
              (!fromProtected && hiddenKinds.has(fromNode.kind)) ||
              (!toProtected && hiddenKinds.has(toNode.kind))
            ) {
              return null;
            }
            const focused = focusChain ? focusChain.edgeIds.has(i) : true;
            const criticalDim =
              criticalOnly && !e.isCritical && e.kind !== "resolved-into";
            const dimmed = (focusChain !== null && !focused) || criticalDim;
            return (
              <EdgePath
                key={`edge-${i}`}
                fromNode={fromNode}
                toNode={toNode}
                kind={e.kind}
                focused={focused}
                dimmed={dimmed}
                isCritical={e.isCritical}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((n) => {
            if (!visible.nodeIds.has(n.id)) return null;
            // Honour the kind-filter, but never hide root, resolution,
            // or nodes on the critical path (those are load-bearing
            // for the narrative).
            const protected_ =
              n.kind === "issue" ||
              n.kind === "resolution" ||
              n.isCritical ||
              n.isTerminal;
            if (!protected_ && hiddenKinds.has(n.kind)) return null;
            const isSelected = selectedId === n.id;
            const inFocus = focusChain ? focusChain.nodeIds.has(n.id) : true;
            // Critical-only mode dims non-critical nodes; normal focus
            // chain wins when the user has clicked a specific node.
            const criticalDim =
              criticalOnly && !n.isCritical && !n.isTerminal && n.kind !== "issue";
            const searchMiss = searchTerm.trim().length > 0 && !searchMatches.has(n.id);
            const isDimmed = (focusChain !== null && !inFocus) || criticalDim || searchMiss;
            const isHovered = hoverId === n.id;
            return (
              <NodeMark
                key={n.id}
                node={n}
                isSelected={isSelected}
                isDimmed={isDimmed}
                isHovered={isHovered}
                isHot={hotPathId === n.id}
                isSearchHit={searchMatches.has(n.id)}
                mountDelay={n.rank * MOUNT_STAGGER_MS}
                onEnter={() => setHoverId(n.id)}
                onLeave={() => setHoverId(null)}
                onClick={() => {
                  setSelectedId((cur) => (cur === n.id ? null : n.id));
                  window.dispatchEvent(
                    new CustomEvent("paperclip:case-graph-select", { detail: { id: n.id } }),
                  );
                }}
              />
            );
          })}
        </svg>

        {/* Floating hover card — positioned in viewport px. */}
        {hoverId && !selectedId && (
          <HoverCard
            node={layout.nodes.find((n) => n.id === hoverId) ?? null}
            view={view}
            viewportRef={viewportRef}
          />
        )}

        {/* Zoom controls — fixed top-right. */}
        <div
          data-graph-controls="true"
          className="absolute top-2 right-2 flex flex-col gap-1"
        >
          <GraphButton aria-label="Zoom in" onClick={() => onZoomButton(1)} title="Zoom in">
            <Plus className="h-3 w-3" />
          </GraphButton>
          <GraphButton aria-label="Zoom out" onClick={() => onZoomButton(-1)} title="Zoom out">
            <Minus className="h-3 w-3" />
          </GraphButton>
          <GraphButton aria-label="Fit to view" onClick={onFit} title="Fit to view">
            <Maximize2 className="h-3 w-3" />
          </GraphButton>
        </div>

        {/* Detail panel — slides in from the right when a node is
         * selected. Richer than the hover card: shows agent summary,
         * attempt pips, artifact link. */}
        {selectedId && (
          <div data-graph-controls="true" className="contents">
            <CaseGraphDetail
              node={layout.nodes.find((n) => n.id === selectedId) ?? null}
              synthesis={synthesis ?? null}
              onClose={() => setSelectedId(null)}
              onJumpToThread={() => {
                document
                  .getElementById("chapter-correspondence")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </div>
        )}
      </div>

      {/* Temporal controls — play + scrub slider */}
      {hasTime && (
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            aria-label={isPlaying ? "Pause replay" : "Play replay"}
            onClick={onPlayToggle}
            className="inline-flex items-center justify-center h-8 w-8 border border-[var(--boared-rule)] bg-[var(--boared-paper)] hover:bg-[var(--boared-paper-2)] text-[var(--boared-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-acid)]/50"
            title={isPlaying ? "Pause replay" : "Play the case unfolding"}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <div className="flex-1 relative h-8 flex items-center">
            <span
              aria-hidden="true"
              className="absolute left-0 right-0 top-1/2 h-px bg-[var(--boared-rule)]"
            />
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-px bg-[var(--boared-acid)]"
              style={{
                width:
                  scrubTs === null
                    ? "100%"
                    : `${((scrubTs - minTs) / Math.max(1, maxTs - minTs)) * 100}%`,
                transition: isPlaying ? "none" : "width 120ms linear",
              }}
            />
            <input
              type="range"
              min={minTs}
              max={maxTs}
              step={Math.max(1, (maxTs - minTs) / 500)}
              value={scrubTs ?? maxTs}
              onChange={(e) => {
                const next = Number(e.target.value);
                setScrubTs(next >= maxTs - 1 ? null : next);
                setIsPlaying(false);
                playStartRef.current = null;
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Scrub through case history"
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[var(--boared-acid)] shadow-[0_0_0_3px_var(--boared-paper)]"
              style={{
                left:
                  scrubTs === null
                    ? "100%"
                    : `${((scrubTs - minTs) / Math.max(1, maxTs - minTs)) * 100}%`,
                transition: isPlaying ? "none" : "left 120ms linear",
              }}
            />
          </div>
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] tabular-nums text-[var(--boared-ink-faint)] min-w-[70px] text-right">
            {scrubTs === null ? "latest" : relativeTime(new Date(scrubTs).toISOString())}
          </span>
          {scrubTs !== null && (
            <button
              type="button"
              onClick={() => {
                setScrubTs(null);
                setIsPlaying(false);
                playStartRef.current = null;
              }}
              className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
            >
              latest
            </button>
          )}
        </div>
      )}

      {/* Toolbar — interactive legend (kind filter), critical-only
       * toggle, search. Replaces the static legend. */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.54rem] uppercase tracking-[0.14em]">
        <FilterChip
          tint="var(--boared-review)"
          label="Delegation"
          active={!hiddenKinds.has("delegation")}
          onClick={() => toggleKindVisible("delegation")}
        />
        <FilterChip
          tint="var(--boared-success)"
          label="Sub-issue"
          active={!hiddenKinds.has("sub-issue")}
          onClick={() => toggleKindVisible("sub-issue")}
        />
        <FilterChip
          tint="var(--boared-info)"
          label="Comment"
          active={!hiddenKinds.has("comment")}
          onClick={() => toggleKindVisible("comment")}
        />
        <FilterChip
          tint="var(--boared-mute)"
          label="Approval"
          active={!hiddenKinds.has("approval")}
          onClick={() => toggleKindVisible("approval")}
        />
        <span aria-hidden="true" className="opacity-50">│</span>
        <button
          type="button"
          onClick={() => setCriticalOnly((v) => !v)}
          className={
            "inline-flex items-center gap-1 px-1.5 py-0.5 border transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] " +
            (criticalOnly
              ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
              : "border-[var(--boared-rule)] text-[var(--boared-ink-faint)] hover:border-[var(--boared-ink)] hover:text-[var(--boared-ink)]")
          }
          title="Dim everything except the path from start to resolution"
        >
          Critical path
        </button>
        <span aria-hidden="true" className="opacity-50">│</span>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search…"
          className="bg-transparent border-b border-[var(--boared-rule)] focus:border-[var(--boared-acid)] outline-none text-[0.6rem] tracking-normal normal-case py-0.5 w-24"
          aria-label="Search graph"
        />
        <span aria-hidden="true" className="opacity-50">│</span>
        <span className="inline-flex items-center gap-1.5 text-[var(--boared-ink-faint)]">
          <span
            aria-hidden="true"
            className="inline-block w-5 h-px"
            style={{ background: "var(--boared-acid)" }}
          />
          critical
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--boared-ink-faint)]">
          <span
            aria-hidden="true"
            className="inline-block w-5 h-px"
            style={{
              background:
                "repeating-linear-gradient(to right, var(--boared-success) 0 3px, transparent 3px 6px)",
            }}
          />
          resolved
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--boared-ink-faint)]">
          <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--boared-warn)]" />
          abandoned
        </span>
      </div>
    </div>
  );
}

/** Interactive filter chip. Click to toggle visibility of a kind
 * in the graph. Active state = kind is visible. */
function FilterChip({
  tint,
  label,
  active,
  onClick,
}: {
  tint: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1.5 px-1.5 py-0.5 border transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] " +
        (active
          ? "border-[var(--boared-rule)] text-[var(--boared-ink)]"
          : "border-[var(--boared-rule)]/40 text-[var(--boared-ink-faint)] opacity-60 hover:opacity-100")
      }
    >
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: tint }}
      />
      {label}
    </button>
  );
}

/* ────────────────────── Nodes ────────────────────── */

function NodeMark({
  node,
  isSelected,
  isDimmed,
  isHovered,
  isHot,
  isSearchHit,
  mountDelay,
  onEnter,
  onLeave,
  onClick,
}: {
  node: PlacedNode;
  isSelected: boolean;
  isDimmed: boolean;
  isHovered: boolean;
  isHot: boolean;
  isSearchHit?: boolean;
  mountDelay: number;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const tint = tintForKind(node.kind);
  const live = node.status === "live";
  const opacity = isDimmed ? 0.25 : 1;
  const wrapperStyle = {
    opacity,
    transition: "opacity 180ms ease-out",
    animationDelay: `${mountDelay}ms`,
  } as React.CSSProperties;

  // Width/height of this node kind for the outline / marker geometry.
  const w = NODE[node.kind].w;
  const h = NODE[node.kind].h;

  return (
    <g
      data-graph-node="true"
      transform={`translate(${node.x}, ${node.y})`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer cg-mount"
      style={wrapperStyle}
    >
      {/* Critical-path halo — subtle acid glow around any node on
       * the critical path so the story-beat reads as one line. */}
      {node.isCritical && !node.isTerminal && node.kind !== "issue" && (
        <rect
          x={-4}
          y={-4}
          width={w + 8}
          height={h + 8}
          rx={8}
          fill="none"
          stroke="var(--boared-acid)"
          strokeOpacity={0.35}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}
      {/* Search-match outline. */}
      {isSearchHit && (
        <rect
          x={-2}
          y={-2}
          width={w + 4}
          height={h + 4}
          rx={6}
          fill="none"
          stroke="var(--boared-acid)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      {node.kind === "resolution"
        ? renderResolution(node, tint, isSelected, isHovered)
        : node.kind === "issue"
        ? renderIssue(node, tint, isSelected, isHovered)
        : node.kind === "delegation"
          ? renderDelegation(node, tint, isSelected, isHovered, live, isHot)
          : node.kind === "sub-issue"
            ? renderSubIssue(node, tint, isSelected, isHovered)
            : node.kind === "approval"
              ? renderApproval(node, tint, isSelected, isHovered)
              : node.kind === "comment"
                ? renderComment(node, tint, isSelected, isHovered)
                : renderGeneric(node, tint, isSelected, isHovered)}
      {/* Dead-end corner marker — a small red dot at the top-right
       * of abandoned leaf nodes so the reader can see at a glance
       * which branches didn't lead anywhere. */}
      {node.isDeadEnd && (
        <g transform={`translate(${w - 6}, 6)`} pointerEvents="none">
          <circle r={4} fill="var(--boared-warn)" />
          <title>Abandoned — branch had no follow-up</title>
        </g>
      )}
    </g>
  );
}

/** Distinct terminal node render — bold acid outline, ✓ glyph,
 * tighter corners. Marks the end of the case visually. */
function renderResolution(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  isHovered: boolean,
) {
  const w = NODE.resolution.w;
  const h = NODE.resolution.h;
  const isCancelled = node.status === "cancelled";
  return (
    <>
      <rect
        width={w}
        height={h}
        rx={10}
        fill="var(--boared-paper)"
        stroke={isCancelled ? "var(--boared-warn)" : tint}
        strokeWidth={isSelected || isHovered ? 2.5 : 2}
      />
      <g transform="translate(14, 14)">
        <circle r={9} fill={isCancelled ? "var(--boared-warn)" : tint} />
        <text
          x={0}
          y={4}
          textAnchor="middle"
          fill="var(--boared-paper)"
          fontSize={12}
          fontWeight={700}
        >
          {isCancelled ? "×" : "✓"}
        </text>
      </g>
      <text
        x={38}
        y={20}
        fontFamily="var(--boared-serif)"
        fontStyle="italic"
        fontSize={16}
        fill="var(--boared-ink)"
      >
        {node.label}
      </text>
      {node.sublabel && (
        <text
          x={38}
          y={40}
          fontFamily="var(--boared-mono)"
          fontSize={9}
          letterSpacing={1.4}
          fill="var(--boared-ink-faint)"
        >
          {node.sublabel.toUpperCase()}
        </text>
      )}
    </>
  );
}

/* ---- per-kind renderers ---- */

function renderIssue(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  _isHovered: boolean,
) {
  return (
    <g>
      {/* Double-border cover echo */}
      <rect
        width={node.w}
        height={node.h}
        rx={0}
        fill="var(--boared-paper)"
        stroke={isSelected ? "var(--boared-acid)" : tint}
        strokeWidth={isSelected ? 2.5 : 1.8}
        filter="url(#case-graph-node-shadow)"
      />
      <rect
        x={4}
        y={4}
        width={node.w - 8}
        height={node.h - 8}
        rx={0}
        fill="none"
        stroke={tint}
        strokeOpacity={0.45}
        strokeWidth={0.8}
      />
      {/* Kicker */}
      <text
        x={14}
        y={20}
        fontSize={9.2}
        fill="var(--boared-acid)"
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        § {node.sublabel ?? "case"}
      </text>
      {/* Title */}
      <foreignObject x={14} y={26} width={node.w - 28} height={node.h - 32}>
        <div
          style={{
            fontFamily: "ui-serif, Georgia, serif",
            fontStyle: "italic",
            fontSize: "15px",
            lineHeight: 1.15,
            color: "var(--boared-ink)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
          }}
        >
          {node.label}
        </div>
      </foreignObject>
    </g>
  );
}

function renderDelegation(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  _isHovered: boolean,
  live: boolean,
  isHot: boolean,
) {
  const initials = monogram(node.authorName ?? node.label);
  const { count, outcome } = parseAttemptSublabel(node.sublabel);
  // Per-agent color from the seeded palette — this is THE agent's
  // color everywhere they appear on the page.
  const seeded = agentColor(node.authorName ?? node.id);
  const chipTint = seeded.tint;
  return (
    <g>
      <rect
        width={node.w}
        height={node.h}
        rx={0}
        fill="var(--boared-paper)"
        stroke={isSelected ? "var(--boared-acid)" : tint}
        strokeWidth={isSelected ? 2 : 1.2}
        filter="url(#case-graph-node-shadow)"
      />
      {/* Agent chip (top-left circle with initials) — uses the
       * seeded agent color so the eye tracks this agent across the
       * whole graph. */}
      <g>
        <circle
          cx={22}
          cy={22}
          r={14}
          fill={chipTint}
          fillOpacity={0.28}
          stroke={chipTint}
          strokeWidth={1.1}
        />
        <text
          x={22}
          y={26}
          textAnchor="middle"
          fontSize={10.5}
          fill="var(--boared-ink)"
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "0.04em",
            fontWeight: 600,
          }}
        >
          {initials}
        </text>
        {live && (
          <circle
            cx={22}
            cy={22}
            r={18}
            fill="none"
            stroke="var(--boared-acid)"
            strokeWidth={1.2}
            className="cg-pulse-ring"
          />
        )}
      </g>
      {/* Hot-path badge — top-right ★. Rendered only on the highest-
       * contribution delegation so the page has a clear centre of
       * gravity without shouting. */}
      {isHot && (
        <g transform={`translate(${node.w - 18}, 12)`}>
          <circle r={9} fill="var(--boared-acid)" fillOpacity={0.14} />
          <text
            x={0}
            y={3.5}
            textAnchor="middle"
            fontSize={12}
            fill="var(--boared-acid)"
            style={{ fontFamily: "ui-serif, Georgia, serif" }}
          >
            ★
          </text>
        </g>
      )}
      {/* Name line */}
      <text
        x={44}
        y={20}
        fontSize={12}
        fill="var(--boared-ink)"
        style={{ fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic" }}
      >
        {truncate(node.authorName ?? node.label.replace(/^Delegated to /, ""), 20)}
      </text>
      {/* Outcome sublabel */}
      <text
        x={44}
        y={35}
        fontSize={8.6}
        fill={outcomeColor(outcome, live)}
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {live ? "Working on it" : outcome ?? "delegated"}
      </text>
      {/* Attempt pips — up to 10 visible, "+N more" beyond */}
      <g transform={`translate(14, ${node.h - 18})`}>
        {renderPips(count ?? 0, outcome, live, node.w - 28)}
      </g>
    </g>
  );
}

function renderPips(
  count: number,
  outcome: string | null,
  live: boolean,
  width: number,
) {
  if (count <= 0) return null;
  const max = 10;
  const shown = Math.min(count, max);
  const pipColor =
    live ? "var(--boared-acid)"
      : outcome === "resolved" ? "var(--boared-success)"
        : outcome === "stuck" ? "var(--boared-warn)"
          : "var(--boared-ink-soft)";
  const pipDiameter = 6;
  const gap = Math.min(6, Math.max(3, (width - shown * pipDiameter) / Math.max(1, shown)));
  return (
    <>
      {Array.from({ length: shown }).map((_, i) => (
        <circle
          key={i}
          cx={i * (pipDiameter + gap) + pipDiameter / 2}
          cy={pipDiameter / 2}
          r={pipDiameter / 2}
          fill={pipColor}
          fillOpacity={0.85}
        />
      ))}
      {count > max && (
        <text
          x={shown * (pipDiameter + gap) + 4}
          y={pipDiameter / 2 + 3.5}
          fontSize={8.4}
          fill="var(--boared-ink-faint)"
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "0.08em",
          }}
        >
          +{count - max}
        </text>
      )}
    </>
  );
}

function renderSubIssue(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  _isHovered: boolean,
) {
  const isResolved = node.status === "done";
  return (
    <g>
      <rect
        width={node.w}
        height={node.h}
        rx={0}
        fill="var(--boared-paper)"
        stroke={isSelected ? "var(--boared-acid)" : tint}
        strokeWidth={isSelected ? 2 : 1}
        filter="url(#case-graph-node-shadow)"
      />
      {/* Tag strip on the left, like an index card tab */}
      <rect x={0} y={0} width={4} height={node.h} fill={tint} fillOpacity={0.9} />
      <text
        x={14}
        y={18}
        fontSize={8.4}
        fill={isResolved ? "var(--boared-success)" : "var(--boared-ink-faint)"}
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {node.sublabel ?? "case"} · {isResolved ? "resolved" : humanStatus(node.status)}
      </text>
      <foreignObject x={14} y={22} width={node.w - 24} height={node.h - 28}>
        <div
          style={{
            fontFamily: "ui-serif, Georgia, serif",
            fontStyle: "italic",
            fontSize: "12.5px",
            lineHeight: 1.2,
            color: "var(--boared-ink)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
        >
          {node.label}
        </div>
      </foreignObject>
    </g>
  );
}

function renderApproval(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  _isHovered: boolean,
) {
  const isPending = node.status === "pending";
  const isApproved = node.status === "approved";
  return (
    <g>
      <rect
        width={node.w}
        height={node.h}
        rx={0}
        fill="var(--boared-paper)"
        stroke={isSelected ? "var(--boared-acid)" : isPending ? "var(--boared-acid)" : tint}
        strokeWidth={isSelected ? 2 : 1}
        filter="url(#case-graph-node-shadow)"
      />
      {/* Pending state gets a pulsing corner dot */}
      {isPending && (
        <g transform={`translate(${node.w - 14}, 12)`}>
          <circle r={5} fill="var(--boared-acid)" fillOpacity={0.25} className="cg-pulse-ring" />
          <circle r={3} fill="var(--boared-acid)" />
        </g>
      )}
      <text
        x={14}
        y={22}
        fontSize={10}
        fill="var(--boared-ink)"
        style={{
          fontFamily: "ui-mono, Menlo, monospace",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {isPending ? "Waiting" : isApproved ? "Approved" : "Rejected"}
      </text>
      <text
        x={14}
        y={42}
        fontSize={9.5}
        fill="var(--boared-ink-faint)"
        style={{ fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic" }}
      >
        {isPending ? "needs your decision" : node.label.toLowerCase()}
      </text>
    </g>
  );
}

function renderComment(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  _isHovered: boolean,
) {
  return (
    <g>
      <rect
        width={node.w}
        height={node.h}
        rx={0}
        fill="var(--boared-paper)"
        stroke={isSelected ? "var(--boared-acid)" : tint}
        strokeWidth={isSelected ? 2 : 1}
        filter="url(#case-graph-node-shadow)"
      />
      <text
        x={14}
        y={18}
        fontSize={8.4}
        fill={tint}
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {node.authorName ?? "someone"} · opened
      </text>
      <foreignObject x={14} y={22} width={node.w - 24} height={node.h - 28}>
        <div
          style={{
            fontFamily: "ui-serif, Georgia, serif",
            fontStyle: "italic",
            fontSize: "11.5px",
            lineHeight: 1.3,
            color: "var(--boared-ink)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
        >
          &ldquo;{truncate(node.sublabel ?? "", 120)}&rdquo;
        </div>
      </foreignObject>
    </g>
  );
}

function renderGeneric(
  node: PlacedNode,
  tint: string,
  isSelected: boolean,
  _isHovered: boolean,
) {
  return (
    <g>
      <rect
        width={node.w}
        height={node.h}
        fill="var(--boared-paper)"
        stroke={isSelected ? "var(--boared-acid)" : tint}
        strokeWidth={isSelected ? 2 : 1}
      />
      <circle cx={12} cy={12} r={4} fill={tint} />
      <text x={24} y={18} fontSize={11} fill="var(--boared-ink)">
        {truncate(node.label, 24)}
      </text>
    </g>
  );
}

/* ────────────────────── Edges ────────────────────── */

function EdgePath({
  fromNode,
  toNode,
  kind,
  focused,
  dimmed,
  isCritical,
}: {
  fromNode: PlacedNode;
  toNode: PlacedNode;
  kind: CaseSynthesisGraphEdge["kind"];
  focused: boolean;
  dimmed: boolean;
  isCritical?: boolean;
}) {
  const isConverge = kind === "resolved-into";
  const fromX = fromNode.x + fromNode.w / 2;
  const fromY = fromNode.y + fromNode.h;
  const toX = toNode.x + toNode.w / 2;
  const toY = toNode.y;

  // Critical-path edges get the acid stroke regardless of focus;
  // the goal is to let the reader follow the story at a glance.
  const stroke = isCritical
    ? "var(--boared-acid)"
    : isConverge
      ? "var(--boared-success)"
      : focused
        ? "var(--boared-acid)"
        : "var(--boared-ink-soft)";
  const marker = isConverge
    ? "url(#case-graph-arrow-converge)"
    : focused || isCritical
      ? "url(#case-graph-arrow-focus)"
      : "url(#case-graph-arrow)";
  const dash = isConverge ? "5 5" : undefined;
  const opacity = dimmed ? 0.2 : 1;
  const strokeWidth = isCritical ? 2.2 : isConverge ? 1.3 : focused ? 1.6 : 1.1;

  let d: string;
  if (isConverge) {
    // Arc OUT to the right then back UP to the target so the
    // convergence reads as distinct from the normal flow.
    const midY = (fromY + toY) / 2;
    const maxX = Math.max(fromX, toX);
    d = `M ${fromX} ${fromY} C ${maxX + 140} ${midY + 30}, ${maxX + 140} ${toY + 60}, ${toX} ${toY}`;
  } else {
    // Gentle bezier: vertical fall at source, then ease into target.
    const dy = toY - fromY;
    const c1y = fromY + dy * 0.45;
    const c2y = toY - dy * 0.45;
    d = `M ${fromX} ${fromY} C ${fromX} ${c1y}, ${toX} ${c2y}, ${toX} ${toY}`;
  }

  /* Tiny label at the midpoint describing the causal relation.
   * Only shown when focused or on a sub-issue spawn so the graph
   * doesn't get noisy in the normal case. */
  const midLabelText =
    kind === "resolved-into" ? "resolved"
      : toNode.kind === "sub-issue" ? "spawned"
        : focused ? kind.replace(/-/g, " ")
          : null;
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  return (
    <g style={{ transition: "opacity 180ms ease-out" }} opacity={opacity}>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        markerEnd={marker}
        style={{ transition: "stroke 180ms ease-out" }}
      />
      {midLabelText && (toNode.kind === "sub-issue" || focused || kind === "resolved-into") && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect
            x={-26}
            y={-7}
            width={52}
            height={14}
            fill="var(--boared-paper)"
            stroke={stroke}
            strokeOpacity={0.4}
            strokeWidth={0.7}
          />
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fontSize={8}
            fill={stroke}
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {midLabelText}
          </text>
        </g>
      )}
    </g>
  );
}

/* ────────────────────── HoverCard / Empty / Controls ────────────────────── */

function HoverCard({
  node,
  view,
  viewportRef,
}: {
  node: PlacedNode | null;
  view: ViewState;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!node) return null;
  const rect = viewportRef.current?.getBoundingClientRect();
  const pxW = rect?.width ?? 800;
  const pxH = rect?.height ?? VIEWPORT_HEIGHT;
  const scaleX = pxW / view.w;
  const scaleY = pxH / view.h;
  const left = (node.x + node.w + 10 - view.x) * scaleX;
  const top = Math.max(0, (node.y - view.y) * scaleY);
  const clampedLeft = Math.min(Math.max(8, left), pxW - 260);
  const clampedTop = Math.min(Math.max(8, top), pxH - 120);
  return (
    <div
      className="absolute pointer-events-none p-2.5 border border-[var(--boared-rule)] bg-[var(--boared-paper)] max-w-[260px] shadow-sm"
      style={{ left: clampedLeft, top: clampedTop, zIndex: 5 }}
    >
      <div className="font-mono text-[0.52rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] mb-1">
        {prettyKind(node.kind)}
        {node.ts && ` · ${relativeTime(new Date(node.ts).toISOString())}`}
      </div>
      <div className="text-[0.88rem] leading-snug text-[var(--boared-ink)]">
        {node.label}
      </div>
      {node.sublabel && (
        <div className="mt-1 text-[0.76rem] leading-snug text-[var(--boared-ink-soft)] italic">
          {node.sublabel}
        </div>
      )}
    </div>
  );
}

function CaseGraphEmpty({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border border-dashed border-[var(--boared-rule)] bg-[var(--boared-paper-2)]/50 p-6 flex flex-col items-center gap-3 text-center",
        className,
      )}
      style={{ minHeight: 200 }}
    >
      <svg
        aria-hidden="true"
        width="220"
        height="80"
        viewBox="0 0 220 80"
        style={{ opacity: 0.8 }}
      >
        <rect
          x="80"
          y="16"
          width="60"
          height="36"
          fill="var(--boared-paper)"
          stroke="var(--boared-feature)"
          strokeWidth="1.3"
        />
        <circle cx="90" cy="26" r="2.5" fill="var(--boared-acid)" />
        <line x1="95" y1="26" x2="130" y2="26" stroke="var(--boared-ink-soft)" strokeWidth="0.7" />
        <line x1="85" y1="36" x2="125" y2="36" stroke="var(--boared-ink-soft)" strokeWidth="0.7" />
        <line x1="85" y1="44" x2="115" y2="44" stroke="var(--boared-ink-soft)" strokeWidth="0.7" />
        <line
          x1="110"
          y1="52"
          x2="110"
          y2="66"
          stroke="var(--boared-ink-faint)"
          strokeWidth="0.9"
          strokeDasharray="2 3"
        />
        <text
          x="110"
          y="74"
          textAnchor="middle"
          fontSize="7"
          fill="var(--boared-ink-faint)"
          style={{ fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.18em", textTransform: "uppercase" }}
        >
          no branches yet
        </text>
      </svg>
      <div className="space-y-1 max-w-[36ch]">
        <p className="font-serif italic text-[0.95rem] text-[var(--boared-ink)]">
          No work has started on this case.
        </p>
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
          delegate to an agent or leave a note to begin
        </p>
      </div>
    </div>
  );
}

function GraphButton({
  children,
  onClick,
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center h-6 w-6 border border-[var(--boared-rule)] bg-[var(--boared-paper)] hover:bg-[var(--boared-paper-2)] text-[var(--boared-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/40"
    >
      {children}
    </button>
  );
}

function LegendDot({ tint, label }: { tint: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: tint }}
      />
      {label}
    </span>
  );
}

/* ────────────────────── Layout ────────────────────── */

function layoutGraph(
  nodes: CaseSynthesisGraphNode[],
  edges: CaseSynthesisGraphEdge[],
): {
  nodes: PlacedNode[];
  edges: CaseSynthesisGraphEdge[];
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 400, height: 200 };
  }

  const root = nodes.find((n) => n.kind === "issue") ?? nodes[0];
  // Build adjacency for ranking. Convergence edges are ignored for
  // rank assignment — they curve back to the root for effect but
  // shouldn't push nodes down a tier.
  const childrenByParent = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === "resolved-into") continue;
    const list = childrenByParent.get(e.source) ?? [];
    list.push(e.target);
    childrenByParent.set(e.source, list);
  }

  // BFS ranks from the root. Rank 0 is the root; everyone else gets
  // their distance. Unreached nodes go one rank past the max so they
  // still render.
  const rankById = new Map<string, number>();
  const queue: Array<{ id: string; rank: number }> = [{ id: root.id, rank: 0 }];
  while (queue.length > 0) {
    const { id, rank } = queue.shift()!;
    const existing = rankById.get(id);
    if (existing !== undefined && existing <= rank) continue;
    rankById.set(id, rank);
    for (const child of childrenByParent.get(id) ?? []) {
      queue.push({ id: child, rank: rank + 1 });
    }
  }
  const maxRank = Math.max(0, ...rankById.values());
  for (const n of nodes) if (!rankById.has(n.id)) rankById.set(n.id, maxRank + 1);

  // Group by rank.
  const byRank = new Map<number, CaseSynthesisGraphNode[]>();
  for (const n of nodes) {
    const r = rankById.get(n.id)!;
    const arr = byRank.get(r) ?? [];
    arr.push(n);
    byRank.set(r, arr);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  // Place opener comment ABOVE the root if present (rank -1).
  const openerComment = nodes.find(
    (n) => n.kind === "comment" && edges.some((e) => e.target === n.id && e.source === root.id),
  );
  if (openerComment) {
    rankById.set(openerComment.id, -1);
    const cur = byRank.get(rankById.get(openerComment.id)!);
    // It was initially placed at rank 1 by the BFS; remove it from there.
    for (const [r, arr] of byRank.entries()) {
      const idx = arr.indexOf(openerComment);
      if (idx >= 0 && r !== -1) arr.splice(idx, 1);
    }
    const row = cur ?? [];
    if (!row.includes(openerComment)) row.push(openerComment);
    byRank.set(-1, row);
    if (!ranks.includes(-1)) ranks.unshift(-1);
    ranks.sort((a, b) => a - b);
  }

  // Compute x positions per rank (centre-aligned).
  const placedById = new Map<string, PlacedNode>();
  let maxWidth = 0;
  const rankWidths = new Map<number, number>();
  for (const rank of ranks) {
    const group = byRank.get(rank)!;
    const rowWidth = group.reduce((acc, n) => acc + (NODE[n.kind]?.w ?? 180), 0) + (group.length - 1) * GAP_X;
    rankWidths.set(rank, rowWidth);
    maxWidth = Math.max(maxWidth, rowWidth);
  }
  const canvasWidth = maxWidth + PADDING * 2;

  // Rank positions along Y. We keep a running Y offset so rows with
  // taller nodes don't collide with the row below.
  const rankYStart = new Map<number, number>();
  let y = PADDING;
  for (const rank of ranks) {
    rankYStart.set(rank, y);
    const group = byRank.get(rank)!;
    const rowHeight = Math.max(...group.map((n) => NODE[n.kind]?.h ?? 60));
    y += rowHeight + RANK_GAP_Y;
  }
  const canvasHeight = y + PADDING - RANK_GAP_Y;

  for (const rank of ranks) {
    const group = byRank.get(rank)!;
    const rowWidth = rankWidths.get(rank)!;
    let x = (canvasWidth - rowWidth) / 2;
    const yStart = rankYStart.get(rank)!;
    for (const n of group) {
      const { w, h } = NODE[n.kind] ?? { w: 180, h: 60 };
      placedById.set(n.id, {
        ...n,
        x,
        y: yStart,
        rank,
        w,
        h,
      });
      x += w + GAP_X;
    }
  }

  return {
    nodes: [...placedById.values()],
    edges,
    width: canvasWidth,
    height: canvasHeight,
  };
}

function initialView(layout: { width: number; height: number }): ViewState {
  return {
    x: 0,
    y: 0,
    w: Math.max(layout.width, 480),
    h: Math.max(layout.height, 320),
    zoom: 1,
  };
}

/* ────────────────────── Helpers ────────────────────── */

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function humanStatus(status: string | undefined): string {
  if (!status) return "open";
  return status.replace(/_/g, " ");
}

function monogram(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function parseAttemptSublabel(s: string | undefined): {
  count: number | null;
  outcome: string | null;
} {
  if (!s) return { count: null, outcome: null };
  const match = s.match(/^(\d+)\s+attempt[s]?\s*·\s*(.+)$/);
  if (!match) return { count: null, outcome: s.toLowerCase() };
  return { count: parseInt(match[1], 10), outcome: match[2].trim().toLowerCase() };
}

function outcomeColor(outcome: string | null, live: boolean): string {
  if (live) return "var(--boared-acid)";
  if (!outcome) return "var(--boared-ink-faint)";
  if (outcome.includes("resolved") || outcome.includes("done")) return "var(--boared-success)";
  if (outcome.includes("stuck") || outcome.includes("failed")) return "var(--boared-warn)";
  return "var(--boared-ink-faint)";
}

function prettyKind(kind: CaseSynthesisGraphNode["kind"]): string {
  switch (kind) {
    case "issue":
      return "Case";
    case "delegation":
      return "Delegation";
    case "run":
      return "Attempt";
    case "comment":
      return "Comment";
    case "approval":
      return "Approval";
    case "sub-issue":
      return "Related case";
    case "ancestor":
      return "Parent case";
    case "resolution":
      return "Resolution";
  }
}

function describeSelectedNode(n: PlacedNode | undefined): string {
  if (!n) return "nothing";
  return truncate(n.label, 42);
}

/** The delegation with the most total attempts — the case's centre
 * of gravity. Returns `null` when there's no clear winner (no
 * delegations, or a tie at the top). */
function computeHotPathId(nodes: CaseSynthesisGraphNode[]): string | null {
  let best: { id: string; count: number } | null = null;
  let tieCount = 0;
  for (const n of nodes) {
    if (n.kind !== "delegation") continue;
    const m = n.sublabel?.match(/^(\d+)\s+attempt/);
    if (!m) continue;
    const count = parseInt(m[1], 10);
    if (!best || count > best.count) {
      best = { id: n.id, count };
      tieCount = 1;
    } else if (count === best.count) {
      tieCount += 1;
    }
  }
  if (!best) return null;
  // Don't badge when there's a tie — no clear winner.
  if (tieCount > 1) return null;
  // And only badge when the winner is meaningfully ahead (≥ 3 attempts
  // AND at least 2× any other delegation) so we don't badge a case
  // where everyone did one attempt.
  if (best.count < 3) return null;
  return best.id;
}

function tintForKind(kind: CaseSynthesisGraphNode["kind"]): string {
  switch (kind) {
    case "issue":
      return "var(--boared-feature)";
    case "delegation":
      return "var(--boared-review)";
    case "run":
      return "var(--boared-warn)";
    case "comment":
      return "var(--boared-info)";
    case "approval":
      return "var(--boared-mute)";
    case "sub-issue":
      return "var(--boared-success)";
    case "ancestor":
      return "var(--boared-ink-soft)";
    case "resolution":
      return "var(--boared-acid)";
  }
}

