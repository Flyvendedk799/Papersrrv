/**
 * CaseFlowGraph — n8n-style fan-out/fan-in graph of how a case unfolded.
 *
 *      ┌─────────────┐
 *      │ § AIL-230   │     <- root issue (rank 0)
 *      └──┬────┬─────┘
 *         │    │
 *    ┌────▼┐  ┌▼────┐      <- delegations (rank 1)
 *    │ CE  │  │ CT  │
 *    └─┬───┘  └─┬───┘
 *      │        │
 *   ┌──▼─┐  ┌───▼──┐       <- sub-issues / approvals / runs (rank 2)
 *   │ S1 │  │ Appr │
 *   └─┬──┘  └───┬──┘
 *     │         │
 *     └────┬────┘
 *          ▼
 *    ┌──────────┐           <- resolution (rank 3, terminal)
 *    │ Resolved │
 *    └──────────┘
 *
 * Built on cytoscape (no React wrapper — manual mount). Layout is a
 * preset hierarchical placement keyed off node.kind so the graph
 * always reads top-down. Edges use taxi routing for the orthogonal
 * "flow diagram" look. Critical-path edges are stroked in acid;
 * abandoned branches are dashed and faded.
 *
 * Click a node → emits `paperclip:case-graph-select` so CaseArtifacts
 * can spotlight the matching tile. Same event the legacy CaseGraph
 * dispatched, so the rest of the page wiring is unchanged.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

type Core = cytoscape.Core;
type ElementDefinition = cytoscape.ElementDefinition;
type StylesheetCSS = cytoscape.StylesheetCSS;
import type {
  CaseSynthesisGraphEdge,
  CaseSynthesisGraphNode,
  CaseSynthesisPayload,
} from "../../../api/issues";
import { cn } from "../../../lib/utils";

interface Props {
  graph: {
    nodes: CaseSynthesisGraphNode[];
    edges: CaseSynthesisGraphEdge[];
  };
  synthesis?: CaseSynthesisPayload | null;
  loading?: boolean;
  className?: string;
  /** Optional minimum height; defaults to 520px so a small graph
   * still feels like a hero element. */
  minHeight?: number;
  /** When true, paints a "Live" corner badge and pulses freshly
   * arrived nodes. Driven by the parent's live-run signal. */
  live?: boolean;
}

/* ────────────────────── Layout constants ────────────────────── */

const RANK_BY_KIND: Record<CaseSynthesisGraphNode["kind"], number> = {
  ancestor: -1,
  issue: 0,
  delegation: 1,
  comment: 1,
  run: 2,
  "sub-issue": 2,
  approval: 2,
  resolution: 3,
};

const NODE_WIDTH: Record<CaseSynthesisGraphNode["kind"], number> = {
  ancestor: 200,
  issue: 280,
  delegation: 200,
  comment: 220,
  run: 200,
  "sub-issue": 220,
  approval: 200,
  resolution: 220,
};

const NODE_HEIGHT = 76;
const COL_GAP = 56;
const RANK_GAP = 120;

/* ────────────────────── Component ────────────────────── */

