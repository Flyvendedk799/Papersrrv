/* ─────────────────────────────────────────────────────────────────────
 *  SceneStateContext — the single shared store for the unified page.
 *
 *  The scene, the Case Companion panel on the right, and the below-fold
 *  case-file stack all read from and write to this context. That's what
 *  turns three parallel widgets into one conversation.
 *
 *  Architecture:
 *    · SceneStateContext — reads (stable data + selection + filters +
 *      activeChapterKey + searchQuery + tour-running flag).
 *    · SceneActionsContext — writes (stable-reference dispatcher).
 *      Consumers that only dispatch (row click handlers, CTA buttons)
 *      subscribe to this ONLY so they don't re-render on every state
 *      change.
 *    · hoverStore — a ref-backed external store (useSyncExternalStore
 *      semantics). Mousemove sets the hover target without re-rendering
 *      React. The 3D scene reads it per-frame via useFrame; rows
 *      subscribe with equality check so only the row matching the hover
 *      re-renders.
 *
 *  Risk controls:
 *    · Invalid selection auto-clears when graph id-sets drop the target.
 *    · Hover updates never flow through context; the ref-store keeps
 *      them out of React's render graph.
 *    · Actions are memoised so callbacks in rows/buttons remain stable.
 * ───────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { IssueGraph, SceneTarget, SceneFilters } from "../data/types";
import {
  ALL_LAYERS_VISIBLE,
  type SceneLayerKey,
} from "../data/types";
import type { CameraPoseKey } from "../scene/cinematography";
import { poseForTarget } from "../scene/cinematography";
import type { Narrative } from "../scene/narrative";
import type { Chapter } from "../data/chapters";

/* ─── Shapes ────────────────────────────────────────────────────── */

/** Minimal selection ref — resolved into a full SceneTarget lazily via
 *  the graph. We store the ref (kind+id) because the target objects
 *  themselves get regenerated on every graph recomputation. */
export interface SelectionRef {
  kind: SceneTarget["kind"];
  id: string;
}

export interface SceneState {
  graph: IssueGraph;
  /** Precomputed narrative — templates + chips + nextAction. */
  narrative: Narrative;
  /** Ordered, context-aware chapter outline. */
  chapters: Chapter[];
  selection: SceneTarget | null;
  filters: SceneFilters;
  isolatedLayer: SceneLayerKey | null;
  activeChapterKey: string | null;
  targetPose: CameraPoseKey | null;
  searchQuery: string;
  tourRunning: boolean;
  /** Journey history — a short stack of previously-selected targets
   *  so users can see where they came from and click "back" to walk
   *  the causal trail in reverse. Capped at MAX_JOURNEY to keep the
   *  breadcrumb bar scannable. */
  journey: SelectionRef[];
}

export interface SceneActions {
  select: (target: SceneTarget | null) => void;
  /** Select + push the matching camera pose (used by row clicks). */
  selectAndFocus: (target: SceneTarget) => void;
  toggleFilter: (key: SceneLayerKey) => void;
  isolate: (key: SceneLayerKey | null) => void;
  resetFilters: () => void;
  setSearch: (q: string) => void;
  setActiveChapterKey: (key: string | null) => void;
  setTargetPose: (pose: CameraPoseKey | null) => void;
  /** Pop one step off the journey stack and select that target.
   *  No-op when history is empty. */
  goBack: () => void;
  /** Jump to a specific index in the journey (0 = oldest). Trims
   *  history past that index. Used by breadcrumb clicks. */
  jumpToJourneyIndex: (index: number) => void;
  /** Clear history entirely (e.g. on "back to overview"). */
  clearJourney: () => void;
}

/** Cap on how many past selections we remember. Beyond this, oldest
 *  entries fall off the front of the stack. */
const MAX_JOURNEY = 10;

/* ─── Hover ref-store ──────────────────────────────────────────────
 *
 * Updates fire outside React's reconciliation. Consumers subscribe
 * only if they care about a specific target; the comparator short-
 * circuits re-renders when the new hover isn't about them.
 */
type HoverListener = () => void;
interface HoverStore {
  get: () => SelectionRef | null;
  set: (ref: SelectionRef | null) => void;
  subscribe: (fn: HoverListener) => () => void;
}

