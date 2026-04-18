/* ─────────────────────────────────────────────────────────────────────
 *  IssueScene — the 3D case-file visualization for a single issue.
 *
 *  Entry point used by IssueDetail. Wraps an R3F <Canvas> with:
 *    · Lights (ambient, a warm key, a cool rim)
 *    · Perspective camera + OrbitControls for free-flow orbit/pan/zoom
 *    · Post-processing stack: Bloom + Vignette + Chromatic Aberration
 *    · All scene layers composed together
 *    · Deferred mount + IntersectionObserver pause + hover/selection
 *      state driving the DOM side panel on top.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
/* EffectComposer + Bloom + Vignette retired — postprocessing crashed
 * the canvas on every HMR race. Emissive materials + additive
 * blending on the neuron field handle the glow effect instead. */
// import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type {
  Issue,
  IssueComment,
  ActivityEvent,
  Agent,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../api/activity";
import { cn } from "../../lib/utils";

import { useIssueGraph } from "./data/useIssueGraph";
import type {
  IssueGraph,
  SceneTarget,
  SceneFilters,
  SceneLayerKey,
} from "./data/types";
import { ALL_LAYERS_VISIBLE } from "./data/types";
import { IssuePillar } from "./scene/IssuePillar";
import {
  RunOrbit,
  CommentOrbit,
  AncestorChain,
  DescendantRoots,
  ApprovalPortals,
  SatelliteMoons,
} from "./scene/Orbits";
import { Substrate } from "./scene/Substrate";
/* StarFlecks retired — replaced by NeuronField which reads as cortical
 * tissue rather than starfield. Keep the import path free for anyone
 * who still references the module by name. */
// import { StarFlecks } from "./scene/StarFlecks";

import { SelectionFocus } from "./scene/SelectionFocus";
import { atmosphereFor } from "./scene/atmosphere";
import { narrativeFor } from "./scene/narrative";

import { CameraChoreographer } from "./scene/CameraChoreographer";
import type { CameraPoseKey } from "./scene/cinematography";

import { SelectedPanel } from "./overlays/SelectedPanel";
import { TitleCard } from "./overlays/TitleCard";
import { Ledger } from "./overlays/Ledger";
import { ReadingKey } from "./overlays/ReadingKey";
import { QuestionPills } from "./overlays/QuestionPills";
import { FocusPanel } from "./overlays/FocusPanel";
import { useLens } from "./state/useLens";
import { TimeSpine } from "./overlays/TimeSpine";
import {
  StatsStrip,
  CountsStrip,
  LayerFilters,
  AgentSwatch,
} from "./overlays/SceneHUD";
import { SCENE, statusColor } from "./colors";

interface IssueSceneProps {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  linkedApprovals?: Array<{
    id: string;
    status: string;
    requestedAt?: Date | string | null;
    decidedAt?: Date | string | null;
  }>;
  className?: string;
  /** Optional — override the scene wrapper's CSS height. Default
   *  `"min(80vh, 860px)"`. Pass a shorter value (e.g. `"520px"`) when
   *  the scene sits next to a Companion panel instead of full-bleed. */
  height?: string;
  /** Optional — when true, the on-scene Ledger drops its prose/CTA
   *  and renders just the compact chip strip. Use when the prose is
   *  already shown in an adjacent Companion. */
  ledgerCompact?: boolean;
  /** Optional — "hero" (default) renders the full scene with HUD,
   *  title card, post-processing, and interactive selection. "mini"
   *  strips everything except the 3D pillar/orbits/substrate; used
   *  by StickyMiniScene when the hero has scrolled away. */
  mode?: "hero" | "mini";
  /** Optional — when set, CameraChoreographer inside the Canvas will
   *  lerp to this named pose. Drives Cut 2's scroll choreography and
   *  guided tour. */
  targetPose?: CameraPoseKey | null;
}