export function CaseFlowGraph({
  graph,
  loading,
  className,
  minHeight = 520,
  live,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* Pre-compute the cytoscape elements + positions. We do this in a
   * memo so re-renders triggered by selection state don't re-layout
   * the graph. Newly-arrived node ids are flagged via the `freshly-arrived`
   * class so the cytoscape stylesheet can pulse them. */
  const elements = useMemo<ElementDefinition[]>(() => {
    const built = buildElements(graph);
    const prev = prevNodeIdsRef.current;
    const current = new Set<string>();
    for (const el of built) {
      if (el.group === "nodes" && el.data?.id) current.add(String(el.data.id));
    }
    if (live && prev.size > 0) {
      for (const el of built) {
        if (el.group !== "nodes") continue;
        const id = el.data?.id ? String(el.data.id) : "";
        if (id && !prev.has(id)) {
          el.classes = `${el.classes ?? ""} freshly-arrived`.trim();
        }
      }
    }
    prevNodeIdsRef.current = current;
    return built;
  }, [graph, live]);

  /* Initial mount + element diff on graph change. */
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: stylesheet(),
      layout: { name: "preset", fit: true, padding: 40 },
      wheelSensitivity: 0.2,
      minZoom: 0.3,
      maxZoom: 2.4,
      boxSelectionEnabled: false,
      autounselectify: false,
    });

    cyRef.current = cy;

    cy.on("tap", "node", (evt) => {
      const id = evt.target.id() as string;
      setSelectedId(id);
      window.dispatchEvent(
        new CustomEvent("paperclip:case-graph-select", { detail: { id } }),
      );
    });

    cy.on("tap", (evt) => {
      // Background tap (target === cy) clears focus.
      if (evt.target === cy) {
        setSelectedId(null);
      }
    });

    /* Strip the freshly-arrived class after the pulse finishes so
     * subsequent re-mounts don't keep the same nodes highlighted. */
    const fadeFresh = window.setTimeout(() => {
      cy.nodes(".freshly-arrived").removeClass("freshly-arrived");
    }, 2200);

    return () => {
      window.clearTimeout(fadeFresh);
      cy.destroy();
      cyRef.current = null;
    };
    // We intentionally rebuild the graph from scratch on every elements
    // change (vs. fine-grained add/remove) — the synthesis payload is
    // deterministic and small enough that this is simpler than a diff.
  }, [elements]);

  /* Apply selection class without re-mounting. */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("focus dim");
    if (!selectedId) return;

    const node = cy.getElementById(selectedId);
    if (!node || node.empty()) return;

    const connected = node.predecessors().union(node.successors()).union(node);
    cy.elements().difference(connected).addClass("dim");
    connected.addClass("focus");
  }, [selectedId]);

  /* Resize observer — refit on container resize. */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      cyRef.current?.resize();
      cyRef.current?.fit(undefined, 40);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── Render ── */
  if (!loading && graph.nodes.length === 0) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--boared-rule)] bg-[var(--boared-paper-2)]/40 text-[var(--boared-ink-faint)] p-12",
          className,
        )}
        style={{ minHeight }}
      >
        <p className="font-serif italic text-[1rem] text-[var(--boared-ink)]">
          Nothing to chart yet.
        </p>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em]">
          Once an agent picks this case up, the flow will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height: minHeight }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--boared-paper)]/60 backdrop-blur-sm pointer-events-none">
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] animate-pulse">
            Synthesising…
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-full"
        aria-label="Case flow graph"
      />
      {live && (
        <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2 h-6 bg-[var(--boared-paper)]/95 border border-[var(--boared-acid)] font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-acid)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
          </span>
          Live
        </div>
      )}
      <FlowControls cyRef={cyRef} />
    </div>
  );
}

/* ────────────────────── Build elements ────────────────────── */

interface PositionedNode {
  node: CaseSynthesisGraphNode;
  rank: number;
  col: number;
  totalCols: number;
}