function createHoverStore(): HoverStore {
  let value: SelectionRef | null = null;
  const listeners = new Set<HoverListener>();
  return {
    get: () => value,
    set: (next) => {
      const changed =
        (value === null) !== (next === null) ||
        (value && next && (value.id !== next.id || value.kind !== next.kind));
      if (!changed) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

const HoverStoreContext = createContext<HoverStore | null>(null);

/* ─── Contexts ─────────────────────────────────────────────────── */

const SceneStateContext = createContext<SceneState | null>(null);
const SceneActionsContext = createContext<SceneActions | null>(null);

/* ─── Provider ─────────────────────────────────────────────────── */

interface ProviderProps {
  graph: IssueGraph;
  narrative: Narrative;
  chapters: Chapter[];
  /** Tour running flag — the block composes useGuidedTour separately; we
   *  just need to know whether it's running so certain actions yield. */
  tourRunning: boolean;
  children: ReactNode;
}

export function SceneStateProvider({
  graph,
  narrative,
  chapters,
  tourRunning,
  children,
}: ProviderProps) {
  const [selection, setSelection] = useState<SceneTarget | null>(null);
  const [filters, setFilters] = useState<SceneFilters>(ALL_LAYERS_VISIBLE);
  const [isolatedLayer, setIsolatedLayer] = useState<SceneLayerKey | null>(null);
  const [activeChapterKey, setActiveChapterKey] = useState<string | null>(null);
  const [targetPose, setTargetPose] = useState<CameraPoseKey | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [journey, setJourney] = useState<SelectionRef[]>([]);

  const hoverStore = useMemo(() => createHoverStore(), []);

  /* Clear selection + hover when the graph loses the referenced id.
   * Cheap set-lookup per graph change; nothing per frame. */
  useEffect(() => {
    if (!selection) return;
    if (!graphContains(graph, selection)) setSelection(null);
    const hv = hoverStore.get();
    if (hv && !graphContainsRef(graph, hv)) hoverStore.set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  /* Actions — stable references; consumers can depend on them safely.
   *
   * Both select() and selectAndFocus() push the PREVIOUS selection
   * to the journey stack so users can walk the trail in reverse.
   * Same-target re-clicks don't push (noise guard).
   */
  const pushToJourney = useCallback((prev: SceneTarget | null) => {
    if (!prev) return;
    const ref = targetToRef(prev);
    setJourney((j) => {
      // Dedup against the current tail.
      const tail = j[j.length - 1];
      if (tail && tail.kind === ref.kind && tail.id === ref.id) return j;
      const next = [...j, ref];
      if (next.length > MAX_JOURNEY) next.shift();
      return next;
    });
  }, []);

  const select = useCallback((target: SceneTarget | null) => {
    setSelection((prev) => {
      if (target === null) {
        // Clearing selection — reset journey too so the next click
        // starts a fresh trail.
        setJourney([]);
        return null;
      }
      // Same target re-selected: no-op.
      if (
        prev &&
        sameTarget(prev, target)
      ) {
        return prev;
      }
      pushToJourney(prev);
      return target;
    });
  }, [pushToJourney]);

  const selectAndFocus = useCallback((target: SceneTarget) => {
    setSelection((prev) => {
      if (prev && sameTarget(prev, target)) return prev;
      pushToJourney(prev);
      return target;
    });
    setTargetPose(poseForTarget(target));
  }, [pushToJourney]);

  const goBack = useCallback(() => {
    setJourney((j) => {
      if (j.length === 0) return j;
      const nextJourney = j.slice(0, -1);
      const last = j[j.length - 1];
      // Resolve the ref to a full target against the current graph.
      const resolved = resolveSelectionRef(graph, last);
      setSelection(resolved);
      if (resolved) setTargetPose(poseForTarget(resolved));
      return nextJourney;
    });
  }, [graph]);

  const jumpToJourneyIndex = useCallback(
    (index: number) => {
      setJourney((j) => {
        if (index < 0 || index >= j.length) return j;
        const target = j[index];
        const resolved = resolveSelectionRef(graph, target);
        // Everything past this index rolls away; the jumped-to item
        // becomes the new selection. The crumb ITSELF is consumed —
        // we keep crumbs 0..index-1 as the user's remaining trail.
        setSelection(resolved);
        if (resolved) setTargetPose(poseForTarget(resolved));
        return j.slice(0, index);
      });
    },
    [graph],
  );

  const clearJourney = useCallback(() => setJourney([]), []);

  const toggleFilter = useCallback((key: SceneLayerKey) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
    setIsolatedLayer(null);
  }, []);

  const isolate = useCallback((key: SceneLayerKey | null) => {
    if (key === null) {
      setFilters(ALL_LAYERS_VISIBLE);
      setIsolatedLayer(null);
      return;
    }
    setIsolatedLayer((prev) => {
      // Toggling the same layer clears isolation.
      if (prev === key) {
        setFilters(ALL_LAYERS_VISIBLE);
        return null;
      }
      const next = {
        ancestors: false,
        descendants: false,
        runs: false,
        comments: false,
        events: false,
        approvals: false,
        timeline: false,
      };
      next[key] = true;
      setFilters(next);
      return key;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(ALL_LAYERS_VISIBLE);
    setIsolatedLayer(null);
  }, []);

  const setSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const actions = useMemo<SceneActions>(
    () => ({
      select,
      selectAndFocus,
      toggleFilter,
      isolate,
      resetFilters,
      setSearch,
      setActiveChapterKey,
      setTargetPose,
      goBack,
      jumpToJourneyIndex,
      clearJourney,
    }),
    [
      select,
      selectAndFocus,
      toggleFilter,
      isolate,
      resetFilters,
      setSearch,
      goBack,
      jumpToJourneyIndex,
      clearJourney,
    ],
  );

  const state = useMemo<SceneState>(
    () => ({
      graph,
      narrative,
      chapters,
      selection,
      filters,
      isolatedLayer,
      activeChapterKey,
      targetPose,
      searchQuery,
      tourRunning,
      journey,
    }),
    [
      graph,
      narrative,
      chapters,
      selection,
      filters,
      isolatedLayer,
      activeChapterKey,
      targetPose,
      searchQuery,
      tourRunning,
      journey,
    ],
  );

  return (
    <SceneStateContext.Provider value={state}>
      <SceneActionsContext.Provider value={actions}>
        <HoverStoreContext.Provider value={hoverStore}>
          {children}
        </HoverStoreContext.Provider>
      </SceneActionsContext.Provider>
    </SceneStateContext.Provider>
  );
}

/* ─── Read hooks ───────────────────────────────────────────────── */

export function useSceneState(): SceneState {
  const v = useContext(SceneStateContext);
  if (!v) throw new Error("useSceneState must be inside SceneStateProvider");
  return v;
}

export function useSceneActions(): SceneActions {
  const v = useContext(SceneActionsContext);
  if (!v)
    throw new Error("useSceneActions must be inside SceneStateProvider");
  return v;
}

/** Optional read — returns null outside a provider, for components that
 *  can render in both contexts (sticky mini-scene, etc.). */
export function useSceneStateOptional(): SceneState | null {
  return useContext(SceneStateContext);
}

export function useSceneActionsOptional(): SceneActions | null {
  return useContext(SceneActionsContext);
}

/* ─── Hover hooks ──────────────────────────────────────────────── */

/** Internal hook to get the hover store reference. */
function useHoverStore(): HoverStore {
  const s = useContext(HoverStoreContext);
  if (!s) throw new Error("useHoverStore must be inside SceneStateProvider");
  return s;
}

/** Read the current hover target via useSyncExternalStore so the
 *  component re-renders when hover changes. Used by components that
 *  DO care about hover (e.g. the whole hover-halo overlay). For row-
 *  specific subscription that only fires when THIS row is hovered,
 *  use useIsHovered(ref). */
export function useHoverTarget(): SelectionRef | null {
  const store = useHoverStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * useIsHovered — tiny re-render-optimized hook. A row passing its own
 * {kind,id} gets `true` iff it's the current hover; any other hover
 * change causes exactly one re-render per row (enter + leave).
 */
export function useIsHovered(ref: SelectionRef): boolean {
  const store = useHoverStore();
  return useSyncExternalStore(
    store.subscribe,
    () => {
      const h = store.get();
      return h?.kind === ref.kind && h?.id === ref.id;
    },
    () => false,
  );
}

/** Write hover — cheap, never re-renders the caller. */
export function useSetHover(): (ref: SelectionRef | null) => void {
  const store = useHoverStore();
  return store.set;
}

/** Direct ref-store access for useFrame-style consumers that want to
 *  read hover without going through React at all (the 3D scene). */
export function useHoverStoreHandle(): HoverStore {
  return useHoverStore();
}

/** Optional version — returns null outside a provider. Used by the
 *  scene so it can also render standalone (e.g. sticky mini-scene
 *  without the full page context). */
export function useHoverStoreHandleOptional(): HoverStore | null {
  return useContext(HoverStoreContext);
}

/* ─── Utilities ────────────────────────────────────────────────── */

function graphContains(graph: IssueGraph, target: SceneTarget): boolean {
  switch (target.kind) {
    case "issue":
      return target.data.id === graph.root.id;
    case "ancestor":
      return graph.ancestors.some((a) => a.id === target.data.id);
    case "descendant":
      return graph.descendants.some((d) => d.id === target.data.id);
    case "run":
      return graph.runs.some((r) => r.runId === target.data.runId);
    case "comment":
      return graph.comments.some((c) => c.id === target.data.id);
    case "event":
      return graph.events.some((e) => e.id === target.data.id);
    case "approval":
      return graph.approvals.some((a) => a.id === target.data.id);
  }
}

function graphContainsRef(graph: IssueGraph, ref: SelectionRef): boolean {
  switch (ref.kind) {
    case "issue":
      return ref.id === graph.root.id;
    case "ancestor":
      return graph.ancestors.some((a) => a.id === ref.id);
    case "descendant":
      return graph.descendants.some((d) => d.id === ref.id);
    case "run":
      return graph.runs.some((r) => r.runId === ref.id);
    case "comment":
      return graph.comments.some((c) => c.id === ref.id);
    case "event":
      return graph.events.some((e) => e.id === ref.id);
    case "approval":
      return graph.approvals.some((a) => a.id === ref.id);
  }
}

/** Resolve a SelectionRef into a full SceneTarget using the current graph.
 *  Returns null if the id no longer exists (caller should then clear). */
export function resolveSelectionRef(
  graph: IssueGraph,
  ref: SelectionRef,
): SceneTarget | null {
  switch (ref.kind) {
    case "issue":
      return { kind: "issue", data: graph.root };
    case "ancestor": {
      const a = graph.ancestors.find((x) => x.id === ref.id);
      return a ? { kind: "ancestor", data: a } : null;
    }
    case "descendant": {
      const d = graph.descendants.find((x) => x.id === ref.id);
      return d ? { kind: "descendant", data: d } : null;
    }
    case "run": {
      const r = graph.runs.find((x) => x.runId === ref.id);
      return r ? { kind: "run", data: r } : null;
    }
    case "comment": {
      const c = graph.comments.find((x) => x.id === ref.id);
      return c ? { kind: "comment", data: c } : null;
    }
    case "event": {
      const e = graph.events.find((x) => x.id === ref.id);
      return e ? { kind: "event", data: e } : null;
    }
    case "approval": {
      const ap = graph.approvals.find((x) => x.id === ref.id);
      return ap ? { kind: "approval", data: ap } : null;
    }
  }
}

/** Convert a SceneTarget to its minimal ref. */
/** Structural equality for two SceneTargets by (kind, id). */
export function sameTarget(a: SceneTarget, b: SceneTarget): boolean {
  const ar = targetToRef(a);
  const br = targetToRef(b);
  return ar.kind === br.kind && ar.id === br.id;
}

export function targetToRef(target: SceneTarget): SelectionRef {
  switch (target.kind) {
    case "issue":
      return { kind: "issue", id: target.data.id };
    case "ancestor":
      return { kind: "ancestor", id: target.data.id };
    case "descendant":
      return { kind: "descendant", id: target.data.id };
    case "run":
      return { kind: "run", id: target.data.runId };
    case "comment":
      return { kind: "comment", id: target.data.id };
    case "event":
      return { kind: "event", id: target.data.id };
    case "approval":
      return { kind: "approval", id: target.data.id };
  }
}