export function IssueScene(props: IssueSceneProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const graph = useIssueGraph(props);
  const isMini = props.mode === "mini";

  /* Atmosphere — tone of fog/light/vignette is chosen from (status,
   * priority, live runs). Recomputes when the root issue's signature
   * or the live-run count changes; cheap and purely derived. */
  const liveRunCount = useMemo(
    () =>
      graph.runs.filter((r) => r.isLive).length,
    [graph.runs],
  );
  const atmo = useMemo(
    () => atmosphereFor(graph.root, { liveRunCount }),
    [graph.root, liveRunCount],
  );

  /* Narrative — lede + clauses + chips + nextAction + milestones +
   * mention links. Pure derivation from graph; recomputes on any graph
   * signature change. Everything in the Ledger and TimeSpine comes
   * from this one object. */
  const narrative = useMemo(
    () => narrativeFor(graph, graph.root),
    [graph],
  );

  /* Lens — question-driven highlighting. Auto-picks most-urgent lens on
   * first mount; user changes it via QuestionPills. Result drives the
   * Synapses highlightIds (dim non-answer edges) and the floating
   * caption above the pills. */
  const {
    lens,
    setLens,
    highlightedIds,
    caption: lensCaption,
    cameraPose,
  } = useLens(graph);

  /* Counts for the pills so the user sees, e.g., "3 pending" on the
   * Blocking pill without clicking it. */
  const pillCounts = useMemo(() => {
    const pendingApprovals = graph.approvals.filter(
      (a) => a.status === "pending",
    ).length;
    const liveRuns = graph.runs.filter((r) => r.isLive).length;
    return {
      blocking: pendingApprovals > 0 ? pendingApprovals : undefined,
      who: liveRuns > 0 ? liveRuns : undefined,
    };
  }, [graph]);

  /* Staggered reveal — on first mount, layers appear in sequence to
   * give the scene a "case file opens" narrative beat. Each layer is
   * gated on revealStage ≥ its threshold. Starts at 0 (pillar only),
   * ticks up over ~1.4s total so it aligns with CameraIntro.
   *
   *   0 : pillar + substrate
   *   1 : stars + sparks
   *   2 : ancestors
   *   3 : descendants
   *   4 : runs + comments + events + approvals
   */
  const [revealStage, setRevealStage] = useState(0);
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setRevealStage(1), 250),
      window.setTimeout(() => setRevealStage(2), 550),
      window.setTimeout(() => setRevealStage(3), 850),
      window.setTimeout(() => setRevealStage(4), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  /* ─── State: context-backed when available, local otherwise ───
   *
   * The unified page wraps IssueScene in a SceneStateProvider so the
   * Companion + below-fold rows can read/write the same selection +
   * hover + filters. When IssueScene is mounted standalone (sticky
   * mini-scene), we fall back to local state so it still works.
   */
  const sharedState = useSceneStateOptional();
  const sharedActions = useSceneActionsOptional();
  const sharedHoverStore = useHoverStoreHandleOptional();
  const isShared = !!sharedState;

  /* Local-state fallback for standalone mode. */
  const [localHover, setLocalHover] = useState<SceneTarget | null>(null);
  const [localSelected, setLocalSelected] = useState<SceneTarget | null>(null);
  const [localFilters, setLocalFilters] =
    useState<SceneFilters>(ALL_LAYERS_VISIBLE);

  /* Resolved values — prefer shared when the provider is present. */
  const selected = isShared ? sharedState!.selection : localSelected;
  const filters = isShared ? sharedState!.filters : localFilters;

  /* Focus pose — whenever the user clicks a node, compute a camera
   * pose that frames that node. This is the "click to fly to it" UX:
   * the camera position is pulled along the view ray from origin
   * through the anchor, and the look-at target is the node itself.
   *
   * Null when nothing is selected — camera then falls back to the
   * lens pose or the caller's targetPose. */
  const focusPose = useMemo(() => {
    if (!selected) return null;
    const anchor = anchorForTarget(selected);
    return computeFocusPose(anchor, selected.kind);
  }, [selected]);

  /* hoverTarget — in standalone mode this is plain local state. In
   * shared mode we sync it from the ref-store at a low update rate
   * (rAF-coalesced) so React DOM overlays like HoverFocus + the
   * hover-dim signal have a value to read, but mousemove across the
   * 3D mesh doesn't immediately re-render the whole tree. */
  const [sharedHoverMirror, setSharedHoverMirror] =
    useState<SceneTarget | null>(null);

  useEffect(() => {
    if (!isShared || !sharedHoverStore || !sharedState) return;
    let raf = 0;
    let pending = false;
    const flush = () => {
      pending = false;
      const ref = sharedHoverStore.get();
      const target = ref ? resolveSelectionRef(sharedState.graph, ref) : null;
      setSharedHoverMirror(target);
    };
    const sub = sharedHoverStore.subscribe(() => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(flush);
    });
    return () => {
      cancelAnimationFrame(raf);
      sub();
    };
  }, [isShared, sharedHoverStore, sharedState]);

  const hoverTarget: SceneTarget | null = isShared
    ? sharedHoverMirror
    : localHover;

  const [mounted, setMounted] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  /* Cluster-jump — ClusterLabels click dispatches a camera pose.
   * Reset to null on any selection / lens change so a subsequent
   * click on the same cluster label still retriggers. */
  const [clusterPose, setClusterPose] = useState<CameraPoseKey | null>(null);

  /* Compass heading — R3F CompassInScene writes into this ref every
   * frame, CompassOverlay reads it at ~6 fps. No React re-renders. */
  const compassHeadingRef = useRef(0);

  /* Clear any clusterPose the moment the user picks a node or
   * changes the lens, so the cluster-jump doesn't fight them. */
  useEffect(() => {
    setClusterPose(null);
  }, [selected, lens]);
  const visibleRef = useRef(true);
  const [visibleState, setVisibleState] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const toggleFilter = useCallback(
    (key: SceneLayerKey) => {
      if (isShared) {
        sharedActions!.toggleFilter(key);
      } else {
        setLocalFilters((f) => ({ ...f, [key]: !f[key] }));
      }
    },
    [isShared, sharedActions],
  );
  const isolateFilter = useCallback(
    (key: SceneLayerKey) => {
      if (isShared) {
        sharedActions!.isolate(key);
      } else {
        setLocalFilters(() => {
          const next = { ...ALL_LAYERS_VISIBLE };
          (Object.keys(next) as SceneLayerKey[]).forEach((k) => {
            next[k] = k === key;
          });
          return next;
        });
      }
    },
    [isShared, sharedActions],
  );
  const resetFilters = useCallback(() => {
    if (isShared) {
      sharedActions!.resetFilters();
    } else {
      setLocalFilters(ALL_LAYERS_VISIBLE);
    }
  }, [isShared, sharedActions]);

  /* Defer the R3F Canvas mount until:
   *   1. The wrapper has measured a non-zero size (ResizeObserver),
   *      otherwise R3F's internal useMeasure observes 0×0 on first
   *      render and the canvas stays at the 300×150 HTML default.
   *   2. At least ~120ms has passed so initial react-query fetches
   *      have a chance to settle before GPU work starts.
   *
   * This replaces the earlier requestIdleCallback path, which could
   * fire BEFORE the first layout pass in dev Strict Mode — leaving
   * the canvas permanently unsized. */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let sizeReady = false;
    let timeReady = false;
    let done = false;

    const maybeMount = () => {
      if (done) return;
      if (sizeReady && timeReady) {
        done = true;
        setMounted(true);
        /* R3F's internal useMeasure sometimes latches the initial 0×0
         * reading under dev Strict Mode double-mount. Fire synthetic
         * resize events over the next ~250ms to shake it awake so
         * the Canvas's setSize picks up the real wrapper dimensions. */
        const nudge = () => {
          try { window.dispatchEvent(new Event("resize")); } catch { /* noop */ }
        };
        requestAnimationFrame(nudge);
        window.setTimeout(nudge, 120);
        window.setTimeout(nudge, 260);
      }
    };

    // (1) Size gate: wait until the wrapper has observable dimensions.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const r = entry.contentRect;
          if (r.width > 40 && r.height > 40) {
            sizeReady = true;
            maybeMount();
            ro?.disconnect();
            ro = null;
          }
        }
      });
      ro.observe(el);
    } else {
      // Fallback: assume size-ready after one frame.
      requestAnimationFrame(() => { sizeReady = true; maybeMount(); });
    }

    // Also check synchronously — the first measure may already be good.
    const initRect = el.getBoundingClientRect();
    if (initRect.width > 40 && initRect.height > 40) {
      sizeReady = true;
      ro?.disconnect();
      ro = null;
    }

    // (2) Time gate: give react-query a beat before spinning up GPU work.
    const timeHandle = window.setTimeout(() => {
      timeReady = true;
      maybeMount();
    }, 120);

    // Safety net — if the size gate never fires (rare), mount anyway
    // after 1.5s so we don't leave the user with a blank slab.
    const safety = window.setTimeout(() => {
      sizeReady = true;
      timeReady = true;
      maybeMount();
    }, 1500);

    return () => {
      ro?.disconnect();
      clearTimeout(timeHandle);
      clearTimeout(safety);
    };
  }, []);

  /* Pause the R3F frame loop when scrolled off-screen. */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleRef.current = entry.isIntersecting;
          setVisibleState(entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleHover = useCallback(
    (t: SceneTarget | null) => {
      if (isShared) {
        sharedHoverStore?.set(t ? targetToRef(t) : null);
      } else {
        setLocalHover(t);
      }
    },
    [isShared, sharedHoverStore],
  );
  const handleSelect = useCallback(
    (t: SceneTarget) => {
      if (isShared) {
        sharedActions!.select(t);
        sharedHoverStore?.set(null);
      } else {
        setLocalSelected(t);
        setLocalHover(null);
      }
    },
    [isShared, sharedActions, sharedHoverStore],
  );
  const handleBackgroundClick = useCallback(() => {
    if (isShared) {
      sharedActions!.select(null);
    } else {
      setLocalSelected(null);
    }
  }, [isShared, sharedActions]);

  /* Latest-value refs so the keyboard handler (registered once) can
   * always read the current selection + graph without having to
   * re-register on every state change. */
  const selectedRef = useRef<SceneTarget | null>(null);
  const graphRef = useRef(graph);
  useEffect(() => {
    selectedRef.current = selected;
    graphRef.current = graph;
  }, [selected, graph]);

  /* Keyboard shortcuts — Escape / R / Space / ← / →. Only act when
   * the event target isn't a text input, so we don't hijack typing
   * in other fields on the same page. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (target && target.isContentEditable) return;

      if (e.key === "Escape") {
        handleBackgroundClick();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        controlsRef.current?.reset();
        e.preventDefault();
        return;
      }
      if (e.key === " ") {
        // Space toggles auto-rotate — only if the scene is on screen.
        if (!visibleRef.current) return;
        setAutoRotate((v) => !v);
        e.preventDefault();
        return;
      }

      /* Sibling navigation — only active when a node is selected.
       * Steps through peers of the same kind (run ↔ run, comment ↔
       * comment, etc.) using the same ordering the FocusPanel uses. */
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const sel = selectedRef.current;
        if (!sel) return;
        const g = graphRef.current;
        const direction = e.key === "ArrowRight" ? 1 : -1;
        const next = siblingOf(g, sel, direction);
        if (next) {
          handleSelect(next);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleBackgroundClick, handleSelect]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative w-full overflow-hidden border border-foreground select-none",
        props.className,
      )}
      style={{
        height: props.height ?? "min(80vh, 860px)",
        background: SCENE.bg,
      }}
    >
      {mounted && (
        <Canvas
          dpr={isMini ? [1, 1.5] : [1, 2]}
          camera={{ position: [0, 2, 18], fov: 45 }}
          frameloop={visibleState ? "always" : "never"}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
            powerPreference: "high-performance",
          }}
          onPointerMissed={(e) => {
            // Click on empty space → deselect + clear hover
            if (e.type === "click") handleBackgroundClick();
          }}
          style={{ width: "100%", height: "100%" }}
        >
          {/* Scene fog for atmospheric depth */}
          <fog attach="fog" args={[SCENE.bg, 22, 60]} />
          <color attach="background" args={[SCENE.bg]} />

          {/* Lighting — dim ambient + cool rim + warm key */}
          <ambientLight intensity={0.25} color="#7280a0" />
          <directionalLight
            position={[10, 14, 8]}
            intensity={0.8}
            color="#ffe0b4"
          />
          <directionalLight
            position={[-12, -8, -10]}
            intensity={0.4}
            color="#8090ff"
          />

          {/* Camera controls — drei OrbitControls gives us the free-flow
              behaviors (unrestricted rotation, zoom to cursor, pan on
              right/middle button, damping) for free. */}
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            enablePan
            panSpeed={0.8}
            rotateSpeed={0.6}
            zoomSpeed={0.9}
            minDistance={4}
            maxDistance={45}
            makeDefault
          />

          {/* The Scene */}
          <IssuePillar
            issue={graph.root}
            livePulse={graph.livePulse}
            onHover={(h) =>
              handleHover(h ? { kind: "issue", data: graph.root } : null)
            }
            onClick={() => handleSelect({ kind: "issue", data: graph.root })}
          />
          {/* Inner vertical energy rod so the pillar reads as a column,
              not an orb. Low extra light budget; threads through the
              core. */}
          {!isMini && (
            <PillarSpindle
              color={statusColor(graph.root.status)}
              livePulse={graph.livePulse}
            />
          )}
          {/* Ground pool — status-colored radial glow anchoring the
              pillar so it stops looking like a body floating in space. */}
          {!isMini && (
            <ReflectionPool
              color={statusColor(graph.root.status)}
              livePulse={graph.livePulse}
            />
          )}
          {/* Ambient geometric debris — wireframe shards in the middle
              distance. Depth read. Hero-mode only. */}
          {!isMini && revealStage >= 1 && <AmbientDebris />}
          <SatelliteMoons />
          {revealStage >= 2 && filters.ancestors && (
            <AncestorChain
              ancestors={graph.ancestors}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          )}
          {revealStage >= 3 && filters.descendants && (
            <DescendantRoots
              descendants={graph.descendants}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          )}
          {revealStage >= 4 && filters.runs && (
            <RunOrbit
              runs={graph.runs}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          )}
          {revealStage >= 4 && (filters.comments || filters.events) && (
            <CommentOrbit
              comments={filters.comments ? graph.comments : []}
              events={filters.events ? graph.events : []}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          )}
          {revealStage >= 4 && filters.approvals && (
            <ApprovalPortals
              approvals={graph.approvals}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          )}
          {/* Mention arcs — drawn only when BOTH endpoints' orbits are
              actually visible, otherwise we'd have arcs hanging off
              invisible things. */}

          {/* Synapses — the visible nervous system. Draws ink-trail
              bezier lines pillar↔nodes using the SynapseEdge list that
              useIssueGraph now fills. Live synapses carry an axon
              pulse. Rendered above the nodes so lines thread between
              them, not underneath. */}
          {!isMini && revealStage >= 3 && (
            <Synapses
              edges={graph.edges}
              highlightIds={highlightedIds.size > 0 ? highlightedIds : null}
            />
          )}

          {/* Axis labels — faint "NOW →" at the equator so the user
              can read the sphere as a clock. */}
          {!isMini && revealStage >= 2 && <AxisLabels />}

          {/* Cluster labels — named count per shell (RUNS · 4,
              CORRESPONDENCE · 12, SUB-MATTERS · 3, …). Always-visible
              signposts so the user never has to guess which ring is
              which. Clicking a label flies the camera to that
              cluster's named pose. */}
          {!isMini && revealStage >= 2 && (
            <ClusterLabels
              graph={graph}
              onJumpToCluster={(pose) => {
                /* Reset to null first so clicking the same cluster
                 * twice still retriggers the lerp. */
                setClusterPose(null);
                requestAnimationFrame(() => setClusterPose(pose));
              }}
            />
          )}

          {/* Time rings — canonical duration ticks (1h/6h/1d/1w/1mo)
              on the equator so the user can eyeball how old anything
              is without a click. */}
          {!isMini && revealStage >= 4 && <TimeRings graph={graph} />}

          {/* 3D hover label — world-space floating card that follows
              the hovered node. Billboards with the camera. */}
          {!isMini && (
            <HoverLabel3D
              target={hoverTarget && !selected ? hoverTarget : null}
              position={
                hoverTarget && !selected
                  ? anchorForTarget(hoverTarget)
                  : null
              }
            />
          )}

          {/* Compass heading tracker — reads camera pose each frame
              into a ref the DOM overlay reads at ~6 fps. */}
          {!isMini && (
            <CompassInScene
              headingRef={compassHeadingRef}
              controlsRef={controlsRef}
            />
          )}

          {/* NOW arrow — thin tick on the equator at φ=0 signals the
              time origin so the sphere can be read as a clock. */}
          {!isMini && revealStage >= 4 && <NowArrow />}

          {/* Case Timeline — horizontal narrative spine threading
              leftward from the pillar. Shows WHO did WHAT WHEN with
              causal edges. The orbital layer remains as the aggregate
              summary; this is the story view. Hero mode only; gated
              by the TIMELINE filter pill. */}
          {!isMini && revealStage >= 4 && filters.timeline && (
            <CaseTimeline graph={graph} />
          )}

          {/* First-click discoverability — pulsing ring at the most
              significant node when nothing is selected. Self-dismisses
              on first interaction or after 14s. Only meaningful in
              hero mode. */}
          {!isMini && revealStage >= 4 && <FirstClickHint graph={graph} />}

          {/* Background dust — cheap GPU shader, kept for depth/mood. */}
          <Substrate dim={!!hoverTarget && !isMini} />

          {/* Neuron-native particle field — tens of thousands of GPU-simulated
              particles form density clusters around every graph node and
              ride live/event edges as flowing pulses. Replaces the legacy
              NeuronField + CognitiveCloud + NetworkFiring + ThoughtEcho
              decorative stack with one data-bound living tissue.
              See plan: /Users/tobiasmastek/.claude/plans/gleaming-cooking-blanket.md */}
          {revealStage >= 1 && (
            <ParticleField
              graph={graph}
              // Keep particles modest; additive blending over thousands of
              // sprites compounds fast. Hover-dim when the user is
              // focused on a specific node so the scene doesn't blow out.
              brightness={hoverTarget ? (isMini ? 0.35 : 0.3) : isMini ? 0.55 : 0.5}
              pointScale={isMini ? 0.7 : 0.85}
              isMini={isMini}
            />
          )}

          {/* ThoughtEcho + NetworkFiring were the decorative layer sitting
              on top of the old scene. Both are now expressed directly by
              the ParticleField: live/recently-active edges carry faster
              wave pulses, and new events produce spawn-wave bursts that
              radiate from the source node. See particles/useSceneEvents.ts
              and particles/ParticleField.tsx. */}

          {/* Hover halo — thin ring that follows the hovered node.
              Wayfinding aid; lighter than SelectionFocus. */}
          {!isMini && (
            <HoverFocus
              anchor={hoverTarget && !selected ? anchorForTarget(hoverTarget) : null}
              color={hoverTarget && !selected ? colorForTarget(hoverTarget) : undefined}
            />
          )}

          {/* Focus halo — pulses at the selected target's position. */}
          <SelectionFocus
            anchor={selected ? anchorForTarget(selected) : null}
            color={selected ? colorForTarget(selected) : undefined}
          />

          {/* Floating hover label via drei <Html> — only when hovering
              something AND nothing is selected (so the side panel
              takes over for selection). */}
          {hoverTarget && !selected && <HoverLabel target={hoverTarget} />}

          {/* Post-processing stack */}
          <EffectComposer multisampling={0}>
            <Bloom
              mipmapBlur
              intensity={1.15}
              luminanceThreshold={0.55}
              luminanceSmoothing={0.8}
              radius={0.7}
            />
            <Vignette offset={0.3} darkness={0.85} />
          </EffectComposer>
        </Canvas>
      )}

      {/* Everything below — mood tint, HUD, overlays, SelectedPanel —
          is suppressed in mini mode so the pinned tile stays a pure
          visual reminder without competing chrome. */}
      {!isMini && (
        <>
          {/* Cinematic intro title card — fades through ~2.7s then unmounts */}
          <TitleCard issue={graph.root} atmo={atmo} />

          {/* Top: status strip + count badges */}
          <StatsStrip graph={graph} />
          <CountsStrip graph={graph} />

          {/* Reading Key — the always-visible decoder. Uses Boared
              tokens so it fits the app theme. Collapsible; default-open
              on first visit. */}
          <ReadingKey />

          {/* Question Pills — the lens bar. Clicking a pill dims the
              sphere to just the answer and flies the camera to fit. */}
          <QuestionPills
            lens={lens}
            onChange={setLens}
            counts={pillCounts}
            caption={lensCaption}
          />

          {/* Focus Panel — the "you are here" card when a node is
              selected. Shows breadcrumb, title, context, sibling nav
              (◂ prev / next ▸), and an × close button. Keeps the
              zoomed-in view explicable. */}
          <FocusPanel
            graph={graph}
            selected={selected}
            onSelect={handleSelect}
            onClose={handleBackgroundClick}
          />

          {/* Compass — bottom-right orientation indicator. The dial
              face is also a reset button (returns to overview). */}
          <CompassOverlay
            headingRef={compassHeadingRef}
            container={wrapperRef.current}
            onReset={() => controlsRef.current?.reset()}
          />

          {/* TimeSpine retired — orbits + activity log + row-orb halos
              carry recency now. One less widget competing for the eye. */}

          {/* The Brief — persistent narrative overlay at bottom. Fades
              in at stage 4 when orbits populate, stays put afterwards. */}
          <Ledger
            narrative={narrative}
            visible={revealStage >= 4}
            compact={props.ledgerCompact}
            statusLabel={graph.status.replace(/_/g, " ").toUpperCase()}
            priorityLabel={`${graph.priority.toUpperCase()} PRIORITY`}
          />

          {/* Top-right: layer filter pills — click to toggle, shift-click to isolate */}
          <LayerFilters
            graph={graph}
            filters={filters}
            onToggle={toggleFilter}
            onIsolate={isolateFilter}
            onResetAll={resetFilters}
          />

          {/* Bottom-left: agent swatch legend */}
          <AgentSwatch graph={graph} />

          {/* Key hint row (bottom-right) — compact list of keyboard shortcuts */}
          <div
            className="absolute bottom-4 right-4 z-10 pointer-events-none font-mono text-[0.5rem] uppercase tracking-[0.18em] flex flex-col items-end gap-1"
            style={{ color: SCENE.creamDim, opacity: 0.55 }}
          >
            <div>
              <Kbd>Esc</Kbd> deselect
            </div>
            <div>
              <Kbd>R</Kbd> reset view
            </div>
            <div>
              <Kbd>Space</Kbd> {autoRotate ? "pause orbit" : "resume orbit"}
            </div>
          </div>

          {/* Selection detail no longer renders inside the scene — the
              Case Companion's Inspector mode is the canonical detail
              surface. See overlays/CaseCompanion/Inspector.tsx. */}
        </>
      )}
    </div>
  );
}