function buildElements(graph: Props["graph"]): ElementDefinition[] {
  if (graph.nodes.length === 0) return [];

  /* Group nodes by rank. Within a rank, sort by timestamp (then label)
   * for stable left-to-right ordering. */
  const byRank = new Map<number, CaseSynthesisGraphNode[]>();
  for (const n of graph.nodes) {
    const rank = RANK_BY_KIND[n.kind] ?? 2;
    const arr = byRank.get(rank) ?? [];
    arr.push(n);
    byRank.set(rank, arr);
  }
  for (const [r, arr] of byRank) {
    arr.sort((a, b) => {
      const ta = a.ts ?? 0;
      const tb = b.ts ?? 0;
      if (ta !== tb) return ta - tb;
      return a.label.localeCompare(b.label);
    });
    byRank.set(r, arr);
  }

  /* Compute x/y for each node. We center each rank around x=0; the
   * preset layout will translate to fit the viewport. */
  const positioned: PositionedNode[] = [];
  for (const [rank, arr] of byRank) {
    arr.forEach((node, col) => {
      positioned.push({ node, rank, col, totalCols: arr.length });
    });
  }

  const elements: ElementDefinition[] = positioned.map(({ node, rank, col, totalCols }) => {
    const width = NODE_WIDTH[node.kind];
    const stride = width + COL_GAP;
    const offsetX = (col - (totalCols - 1) / 2) * stride;
    const y = rank * (NODE_HEIGHT + RANK_GAP);
    return {
      group: "nodes",
      data: {
        id: node.id,
        label: node.label,
        sublabel: node.sublabel ?? "",
        kind: node.kind,
        status: node.status ?? "",
        author: node.authorName ?? "",
        critical: node.isCritical ? "1" : "0",
        terminal: node.isTerminal ? "1" : "0",
        deadEnd: node.isDeadEnd ? "1" : "0",
      },
      position: { x: offsetX, y },
      classes: classesFor(node),
    };
  });

  for (const e of graph.edges) {
    elements.push({
      group: "edges",
      data: {
        id: `${e.source}->${e.target}-${e.kind}`,
        source: e.source,
        target: e.target,
        kind: e.kind,
      },
      classes: edgeClassesFor(e),
    });
  }

  return elements;
}

function classesFor(n: CaseSynthesisGraphNode): string {
  const cls = [`kind-${n.kind}`];
  if (n.isCritical) cls.push("critical");
  if (n.isTerminal) cls.push("terminal");
  if (n.isDeadEnd) cls.push("dead-end");
  return cls.join(" ");
}

function edgeClassesFor(e: CaseSynthesisGraphEdge): string {
  const cls = [`edge-${e.kind}`];
  if (e.isCritical) cls.push("critical");
  if (e.kind === "abandoned") cls.push("dashed");
  if (e.kind === "resolved-into") cls.push("converge");
  return cls.join(" ");
}

/* ────────────────────── Stylesheet ────────────────────── */