/** Tiny keyboard-key pill used in the bottom-right HUD. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block px-1.5 py-[1px] mr-1 border"
      style={{
        borderColor: SCENE.creamDim,
        color: SCENE.cream,
        lineHeight: 1.1,
      }}
    >
      {children}
    </span>
  );
}

/** Floating label that follows the hovered target's projected position.
 *  Uses drei <Html> to project a DOM element to an R3F world point. */
function HoverLabel({ target }: { target: SceneTarget }) {
  const hv = describeHoverRich(target);
  const pos = anchorForTarget(target);
  const accent = hv.accent;
  return (
    <Html position={pos} center style={{ pointerEvents: "none" }}>
      <div
        className="flex flex-col gap-1 px-3 py-2 border whitespace-nowrap"
        style={{
          background: "rgba(8,8,12,0.9)",
          borderColor: accent,
          color: SCENE.cream,
          transform: "translateY(-34px)",
          boxShadow: `0 0 14px ${accent}44`,
          minWidth: 140,
          maxWidth: 280,
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      >
        {/* Kicker — kind + accent dot */}
        <div
          className="font-mono uppercase flex items-center gap-2"
          style={{
            fontSize: "0.48rem",
            letterSpacing: "0.3em",
            color: accent,
          }}
        >
          <span
            aria-hidden
            style={{ width: 6, height: 6, background: accent, display: "inline-block" }}
          />
          <span>{hv.kicker}</span>
        </div>
        {/* Primary line — Fraunces italic */}
        <div
          className="font-display italic"
          style={{
            fontSize: "0.86rem",
            color: SCENE.cream,
            lineHeight: 1.25,
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {hv.primary}
        </div>
        {/* Optional secondary line — metadata or preview */}
        {hv.secondary && (
          <div
            className="font-mono"
            style={{
              fontSize: "0.56rem",
              letterSpacing: "0.08em",
              color: SCENE.creamDim,
              maxWidth: 260,
              whiteSpace: "normal",
              lineHeight: 1.35,
            }}
          >
            {hv.secondary}
          </div>
        )}
        {/* Click hint */}
        <div
          className="font-mono uppercase mt-0.5"
          style={{
            fontSize: "0.42rem",
            letterSpacing: "0.3em",
            color: SCENE.creamDim,
            opacity: 0.65,
          }}
        >
          Click to inspect
        </div>
      </div>
    </Html>
  );
}

interface HoverRich {
  kicker: string;
  primary: string;
  secondary?: string;
  accent: string;
}

function describeHoverRich(t: SceneTarget): HoverRich {
  switch (t.kind) {
    case "issue":
      return {
        kicker: "The matter",
        primary: t.data.title,
        secondary: `${(t.data.status ?? "").toUpperCase().replace(/_/g, " ")} · ${(t.data.priority ?? "").toUpperCase()}`,
        accent: SCENE.cream,
      };
    case "ancestor":
      return {
        kicker: `Parent · § ${t.data.identifier}`,
        primary: t.data.title,
        secondary: t.data.status.toUpperCase().replace(/_/g, " "),
        accent: SCENE.cream,
      };
    case "descendant":
      return {
        kicker: t.data.kind === "direct" ? `Sub · § ${t.data.identifier}` : `Mention · ${t.data.identifier}`,
        primary: t.data.title,
        secondary: t.data.status.toUpperCase().replace(/_/g, " "),
        accent: SCENE.cream,
      };
    case "run": {
      const r = t.data;
      return {
        kicker: `Run · ${r.agentName}`,
        primary: r.runId.slice(0, 12),
        secondary: `${r.payload.status.toUpperCase()}${r.isLive ? " · LIVE" : ""} · ${Math.round(r.sizeRatio * 100)}%`,
        accent: r.color,
      };
    }
    case "comment":
      return {
        kicker: `Correspondence · ${t.data.authorName}`,
        primary: t.data.bodyPreview.length > 80 ? t.data.bodyPreview.slice(0, 77) + "…" : t.data.bodyPreview,
        secondary: undefined,
        accent: t.data.color,
      };
    case "event":
      return {
        kicker: `Activity · ${t.data.actorName}`,
        primary: t.data.verb,
        secondary: undefined,
        accent: t.data.color,
      };
    case "approval":
      return {
        kicker: "Approval",
        primary: t.data.status.toUpperCase(),
        secondary: t.data.decidedAt ? "Decided" : "Awaiting decision",
        accent:
          t.data.status === "pending"
            ? "#FBBF24"
            : t.data.status === "approved"
              ? "#34D399"
              : "#F43F5E",
      };
  }
}

/** Rough world-space anchor for the hover label. */
function anchorForTarget(t: SceneTarget): [number, number, number] {
  switch (t.kind) {
    case "issue":
      return [0, 2.3, 0];
    case "ancestor":
      return [0, (t.data.depth + 1) * 2.4 + 0.6, 0];
    case "descendant": {
      const x = Math.cos(t.data.angle) * 4.2;
      const z = Math.sin(t.data.angle) * 4.2;
      return [x, -2.4 + 0.7, z];
    }
    case "run": {
      const x = Math.cos(t.data.orbitAngle) * 5.5;
      const z = Math.sin(t.data.orbitAngle) * 5.5;
      return [x, 0.9, z];
    }
    case "comment": {
      const x = Math.cos(t.data.orbitAngle) * 7.2;
      const z = Math.sin(t.data.orbitAngle) * 7.2;
      return [x, 1.5, z];
    }
    case "event": {
      const x = Math.cos(t.data.orbitAngle) * (7.2 - 0.45);
      const z = Math.sin(t.data.orbitAngle) * (7.2 - 0.45);
      return [x, 1.5, z];
    }
    case "approval":
      return [
        Math.cos(t.data.angle) * 2.5,
        3.8 + 0.6,
        Math.sin(t.data.angle) * 2.5,
      ];
  }
}

/**
 * Given a node's world-space anchor and kind, build a CameraPose that
 * frames it. The camera is positioned along the ray from the origin
 * through the anchor, pushed out by DISTANCE world units, with a
 * tightened FOV so the node fills the frame. The look-at target is
 * the anchor itself.
 *
 * This is intentionally kind-agnostic except for framing distance —
 * approvals sit up high so they need a bit more pullback; the central
 * issue pillar wants a neutral overview pose so you can still see its
 * context.
 */
function computeFocusPose(
  anchor: [number, number, number],
  kind: SceneTarget["kind"],
): { position: [number, number, number]; target: [number, number, number]; fov: number } {
  // Clicking the pillar itself → neutral overview, slightly pulled back
  // so the user can re-center without losing context.
  if (kind === "issue") {
    return {
      position: [6, 4.5, 18],
      target: [0, 0, 0],
      fov: 42,
    };
  }

  const [ax, ay, az] = anchor;
  const len = Math.hypot(ax, ay, az);
  // Fallback in the unlikely case the anchor is at the origin.
  if (len < 0.001) {
    return {
      position: [0, 2, 10],
      target: [0, 0, 0],
      fov: 36,
    };
  }

  // Distance from the anchor along its outward ray. Smaller nodes
  // (runs/comments) want closer framing; larger structures (ancestor
  // rings, descendant fan, approvals) want a bit more room.
  const distByKind: Record<SceneTarget["kind"], number> = {
    issue: 10,
    ancestor: 7,
    descendant: 7,
    run: 5.5,
    comment: 5.5,
    event: 5.5,
    approval: 6.5,
  };
  const dist = distByKind[kind] ?? 6;

  // Outward unit ray. Lift the camera slightly above the anchor so we
  // get a gentle top-down angle rather than looking directly into the
  // node's profile (which would show nothing behind it).
  const ux = ax / len;
  const uy = ay / len;
  const uz = az / len;
  const posX = ax + ux * dist;
  const posY = ay + uy * dist + 1.4;
  const posZ = az + uz * dist + 0.6;

  // Tighter FOV = tighter crop around the node. Keeps the subject
  // visually dominant so the user intuits "I'm looking at THIS".
  const fov = kind === "run" || kind === "comment" || kind === "event" ? 28 : 34;

  return {
    position: [posX, posY, posZ],
    target: [ax, ay, az],
    fov,
  };
}

/**
 * Given a graph and the currently-selected target, return the next
 * peer in the same kind bucket (`direction` = +1 next, -1 previous).
 * Returns null when there is no next peer (already at the edge or
 * the kind has only one element).
 *
 * Used by keyboard arrow-key sibling navigation and the FocusPanel
 * Prev/Next buttons — both share the same ordering as the graph
 * arrays, which are already sorted chronologically / by depth.
 */
function siblingOf(
  graph: IssueGraph,
  selected: SceneTarget,
  direction: 1 | -1,
): SceneTarget | null {
  switch (selected.kind) {
    case "run": {
      const idx = graph.runs.findIndex((r) => r.runId === selected.data.runId);
      const next = idx < 0 ? -1 : idx + direction;
      if (next < 0 || next >= graph.runs.length) return null;
      return { kind: "run", data: graph.runs[next] };
    }
    case "comment": {
      const idx = graph.comments.findIndex((c) => c.id === selected.data.id);
      const next = idx < 0 ? -1 : idx + direction;
      if (next < 0 || next >= graph.comments.length) return null;
      return { kind: "comment", data: graph.comments[next] };
    }
    case "event": {
      const idx = graph.events.findIndex((e) => e.id === selected.data.id);
      const next = idx < 0 ? -1 : idx + direction;
      if (next < 0 || next >= graph.events.length) return null;
      return { kind: "event", data: graph.events[next] };
    }
    case "ancestor": {
      const idx = graph.ancestors.findIndex((a) => a.id === selected.data.id);
      const next = idx < 0 ? -1 : idx + direction;
      if (next < 0 || next >= graph.ancestors.length) return null;
      return { kind: "ancestor", data: graph.ancestors[next] };
    }
    case "descendant": {
      const idx = graph.descendants.findIndex((d) => d.id === selected.data.id);
      const next = idx < 0 ? -1 : idx + direction;
      if (next < 0 || next >= graph.descendants.length) return null;
      return { kind: "descendant", data: graph.descendants[next] };
    }
    case "approval": {
      const idx = graph.approvals.findIndex((a) => a.id === selected.data.id);
      const next = idx < 0 ? -1 : idx + direction;
      if (next < 0 || next >= graph.approvals.length) return null;
      return { kind: "approval", data: graph.approvals[next] };
    }
    case "issue":
      return null;
  }
}

/** Pick a tint color for the focus halo that matches the target. */
function colorForTarget(t: SceneTarget): string {
  switch (t.kind) {
    case "issue":
      return statusColor(t.data.status);
    case "ancestor":
      return statusColor(t.data.status);
    case "descendant":
      return statusColor(t.data.status);
    case "run":
      return t.data.color;
    case "comment":
      return t.data.color;
    case "event":
      return t.data.color;
    case "approval":
      return t.data.status === "pending"
        ? "#FBBF24"
        : t.data.status === "approved"
          ? "#34D399"
          : "#F43F5E";
  }
}

/* CameraIntro — one-shot dolly on mount. Pushes the camera out to a
 * far distance on the FIRST frame, then eases back in to the default
 * resting distance over ~1.4s, then releases the camera forever. Gives
 * the scene a cinematic "falling into view" entrance without blocking
 * user interaction — the moment the user scrolls or drags, OrbitControls
 * damping absorbs it naturally. */
function CameraIntro({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  // null once the intro has finished. Until then holds {elapsed}.
  const stateRef = useRef<{ elapsed: number; primed: boolean } | null>({
    elapsed: 0,
    primed: false,
  });

  useFrame((_, delta) => {
    const st = stateRef.current;
    if (!st) return;
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const cam = ctrl.object as THREE.PerspectiveCamera;

    // First tick: shove the camera far out along its current viewing
    // vector so the very first rendered frame is the "far out" pose.
    if (!st.primed) {
      const offset = cam.position.clone().sub(ctrl.target);
      offset.setLength(40);
      cam.position.copy(ctrl.target).add(offset);
      ctrl.update();
      st.primed = true;
      return;
    }

    const DURATION = 1.4;
    st.elapsed += delta;
    const raw = Math.min(1, st.elapsed / DURATION);
    // easeOutCubic — fast decel at the end so the stop feels grounded.
    const t = 1 - Math.pow(1 - raw, 3);

    const offset = cam.position.clone().sub(ctrl.target);
    const currentDist = offset.length();
    if (currentDist < 0.001) return;
    const startDist = 40;
    const endDist = 18;
    const newDist = startDist + (endDist - startDist) * t;
    offset.setLength(newDist);
    cam.position.copy(ctrl.target).add(offset);
    ctrl.update();

    if (raw >= 1) stateRef.current = null;
  });

  return null;
}

/* CameraDolly — smoothly animates the camera distance ONLY during a
 * short transition window after the selection state flips. Once the
 * animation is done we release the camera entirely so the user's
 * scroll-zoom works normally. Rearms on the next selection change. */
/* CameraSway — handheld-style camera jitter. Subtle sinusoidal offset
 * on the camera position in camera-local X/Y so the scene feels
 * directed rather than mechanical. Critically, we apply AFTER OrbitControls
 * updates (useFrame default order), and we DON'T modify the controls
 * target — so the user's manual drag still works. We cache + restore
 * the previous frame's offset each tick.
 *
 * Honours prefers-reduced-motion: if set, no sway.
 */
function CameraSway() {
  const { camera } = useThree();
  const offsetRef = useRef(new THREE.Vector3(0, 0, 0));
  const reducedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useFrame((state) => {
    if (reducedRef.current) return;
    const t = state.clock.elapsedTime;
    // Undo last frame's offset so sway doesn't compound with OrbitControls.
    camera.position.sub(offsetRef.current);

    // New offset — two octaves of sinusoid, small amplitude.
    const ampX = 0.08;
    const ampY = 0.06;
    const sx =
      Math.sin(t * 0.37) * ampX +
      Math.sin(t * 0.13 + 1.2) * ampX * 0.5;
    const sy =
      Math.sin(t * 0.29 + 0.7) * ampY +
      Math.sin(t * 0.11 + 2.0) * ampY * 0.5;

    // Express in camera-local X + Y so sway follows the user's angle.
    const xAxis = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const yAxis = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    offsetRef.current.copy(xAxis.multiplyScalar(sx)).add(yAxis.multiplyScalar(sy));
    camera.position.add(offsetRef.current);
  });

  return null;
}

function CameraDolly({
  controlsRef,
  isSelected,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isSelected: boolean;
}) {
  // Animation state: null when idle, otherwise { target, remaining }.
  const animRef = useRef<{ target: number; remaining: number } | null>(null);
  const prevSelectedRef = useRef(isSelected);

  useEffect(() => {
    if (prevSelectedRef.current !== isSelected) {
      prevSelectedRef.current = isSelected;
      animRef.current = {
        target: isSelected ? 11 : 18,
        // ~900ms animation window — long enough to read, short enough
        // that the user's scroll wheel regains control quickly.
        remaining: 0.9,
      };
    }
  }, [isSelected]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const cam = ctrl.object as THREE.PerspectiveCamera;
    const offset = cam.position.clone().sub(ctrl.target);
    const currentDist = offset.length();
    if (currentDist < 0.001) return;

    // Exponential approach, capped so it finishes inside the window.
    const lerp = Math.min(1, delta * 3.2);
    const newDist = currentDist + (anim.target - currentDist) * lerp;
    offset.setLength(newDist);
    cam.position.copy(ctrl.target).add(offset);
    ctrl.update();

    anim.remaining -= delta;
    if (anim.remaining <= 0 || Math.abs(newDist - anim.target) < 0.05) {
      animRef.current = null;
    }
  });

  return null;
}