function stylesheet(): StylesheetCSS[] {
  /* All colors reference Boared CSS variables so the graph re-themes
   * with the rest of the page. We resolve them via getComputedStyle in
   * cytoscape's color contexts — but since cytoscape doesn't read CSS
   * vars natively, we hard-code the canonical hues here as fallbacks
   * and rely on classes for overrides via the .focus / .dim modifiers. */
  return [
    {
      selector: "node",
      css: {
        shape: "round-rectangle",
        width: 200,
        height: NODE_HEIGHT,
        "background-color": "#fafaf6",
        "background-opacity": 1,
        "border-width": 1.5,
        "border-color": "#d8d4c9",
        label: "data(label)",
        color: "#1f1d18",
        "font-family": "Inter",
        "font-size": 12,
        "font-weight": 500,
        "text-wrap": "wrap",
        "text-max-width": "200px",
        "text-valign": "center",
        "text-halign": "center",
        "transition-property": "border-color, background-color, opacity, border-width",
        "transition-duration": 180,
      },
    },
    /* Per-kind width — encoded as one rule per kind so cytoscape's
     * preset layout uses the correct hit-box for each shape. */
    ...Object.entries(NODE_WIDTH).map(([kind, w]) => ({
      selector: `node.kind-${kind}`,
      css: { width: w },
    } as StylesheetCSS)),
    /* Kind colors. */
    {
      selector: "node.kind-issue",
      css: {
        "background-color": "#fff8ee",
        "border-color": "#e2a64a",
        "border-width": 2,
        "font-weight": 600,
      },
    },
    {
      selector: "node.kind-ancestor",
      css: {
        "background-color": "#f5f3ec",
        "border-color": "#cbc6b7",
        color: "#5b574c",
        "font-style": "italic",
      },
    },
    {
      selector: "node.kind-delegation",
      css: {
        "background-color": "#f3eef9",
        "border-color": "#a081c8",
      },
    },
    {
      selector: "node.kind-sub-issue",
      css: {
        "background-color": "#eef6f0",
        "border-color": "#6fa67d",
      },
    },
    {
      selector: "node.kind-approval",
      css: {
        "background-color": "#fdf2e6",
        "border-color": "#d49b59",
      },
    },
    {
      selector: "node.kind-run",
      css: {
        "background-color": "#eef0f8",
        "border-color": "#7387b5",
      },
    },
    {
      selector: "node.kind-comment",
      css: {
        "background-color": "#f9f7f0",
        "border-color": "#bbb4a0",
      },
    },
    {
      selector: "node.kind-resolution",
      css: {
        "background-color": "#1f1d18",
        "border-color": "#1f1d18",
        color: "#fafaf6",
        "font-weight": 600,
      },
    },
    {
      selector: "node.terminal",
      css: {
        "border-width": 3,
      },
    },
    {
      selector: "node.dead-end",
      css: {
        opacity: 0.55,
        "border-style": "dashed",
      },
    },
    {
      selector: "node.critical",
      css: {
        "border-color": "#e23232",
        "border-width": 2.5,
      },
    },
    {
      selector: "node.focus",
      css: {
        "border-width": 3,
        "border-color": "#e23232",
      },
    },
    {
      selector: ".dim",
      css: { opacity: 0.18 },
    },
    /* Freshly-arrived nodes pulse for ~2s after they appear so the
     * reader's eye lands on the new branch without us having to
     * reposition the camera. The animation is driven entirely by
     * cytoscape's transition engine via repeated background-color
     * cycles applied below. */
    {
      selector: "node.freshly-arrived",
      css: {
        "border-color": "#e23232",
        "border-width": 3,
        "background-color": "#fff5f3",
      },
    },

    /* ── Edges ── */
    {
      selector: "edge",
      css: {
        width: 1.5,
        "line-color": "#bcb6a4",
        "curve-style": "taxi",
        "taxi-direction": "vertical",
        "taxi-turn": 36,
        "taxi-turn-min-distance": 10,
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#bcb6a4",
        "arrow-scale": 0.9,
        opacity: 0.85,
        "transition-property": "line-color, width, opacity",
        "transition-duration": 180,
      },
    },
    {
      selector: "edge.critical",
      css: {
        "line-color": "#e23232",
        "target-arrow-color": "#e23232",
        width: 2.4,
        opacity: 1,
      },
    },
    {
      selector: "edge.dashed",
      css: {
        "line-style": "dashed",
        opacity: 0.5,
      },
    },
    {
      selector: "edge.converge",
      css: {
        "line-style": "dashed",
        "line-color": "#e23232",
        "target-arrow-color": "#e23232",
        "curve-style": "unbundled-bezier",
        "control-point-distances": "60",
        "control-point-weights": "0.5",
      },
    },
    {
      selector: "edge.edge-approved",
      css: { "line-color": "#d49b59", "target-arrow-color": "#d49b59" },
    },
    {
      selector: "edge.edge-spawned",
      css: { "line-color": "#a081c8", "target-arrow-color": "#a081c8" },
    },
  ];
}

/* ────────────────────── Controls ────────────────────── */

function FlowControls({ cyRef }: { cyRef: React.MutableRefObject<Core | null> }) {
  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 bg-[var(--boared-paper)]/95 border border-[var(--boared-rule)] p-1 shadow-sm">
      <button
        type="button"
        onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}
        title="Zoom in"
        aria-label="Zoom in"
        className="inline-flex h-7 w-7 items-center justify-center text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.2)}
        title="Zoom out"
        aria-label="Zoom out"
        className="inline-flex h-7 w-7 items-center justify-center text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => cyRef.current?.fit(undefined, 40)}
        title="Fit"
        aria-label="Fit to view"
        className="inline-flex h-7 w-7 items-center justify-center text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          const cy = cyRef.current;
          if (!cy) return;
          cy.zoom(1);
          cy.center();
          cy.fit(undefined, 40);
        }}
        title="Reset view"
        aria-label="Reset view"
        className="inline-flex h-7 w-7 items-center justify-center text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
