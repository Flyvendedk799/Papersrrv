import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn, relativeTime } from "../../lib/utils";
import type { Issue, IssueComment, ActivityEvent, Agent } from "@paperclipai/shared";
import type { RunForIssue } from "../../api/activity";
import {
  buildGraph, layoutMind, buildEdges, makeCamera, project, updateCamera,
  focusOn, panCamera, clamp, Field, SpriteCache, statusColor, kindColor,
  DAG_DEPTH_STEP,
  type Camera, type MindNode, type Projected, type Edge, type Vec3,
} from "./thoughtSpace/mind";
import { authorColor } from "./thoughtSpace/authors";
import { ParticleGL } from "./thoughtSpace/particleGL";

type ThoughtKind = "issue" | "comment" | "activity" | "subissue" | "run" | "ancestor";

const BG = "#08080A";
const WARM = "#F2E6C4";
const WARM_DIM = "#7A6F50";
const ACID = "#FF6B4A";
const PARTICLE_MAX = 16000;
const PARTICLE_MIN = 9000;
const INTRO_MS = 2200;
const HIT_PAD = 14;

function adapt(n: number) {
  if (n < 150) return PARTICLE_MAX;
  if (n > 450) return PARTICLE_MIN;
  return Math.round(PARTICLE_MAX + (PARTICLE_MIN - PARTICLE_MAX) * ((n - 150) / 300));
}

function shortLabel(t: string, m = 80) { const s = (t ?? "").replace(/\s+/g, " ").trim(); return s.length <= m ? s : s.slice(0, m) + "…"; }
function easeOut(t: number) { const u = 1 - t; return 1 - u * u * u; }

interface Props {
  issue: Issue; comments?: IssueComment[]; activity?: ActivityEvent[];
  childIssues?: Issue[]; linkedRuns?: RunForIssue[]; agentMap: Map<string, Agent>; className?: string;
  /**
   * Per-thought-id opacity multiplier in [0,1]. Missing entries default
   * to 1.0. The Dossier can use this to dim/emphasise arbitrary
   * thoughts from outside the scene.
   */
  gateById?: Map<string, number>;
  /**
   * Called when the user clicks a thought in the scene (after the
   * internal selection + camera fly). The Dossier hooks this to
   * open its context card and scroll the DOM to the thought's twin
   * case-file row. When provided, the in-scene selection overlay
   * is suppressed — the Dossier owns the selection surface.
   */
  onNodeActivate?: (thoughtId: string) => void;
  /**
   * Fired while the auto-tour passes a thought — same intent as
   * `onNodeActivate` (open the context card, light chain trace) but
   * WITHOUT the DOM scroll side-effect. Differentiated so the tour
   * doesn't hijack the page's scroll position while narrating.
   * Pass `null` when featuring should clear.
   */
  onNodeFeature?: (thoughtId: string | null) => void;
  /**
   * One-line headline rendered as a big title card for the first
   * ~3 s of each auto-tour cycle ("the chapter opening"). Falls
   * back to the issue title when null/empty.
   */
  leadHeadline?: string | null;
}

export interface IssueThoughtSpaceHandle {
  /** Programmatically select a node by thought id (e.g. `comment:abc`,
   * `run:xyz`). Drives the camera fly-to via the existing selection
   * path, so the info panel opens too. */
  focusNodeId: (id: string | null) => void;
}

export const IssueThoughtSpace = memo(forwardRef<IssueThoughtSpaceHandle, Props>(
  function IssueThoughtSpace({ issue, comments, activity, childIssues, linkedRuns, agentMap, className, gateById, onNodeActivate, onNodeFeature, leadHeadline }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const graphRef = useRef<ReturnType<typeof buildGraph> | null>(null);
  const nodesRef = useRef<MindNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const fieldRef = useRef<Field | null>(null);
  const cameraRef = useRef(makeCamera(1, 1));
  const spritesRef = useRef(new SpriteCache());
  const glRef = useRef<ParticleGL | null>(null);

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const visibleRef = useRef(true);
  const seededRef = useRef(false);
  const lastSigRef = useRef("");
  const introStartRef = useRef(performance.now());
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  const hoverIdxRef = useRef(-1);
  const selectedIdxRef = useRef(-1);
  const dragRef = useRef<{ sx: number; sy: number; bY: number; bX: number; btX: number; btY: number; btZ: number; mode: "orbit" | "pan"; moved: boolean } | null>(null);

  const nebulaRef = useRef<CanvasGradient | null>(null);
  const vignetteRef = useRef<CanvasGradient | null>(null);
  const byIdRef = useRef(new Map<string, number>());

  const projSx = useRef(new Float32Array(64));
  const projSy = useRef(new Float32Array(64));
  const projSc = useRef(new Float32Array(64));
  const projVis = useRef(new Uint8Array(64));
  /** Per-node opacity multiplier, rebuilt on gateById / node changes. */
  const gateRef = useRef(new Float32Array(64));
  /** Active causal chain (target + transitive ancestors + descendants).
   * Empty set = no active chain = everything at full brightness. */
  const chainRef = useRef<Set<number>>(new Set());
  /** Target of the current chain; null when nothing hovered/selected. */
  const chainTargetRef = useRef<number>(-1);
  /** Max causal depth in the current graph. Drives the beacon x-pos
   * and the ambient brainwave sweep. Recomputed per rebuild. */
  const maxDepthRef = useRef(0);
  /** Non-empty depth buckets (incl negative for ancestors) with
   * their occupant counts. Drives chapter-marker rendering. */
  const depthMarkersRef = useRef<Array<{ depth: number; count: number }>>([]);
  /** Has the user interacted yet? After first click, the hint fades;
   * on 10s idle, it returns. */
  const lastInteractionRef = useRef(performance.now());
  /** Auto-tour: when the user is idle, the camera slow-pans through
   * the workflow so the scene self-narrates. Recomputed per frame
   * inside the render loop; surfaced to React via tourCaption state
   * so the chyron can describe what's in view. */
  const autoTourActiveRef = useRef(false);
  /** When did the current tour cycle start (used for title card
   * visibility). Reset on each idle→tour transition. */
  const tourCycleStartMsRef = useRef<number>(0);
  /** Current ping-pong phase (0..1 always forward for display).
   * Surfaced to React at 2 Hz so the progress bar can animate. */
  const tourPhaseRef = useRef<number>(0);
  /** Which node the tour is currently "featuring". Separate from the
   * pointer selection so the tour doesn't fire focusOn() (camera is
   * already under tour control). */
  const tourFeaturedIdxRef = useRef<number>(-1);
  const tourLastFeatureMsRef = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ label: string; kind: ThoughtKind; authorName: string } | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  /** What the auto-tour is currently showing. Null when not touring. */
  const [tourCaption, setTourCaption] = useState<string | null>(null);
  /** Null when not touring. 0..1 while touring (ping-pong phase). */
  const [tourProgress, setTourProgress] = useState<number | null>(null);
  /** True for the opening ~3 s of each tour cycle (title card). */
  const [titleCardVisible, setTitleCardVisible] = useState(false);

  /* ── Thoughts memo ── */
  const thoughts = useMemo(() => {
    const out: { id: string; kind: ThoughtKind; label: string; author: string; authorName: string; ts: number; isLive?: boolean; payload: unknown }[] = [];
    out.push({ id: `issue:${issue.id}`, kind: "issue", label: issue.title, author: "__issue__", authorName: "The matter", ts: new Date(issue.createdAt).getTime(), payload: issue });
    // Ancestors — parent chain above the issue; nearest ancestor first
    for (let ai = 0; ai < (issue.ancestors ?? []).length; ai++) {
      const anc = issue.ancestors![ai];
      out.push({
        id: `ancestor:${anc.id}`, kind: "ancestor",
        label: `${anc.identifier ?? anc.id.slice(0, 6)} · ${anc.title}`,
        author: "__ancestor__", authorName: "Ancestor",
        ts: -(ai + 1), // negative so they sort before everything
        payload: anc,
      });
    }
    for (const c of comments ?? []) {
      const n = c.authorAgentId ? agentMap.get(c.authorAgentId)?.name ?? "—" : "—";
      out.push({ id: `comment:${c.id}`, kind: "comment", label: `${n}: ${shortLabel(c.body)}`, author: c.authorAgentId ?? "unknown", authorName: n, ts: new Date(c.createdAt).getTime(), payload: c });
    }
    for (const e of activity ?? []) {
      if (e.action === "issue.comment_added") continue;
      const n = e.agentId ? agentMap.get(e.agentId)?.name ?? "—" : "system";
      out.push({ id: `activity:${e.id}`, kind: "activity", label: `${n} ${e.action.replace(/^issue\./, "").replace(/_/g, " ")}`, author: e.agentId ?? "system", authorName: n, ts: new Date(e.createdAt).getTime(), payload: e });
    }
    for (const ch of childIssues ?? [])
      out.push({ id: `subissue:${ch.id}`, kind: "subissue", label: `${ch.identifier ?? ch.id.slice(0, 6)} · ${ch.title}`, author: ch.assigneeAgentId ?? "__sub__", authorName: ch.assigneeAgentId ? agentMap.get(ch.assigneeAgentId)?.name ?? "Sub-matter" : "Sub-matter", ts: new Date(ch.createdAt).getTime(), payload: ch });
    for (const r of linkedRuns ?? []) {
      const live = r.status === "queued" || r.status === "running" || r.status === "in_progress";
      const n = agentMap.get(r.agentId)?.name ?? "agent";
      out.push({ id: `run:${r.runId}`, kind: "run", label: `${n} · ${r.status}`, author: r.agentId, authorName: n, ts: new Date(r.startedAt ?? r.createdAt ?? issue.createdAt).getTime(), isLive: live, payload: r });
    }
    return out;
  }, [issue, comments, activity, childIssues, linkedRuns, agentMap]);

  /* ── Rebuild mind ── */
  const rebuild = useCallback(() => {
    let sig = `${thoughts.length}|`;
    for (const t of thoughts) sig += `${t.id}:${t.ts}/`;
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    const graph = buildGraph(thoughts);
    const laid = layoutMind(thoughts, graph);
    const edges = buildEdges(laid, graph);
    graphRef.current = graph;
    nodesRef.current = laid;
    edgesRef.current = edges;
    // Build id→index map for edge rendering
    const idMap = new Map<string, number>();
    laid.forEach((nd, idx) => idMap.set(nd.thought.id, idx));
    byIdRef.current = idMap;
    const n = laid.length;
    if (projSx.current.length < n) { projSx.current = new Float32Array(n); projSy.current = new Float32Array(n); projSc.current = new Float32Array(n); projVis.current = new Uint8Array(n); }
    const wc = adapt(n);
    if (!fieldRef.current || fieldRef.current.n !== wc) { fieldRef.current = new Field(wc); seededRef.current = false; }
    if (!seededRef.current && n > 0) { fieldRef.current.seedAll(edges, laid); seededRef.current = true; }

    // Causal-depth summary for the ambient wave + beacon + chapter
    // markers. Skip the issue anchor itself (depth 0) from the
    // chapter markers — the anchor has its own visual treatment.
    let maxD = 0;
    const counts = new Map<number, number>();
    for (const nd of laid) {
      const d = graph.depth.get(nd.thought.id) ?? 0;
      if (d > maxD) maxD = d;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    maxDepthRef.current = maxD;
    depthMarkersRef.current = [...counts.entries()]
      .filter(([d]) => d !== 0)
      .sort((a, b) => a[0] - b[0])
      .map(([depth, count]) => ({ depth, count }));
  }, [thoughts]);

  /* ── IntersectionObserver pause ── */
  useEffect(() => {
    const el = wrapperRef.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting; }, { threshold: 0 });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  /* ── Resize ── */
  useEffect(() => {
    const wrapper = wrapperRef.current, canvas = canvasRef.current; if (!wrapper || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const apply = () => {
      const r = wrapper.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr);
      canvas.style.width = `${r.width}px`; canvas.style.height = `${r.height}px`;
      const gc = glCanvasRef.current;
      if (gc && !glRef.current) glRef.current = ParticleGL.tryCreate(gc);
      glRef.current?.resize(r.width, r.height, dpr);
      const cam = cameraRef.current; cam.centerX = r.width / 2; cam.centerY = r.height / 2;
      const ctx = canvas.getContext("2d"); if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const neb = ctx.createRadialGradient(r.width / 2, r.height / 2, 0, r.width / 2, r.height / 2, Math.min(r.width, r.height) * 0.55);
        neb.addColorStop(0, "rgba(242,230,196,0.10)"); neb.addColorStop(0.45, "rgba(242,230,196,0.035)"); neb.addColorStop(1, "transparent");
        nebulaRef.current = neb;
        const vig = ctx.createRadialGradient(r.width / 2, r.height / 2, Math.min(r.width, r.height) * 0.3, r.width / 2, r.height / 2, Math.max(r.width, r.height) * 0.72);
        vig.addColorStop(0, "transparent"); vig.addColorStop(1, BG);
        vignetteRef.current = vig;
      }
    };
    apply();
    const obs = new ResizeObserver(apply); obs.observe(wrapper); return () => obs.disconnect();
  }, []);

  /* ── Deferred rebuild ── */
  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) rebuild(); };
    const h = typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 400 }) : (setTimeout(run, 250) as unknown as number);
    return () => { cancelled = true; clearTimeout(h); if (typeof cancelIdleCallback === "function") cancelIdleCallback(h); };
  }, [rebuild]);

  /* ── Selection ── */
  useEffect(() => {
    const cam = cameraRef.current;
    if (!selectedId) { selectedIdxRef.current = -1; cam.tTarget.x = 0; cam.tTarget.y = 0; cam.tTarget.z = 0; cam.tZoom = 1; cam.userControlled = 0; return; }
    const idx = nodesRef.current.findIndex(n => n.thought.id === selectedId);
    selectedIdxRef.current = idx;
    if (idx >= 0) focusOn(cam, nodesRef.current[idx].pos, 1.7);
  }, [selectedId]);

  /* ── Gate (scrubber / focus-cluster opacity multipliers) ──
   * Rebuilt whenever the caller updates gateById or when the node set
   * itself changes (after rebuild). Cheap: one Float32 per node. */
  useEffect(() => {
    const nodes = nodesRef.current;
    if (gateRef.current.length < nodes.length) {
      gateRef.current = new Float32Array(nodes.length);
    }
    for (let i = 0; i < nodes.length; i++) {
      if (!gateById) { gateRef.current[i] = 1; continue; }
      const v = gateById.get(nodes[i].thought.id);
      gateRef.current[i] = v == null ? 1 : Math.max(0, Math.min(1, v));
    }
  }, [gateById, thoughts]);

  /* ── Imperative handle for Dossier / timeline click-to-fly. ── */
  useImperativeHandle(ref, () => ({
    focusNodeId: (id: string | null) => setSelectedId(id),
  }), []);

  /* ── Entry animation ── cinematic wide-shot that eases in to the
   * anchor so the first thing the user sees is "here's the whole
   * workflow" before it settles to a reading zoom. Setting cam.zoom
   * directly (not tZoom) skips the initial lerp spike. */
  useEffect(() => {
    const cam = cameraRef.current;
    cam.zoom = 0.5;
    cam.tZoom = 1.0;
    introStartRef.current = performance.now();
    lastInteractionRef.current = performance.now();
  }, []);

  /* ── Idle → resurface hint ── after 10 s of no interaction and
   * no active selection, bring the hint back so users who got
   * stuck can find their way. */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (selectedId) return;
      if (hintVisible) return;
      if (performance.now() - lastInteractionRef.current > 10_000) {
        setHintVisible(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [selectedId, hintVisible]);

  /* ── Auto-tour caption ── maps the auto-tour camera's current
   * target.x to a human-readable one-liner describing which slice
   * of the story the viewer is looking at. Updates at 2 Hz — the
   * chyron text shouldn't flicker per-frame. Actual camera panning
   * happens inside the render loop so it stays in sync with the
   * visible frame rate. */
  useEffect(() => {
    const TITLE_CARD_MS = 3000;
    const id = window.setInterval(() => {
      if (selectedId) {
        if (tourCaption !== null) setTourCaption(null);
        if (tourProgress !== null) setTourProgress(null);
        if (titleCardVisible) setTitleCardVisible(false);
        return;
      }
      const idleMs = performance.now() - lastInteractionRef.current;
      const TOUR_IDLE_MS = 15_000;
      if (idleMs < TOUR_IDLE_MS) {
        if (tourCaption !== null) setTourCaption(null);
        if (tourProgress !== null) setTourProgress(null);
        if (titleCardVisible) setTitleCardVisible(false);
        return;
      }
      // Read the already-projected-in-render auto-tour state.
      if (!autoTourActiveRef.current) return;

      // Title card — on for the first ~3 s of this cycle.
      const cycleAgeMs = performance.now() - tourCycleStartMsRef.current;
      const shouldShowTitle = cycleAgeMs < TITLE_CARD_MS;
      if (shouldShowTitle !== titleCardVisible) setTitleCardVisible(shouldShowTitle);

      // Progress bar — follows the ping-pong phase.
      const nextProgress = tourPhaseRef.current;
      if (tourProgress === null || Math.abs(nextProgress - tourProgress) > 0.01) {
        setTourProgress(nextProgress);
      }

      // Prefer a thought-specific caption when a node is featured —
      // that's the richest narration ("Ada wrote: …" over a generic
      // chapter label). Fall back to zone-based text only when the
      // tour is between chapters or on an empty part of the plane.
      const featIdx = tourFeaturedIdxRef.current;
      let next: string | null = null;
      if (featIdx >= 0 && nodesRef.current[featIdx]) {
        const t = nodesRef.current[featIdx].thought;
        switch (t.kind) {
          case "ancestor": {
            const anc = t.payload as { identifier?: string | null; title: string };
            next = `Upstream · ${anc.identifier ?? ""} ${shortLabel(anc.title, 40)}`.trim();
            break;
          }
          case "issue": {
            next = `The matter — ${shortLabel(issue.title ?? "", 52)}`;
            break;
          }
          case "subissue": {
            const sub = t.payload as Issue;
            next = `Sub-matter · ${sub.identifier ?? ""} ${shortLabel(sub.title, 40)}`.trim();
            break;
          }
          case "run": {
            const r = t.payload as RunForIssue;
            next = r.status === "running" || r.status === "queued" || r.status === "in_progress"
              ? `${t.authorName} · live run`
              : `${t.authorName} · run ${r.status}`;
            break;
          }
          case "comment": {
            const body = (t.payload as { body?: string }).body ?? "";
            next = `${t.authorName}: ${shortLabel(body, 56)}`;
            break;
          }
        }
      }

      if (!next) {
        // Zone-based fallback (empty stretch between chapters).
        const maxD = maxDepthRef.current;
        const ancN = (issue.ancestors ?? []).length;
        const targetX = cameraRef.current.target.x;
        const xLeft = -ancN * DAG_DEPTH_STEP;
        const xRight = (maxD + 1) * DAG_DEPTH_STEP;
        const norm = xRight > xLeft ? (targetX - xLeft) / (xRight - xLeft) : 0.5;
        if (targetX < -DAG_DEPTH_STEP * 0.5) {
          next = "Upstream — what led here";
        } else if (targetX < DAG_DEPTH_STEP * 0.5) {
          next = "The matter";
        } else if (norm < 0.55) {
          next = "Early thoughts";
        } else if (norm < 0.85) {
          next = "Recent motion";
        } else {
          next =
            issue.status === "done" || issue.status === "cancelled"
              ? "Resolution — where the journey ends"
              : issue.status === "blocked"
                ? "Held — blocked at the desk"
                : "Heading — where this is going";
        }
      }

      if (next !== tourCaption) setTourCaption(next);
    }, 500);
    return () => window.clearInterval(id);
  }, [selectedId, tourCaption, tourProgress, titleCardVisible, issue.ancestors, issue.status]);

  /* ── Pointer handlers ── */
  const hitTest = useCallback((px: number, py: number) => {
    const sx = projSx.current, sy = projSy.current, sc = projSc.current, vis = projVis.current;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nodesRef.current.length; i++) {
      if (!vis[i]) continue;
      const rr = nodesRef.current[i].radius * sc[i] + HIT_PAD;
      const dx = sx[i] - px, dy = sy[i] - py, d = dx * dx + dy * dy;
      if (d < rr * rr && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const cam = cameraRef.current;
    if (dragRef.current) {
      const d = dragRef.current, dx = px - d.sx, dy = py - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved) {
        if (d.mode === "pan") { cam.tTarget.x = d.btX; cam.tTarget.y = d.btY; cam.tTarget.z = d.btZ; panCamera(cam, dx, dy); cam.target.x = cam.tTarget.x; cam.target.y = cam.tTarget.y; cam.target.z = cam.tTarget.z; }
        else { cam.tRotY = d.bY + dx * 0.008; cam.tRotX = d.bX - dy * 0.006; cam.rotY = cam.tRotY; cam.rotX = cam.tRotX; }
        cam.userControlled = 5000;
        if (hoverIdxRef.current >= 0) { hoverIdxRef.current = -1; setHoverInfo(null); }
      }
      return;
    }
    const idx = hitTest(px, py);
    if (idx >= 0) {
      if (hoverIdxRef.current !== idx) {
        hoverIdxRef.current = idx;
        const n = nodesRef.current[idx].thought;
        setHoverInfo({ label: n.label, kind: n.kind as ThoughtKind, authorName: n.authorName });
      }
    } else if (hoverIdxRef.current >= 0) { hoverIdxRef.current = -1; setHoverInfo(null); }
  }, [hitTest]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setHintVisible(false);
    lastInteractionRef.current = performance.now();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const cam = cameraRef.current;
    const isPan = e.shiftKey || e.button === 1 || e.button === 2;
    dragRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top, bY: cam.rotY, bX: cam.rotX, btX: cam.target.x, btY: cam.target.y, btZ: cam.target.z, mode: isPan ? "pan" : "orbit", moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current; dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) {
      const idx = hitTest(d.sx, d.sy);
      if (idx >= 0) {
        const thoughtId = nodesRef.current[idx].thought.id;
        setSelectedId(thoughtId);
        onNodeActivate?.(thoughtId);
      } else if (selectedIdxRef.current >= 0) {
        setSelectedId(null);
      }
    }
  }, [hitTest, onNodeActivate]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const cam = cameraRef.current; cam.tZoom = clamp(cam.tZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.18, 8); cam.userControlled = 3000; };
    c.addEventListener("wheel", onWheel, { passive: false }); return () => c.removeEventListener("wheel", onWheel);
  }, []);

  /* ── Render loop ── */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (document.hidden || !visibleRef.current) return;
      const dtMs = Math.min(64, now - lastTimeRef.current); lastTimeRef.current = now;
      const dt = dtMs / 1000;
      const { w, h, dpr } = sizeRef.current; if (!w || !h) return;
      const mind = nodesRef.current, field = fieldRef.current, edges = edgesRef.current;
      if (!field || mind.length === 0) return;

      const cam = cameraRef.current; cam.centerX = w / 2; cam.centerY = h / 2;
      const intro = easeOut(clamp((now - introStartRef.current) / INTRO_MS, 0, 1));

      // ── Auto-tour ── after 15 s of idle and no selection, the
      // camera slow-pans through the workflow in a ping-pong cycle
      // (20 s forward, 20 s back, …). Drives the tour chyron. Any
      // interaction resets lastInteractionRef and snaps us out.
      const idleMs = now - lastInteractionRef.current;
      const TOUR_IDLE_MS = 15_000;
      const TOUR_SPAN_MS = 20_000;
      const maxD = maxDepthRef.current;
      const ancN = (issue.ancestors ?? []).length;
      if (!selectedId && idleMs > TOUR_IDLE_MS && maxD >= 0 && nodesRef.current.length > 1) {
        if (!autoTourActiveRef.current) {
          // Transition idle → tour. Start a new cycle clock so the
          // title card fires its opening at *this* moment.
          tourCycleStartMsRef.current = now;
        }
        autoTourActiveRef.current = true;
        const elapsed = idleMs - TOUR_IDLE_MS;
        const cycle = elapsed % (TOUR_SPAN_MS * 2);
        const phase = cycle < TOUR_SPAN_MS ? cycle / TOUR_SPAN_MS : 2 - cycle / TOUR_SPAN_MS;
        tourPhaseRef.current = phase;
        // Smoothstep for gentler arrivals at each end.
        const eased = phase * phase * (3 - 2 * phase);
        const xLeft = -ancN * DAG_DEPTH_STEP - 60;
        const xRight = (maxD + 1) * DAG_DEPTH_STEP + 60;
        cam.tTarget.x = xLeft + (xRight - xLeft) * eased;
        cam.tTarget.y = 0;
        cam.tTarget.z = 0;
        cam.tZoom = 0.82;

        // Featured-thought tracking. Every ~400 ms while touring,
        // find the closest non-activity thought to the camera's
        // current X and light it up — chain trace + Dossier
        // context card. Activity nodes are skipped (noise); a
        // hysteresis threshold (< 0.75 × DEPTH_STEP world units)
        // prevents flicker between columns.
        if (now - tourLastFeatureMsRef.current > 400) {
          tourLastFeatureMsRef.current = now;
          const tx = cam.target.x;
          let bestIdx = -1;
          let bestDist = Infinity;
          const hysteresis = DAG_DEPTH_STEP * 0.75;
          const nodesArr = nodesRef.current;
          for (let i = 0; i < nodesArr.length; i++) {
            const k = nodesArr[i].thought.kind;
            if (k === "activity") continue;
            const d = Math.abs(nodesArr[i].pos.x - tx);
            if (d < bestDist && d < hysteresis) { bestDist = d; bestIdx = i; }
          }
          if (bestIdx !== tourFeaturedIdxRef.current) {
            tourFeaturedIdxRef.current = bestIdx;
            // Drive the chain trace via selectedIdxRef — but skip
            // the `selectedId` React state so the selection effect
            // doesn't fire focusOn() and fight the tour camera.
            selectedIdxRef.current = bestIdx;
            const id = bestIdx >= 0 ? nodesArr[bestIdx].thought.id : null;
            onNodeFeature?.(id);
          }
        }
      } else {
        if (autoTourActiveRef.current) {
          // Tour just ended — clear featured so chain-trace resets
          // and the Dossier's context card returns to idle.
          autoTourActiveRef.current = false;
          if (tourFeaturedIdxRef.current !== -1) {
            tourFeaturedIdxRef.current = -1;
            if (selectedIdxRef.current !== -1 && !selectedId) {
              selectedIdxRef.current = -1;
            }
            onNodeFeature?.(null);
          }
        }
      }

      updateCamera(cam, dt);

      const hIdx = hoverIdxRef.current, sIdx = selectedIdxRef.current;
      const focusIdx = sIdx >= 0 ? sIdx : hIdx;
      let attract: Vec3 | null = null, attractStr = 0;
      if (focusIdx >= 0) { attract = mind[focusIdx].pos; attractStr = sIdx >= 0 ? 0.5 : 0.85; }
      field.update(dt, edges, mind, attract, attractStr, now * 0.001);

      // ── Rebuild causal chain when the hover/select target changes.
      // Chain = target + transitive ancestors (via graph.parents) +
      // transitive descendants (via graph.children). When populated,
      // nodes outside the chain dim to highlight the causal path.
      if (focusIdx !== chainTargetRef.current) {
        chainTargetRef.current = focusIdx;
        const chain = chainRef.current;
        chain.clear();
        if (focusIdx >= 0 && graphRef.current) {
          const byId = byIdRef.current;
          const g = graphRef.current;
          const rootId = mind[focusIdx].thought.id;
          chain.add(focusIdx);
          // Upstream: walk parents recursively
          const upStack: string[] = [rootId];
          const seenUp = new Set<string>([rootId]);
          while (upStack.length) {
            const id = upStack.pop()!;
            const ps = g.parents.get(id) ?? [];
            for (const p of ps) {
              if (seenUp.has(p)) continue;
              seenUp.add(p);
              const pi = byId.get(p);
              if (pi !== undefined) chain.add(pi);
              upStack.push(p);
            }
          }
          // Downstream: walk children recursively
          const downStack: string[] = [rootId];
          const seenDown = new Set<string>([rootId]);
          while (downStack.length) {
            const id = downStack.pop()!;
            const ks = g.children.get(id) ?? [];
            for (const c of ks) {
              if (seenDown.has(c)) continue;
              seenDown.add(c);
              const ci = byId.get(c);
              if (ci !== undefined) chain.add(ci);
              downStack.push(c);
            }
          }
        }
      }
      const chain = chainRef.current;
      const chainActive = chain.size > 0;

      // Project nodes
      const sx = projSx.current, sy = projSy.current, sc = projSc.current, vis = projVis.current;
      const cY = Math.cos(cam.rotY), sYR = Math.sin(cam.rotY), cX = Math.cos(cam.rotX), sXR = Math.sin(cam.rotX);
      const fLen = cam.focalLength, zoom = cam.zoom, cx = cam.centerX, cy = cam.centerY;
      const tx = cam.target.x, ty = cam.target.y, tz = cam.target.z;
      for (let i = 0; i < mind.length; i++) {
        const n = mind[i], wx = n.pos.x - tx, wy = n.pos.y - ty, wz = n.pos.z - tz;
        const x1 = wx * cY + wz * sYR, z1 = -wx * sYR + wz * cY;
        const y2 = wy * cX - z1 * sXR, z2 = wy * sXR + z1 * cX;
        const d = fLen + z2;
        if (d <= 20) { vis[i] = 0; continue; }
        const s = (fLen / d) * zoom;
        sx[i] = x1 * s + cx; sy[i] = y2 * s + cy; sc[i] = s; vis[i] = 1;
      }

      // WebGL particles — the SOLE visual layer. 60k identical dots
      // flowing through a brain-shaped volume along causal edges.
      const gl = glRef.current;
      if (gl) gl.render(field.pos, field.n, { targetX: tx, targetY: ty, targetZ: tz, rotY: cam.rotY, rotX: cam.rotX, focal: fLen, zoom, centerX: cx, centerY: cy }, 0.65 + intro * 0.35, 0.22, now * 0.001);

      // 2D canvas — structural overlay: edges, nodes, labels, vignette.
      // These landmarks give the particle field READABLE STRUCTURE:
      // what kind of element, who created it, what status, how connected.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const neb = nebulaRef.current; if (neb) { ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h); }
      const sprites = spritesRef.current;

      // ── Luminous edge filaments ──
      // Glowing lines between connected nodes — with canvas shadow
      // for the glow effect.  Only structural edges, not activity noise.
      const graph = graphRef.current;
      const gate = gateRef.current;
      const maxDepth = maxDepthRef.current;
      // Amplify the active causal chain; dim everything outside it.
      const chainBoost = 1.35;  // chain edges a touch brighter
      const offChainDim = 0.28; // non-chain ~28% brightness
      // Animated pulse phase for chain edges — sinusoid 0.4..1.0 over
      // ~1.2 s so brainwaves look like they're firing along the chain.
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.005);
      // Ambient brainwave sweep — a pulse wave travels root → leaf
      // every ~6 s, independent of hover. An edge at normalised
      // causal depth d is "firing" when the wave phase passes near d.
      const WAVE_MS = 6000;
      const wavePhase = (now % WAVE_MS) / WAVE_MS;
      const waveBoostFor = (childDepth: number): number => {
        if (maxDepth <= 0) return 1;
        const normD = Math.max(0, childDepth) / Math.max(1, maxDepth);
        const diff = Math.min(Math.abs(wavePhase - normD), 1 - Math.abs(wavePhase - normD));
        return diff < 0.12 ? 1 + (0.12 - diff) * 2.6 : 1;
      };
      // Pulse beads: stateless traveling dots on every causal edge,
      // 3 per edge staggered in phase. The most visible "signal
      // flowing" affordance — reads as literal brainwaves moving
      // parent → child. Phase offset per edge so beads don't all
      // travel in sync.
      const BEAD_COUNT = 3;
      const BEAD_PERIOD_MS = 2800;
      const drawBeads = (
        x1: number, y1: number, x2: number, y2: number,
        color: string, baseAlpha: number,
        phaseOffset: number, inChain: boolean,
      ) => {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 18) return; // too short for beads to read
        const radius = inChain ? 2.5 : 1.8;
        for (let b = 0; b < BEAD_COUNT; b++) {
          const raw = ((now + phaseOffset + (b * BEAD_PERIOD_MS) / BEAD_COUNT) % BEAD_PERIOD_MS) / BEAD_PERIOD_MS;
          // sin-shaped alpha so beads fade in at the parent and out
          // at the child — avoids pop-in/pop-out.
          const beadAlpha = Math.sin(raw * Math.PI) * baseAlpha;
          if (beadAlpha < 0.04) continue;
          const bx = x1 + dx * raw;
          const by = y1 + dy * raw;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = inChain ? 8 : 5;
          ctx.globalAlpha = beadAlpha * intro;
          ctx.beginPath();
          ctx.arc(bx, by, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
      };
      if (graph && intro > 0.1) {
        ctx.lineCap = "round";

        // Helper: draw a glowing line; extra `g` multiplier dims the
        // whole line when either endpoint is gated (scrubber/focus),
        // `inChain` adds the chain boost/pulse when active.
        const glowLine = (x1: number, y1: number, x2: number, y2: number, col: string, a: number, w: number, g: number, inChain: boolean) => {
          const mul = chainActive
            ? (inChain ? chainBoost * pulse : offChainDim)
            : 1;
          ctx.shadowColor = col; ctx.shadowBlur = inChain && chainActive ? 16 : 10;
          ctx.strokeStyle = col; ctx.lineWidth = inChain && chainActive ? w * 1.4 : w;
          ctx.globalAlpha = a * intro * g * mul;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
        };

        // Causal edges (skip activity↔activity)
        for (const [pid, kids] of graph.children) {
          const pi = byIdRef.current.get(pid);
          if (pi === undefined || !vis[pi]) continue;
          const gp = gate[pi] ?? 1;
          for (const cid of kids) {
            const ci = byIdRef.current.get(cid);
            if (ci === undefined || !vis[ci]) continue;
            const gc = gate[ci] ?? 1;
            const gEdge = Math.min(gp, gc);
            const inChain = chainActive && chain.has(pi) && chain.has(ci);
            const pk = mind[pi].thought.kind, ck = mind[ci].thought.kind;
            if (pk === "activity" && ck === "activity") continue;
            // Ambient brainwave: give this edge a transient boost
            // when the depth sweep passes through its child.
            const childD = graph.depth.get(mind[ci].thought.id) ?? 0;
            const wb = waveBoostFor(childD);
            // Convergence lift — children with multiple parents get
            // a small bump so "thoughts combining" is legible.
            const childParents = graph.parents.get(mind[ci].thought.id)?.length ?? 1;
            const convergenceLift = childParents > 1 ? 1.35 : 1;
            if (pk === "activity" || ck === "activity") {
              // Dim for activity-involved edges — still honour chain + wave.
              const mul = chainActive ? (inChain ? chainBoost * pulse : offChainDim) : 1;
              ctx.strokeStyle = WARM_DIM; ctx.lineWidth = 0.5;
              ctx.globalAlpha = 0.08 * intro * gEdge * mul * wb; ctx.shadowBlur = 0;
              ctx.beginPath(); ctx.moveTo(sx[pi], sy[pi]); ctx.lineTo(sx[ci], sy[ci]); ctx.stroke();
            } else {
              glowLine(sx[pi], sy[pi], sx[ci], sy[ci], WARM, 0.18 * wb * convergenceLift, 1.0, gEdge, inChain);
              // Pulse beads — dominant visual cue for "signal
              // flowing". Base alpha lifts with wave + chain gate.
              const beadBase = 0.55 * gEdge * (chainActive ? (inChain ? 1 : offChainDim * 0.9) : 1) * wb;
              if (beadBase > 0.05) {
                drawBeads(sx[pi], sy[pi], sx[ci], sy[ci], WARM, beadBase, pi * 131 + ci * 17, inChain);
              }
            }
          }
        }

        // Ancestor chain — golden luminous thread (beads flow
        // ancestor → issue, the "upstream cause" direction).
        const ancNodes: number[] = [];
        for (let i = 0; i < mind.length; i++) if (mind[i].thought.kind === "ancestor" && vis[i]) ancNodes.push(i);
        const gIssue = gate[0] ?? 1;
        if (ancNodes.length > 0 && vis[0]) {
          const g0 = Math.min(gIssue, gate[ancNodes[0]] ?? 1);
          const inC0 = chainActive && chain.has(0) && chain.has(ancNodes[0]);
          glowLine(sx[0], sy[0], sx[ancNodes[0]], sy[ancNodes[0]], "#C8A96E", 0.45, 1.8, g0, inC0);
          drawBeads(sx[ancNodes[0]], sy[ancNodes[0]], sx[0], sy[0], "#C8A96E", 0.75 * g0, ancNodes[0] * 53, inC0);
          for (let ai = 1; ai < ancNodes.length; ai++) {
            const gch = Math.min(gate[ancNodes[ai - 1]] ?? 1, gate[ancNodes[ai]] ?? 1);
            const inC = chainActive && chain.has(ancNodes[ai - 1]) && chain.has(ancNodes[ai]);
            glowLine(sx[ancNodes[ai - 1]], sy[ancNodes[ai - 1]], sx[ancNodes[ai]], sy[ancNodes[ai]], "#C8A96E", 0.4, 1.5, gch, inC);
            drawBeads(sx[ancNodes[ai]], sy[ancNodes[ai]], sx[ancNodes[ai - 1]], sy[ancNodes[ai - 1]], "#C8A96E", 0.7 * gch, ancNodes[ai] * 53, inC);
          }
        }

        // Subissue connections — emerald luminous threads (beads
        // flow issue → sub-matter, the "spawned work" direction).
        for (let i = 0; i < mind.length; i++) {
          if (mind[i].thought.kind === "subissue" && vis[i] && vis[0]) {
            const gch = Math.min(gIssue, gate[i] ?? 1);
            const inC = chainActive && chain.has(0) && chain.has(i);
            glowLine(sx[0], sy[0], sx[i], sy[i], "#3FCF8E", 0.35, 1.4, gch, inC);
            drawBeads(sx[0], sy[0], sx[i], sy[i], "#3FCF8E", 0.65 * gch, i * 83, inC);
          }
        }
        ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineCap = "butt";
      }

      // ── Chapter depth markers ──
      // Thin vertical guides behind the nodes, one per depth bucket.
      // Gives scale without clutter: a big workflow reads as many
      // columns; a small one reads as two.
      if (intro > 0.4 && graph) {
        const markers = depthMarkersRef.current;
        for (const m of markers) {
          const worldX = m.depth * DAG_DEPTH_STEP;
          // Project two y-anchors (top 240, bottom -260) at this X
          // and Z=0, draw a 2D line between. Using project() from
          // mind.ts keeps us in sync with the camera transform.
          const top = project(cam, worldX, 240, 0);
          const bot = project(cam, worldX, -260, 0);
          if (top.behind || bot.behind) continue;
          ctx.strokeStyle = WARM;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.045 * intro;
          ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(top.sx, top.sy); ctx.lineTo(bot.sx, bot.sy); ctx.stroke();
          ctx.setLineDash([]);
          if (intro > 0.7 && cam.zoom >= 0.7) {
            ctx.font = "8px ui-monospace, monospace";
            ctx.fillStyle = WARM_DIM;
            ctx.globalAlpha = 0.55 * intro;
            ctx.fillText(
              m.depth < 0 ? `U${-m.depth} · ${m.count}` : `D${m.depth} · ${m.count}`,
              top.sx + 4,
              top.sy + 6,
            );
          }
        }
        ctx.globalAlpha = 1;
      }

      // ── Node markers: hard crystal core + soft halo ──
      // The STARS of the show. Each structural node gets a bright hard
      // center circle with a soft radial glow behind it.  Activities are
      // skipped — they're background texture, not landmarks.
      for (let i = 0; i < mind.length; i++) {
        if (!vis[i]) continue;
        const t = mind[i].thought;
        const isAnchor = t.kind === "issue";
        // Anchor boost: the issue node is the "one thing that must
        // always be legible". 1.6× radius, full alpha regardless of
        // chain trace or scrubber gate, and it pulses at half the
        // chain-edge rate so it reads as the heartbeat of the scene.
        const anchorScale = isAnchor ? 1.6 : 1;
        const nodeR = mind[i].radius * sc[i] * anchorScale;
        if (nodeR < 0.5) continue;
        let g = gate[i] ?? 1;
        if (chainActive && !isAnchor) g *= chain.has(i) ? pulse : offChainDim;
        if (isAnchor) g = 1; // anchor never dims
        // Sequential node flash — when the brainwave sweep passes
        // this node's depth, it lights up. The whole DAG fires in
        // causal order, visibly.
        if (!isAnchor && graph) {
          const nd = graph.depth.get(t.id) ?? 0;
          g *= waveBoostFor(nd);
        }
        if (g <= 0.001) continue;
        let color: string; let alpha: number; let coreR: number; let haloR: number;
        switch (t.kind as ThoughtKind) {
          case "issue": {
            const iss = t.payload as Issue;
            color = statusColor(iss.status);
            alpha = 0.95; coreR = Math.max(5, nodeR * 0.9); haloR = Math.max(16, nodeR * 3.2);
            break;
          }
          case "run":
            color = authorColor(t.author);
            alpha = t.isLive ? 0.9 : 0.65;
            coreR = Math.max(3, nodeR * 0.55); haloR = Math.max(10, nodeR * 2.2);
            break;
          case "comment":
            color = authorColor(t.author);
            alpha = 0.45;
            coreR = Math.max(2, nodeR * 0.35); haloR = Math.max(6, nodeR * 1.4);
            break;
          case "subissue": {
            const sub = t.payload as Issue;
            color = statusColor(sub.status);
            alpha = 0.8; coreR = Math.max(3.5, nodeR * 0.6); haloR = Math.max(12, nodeR * 2.4);
            break;
          }
          case "ancestor":
            color = "#C8A96E";
            alpha = 0.7; coreR = Math.max(3, nodeR * 0.5); haloR = Math.max(10, nodeR * 2.0);
            break;
          default: continue; // activity — skip
        }
        // 1. Soft halo (glow sprite behind)
        const sprite = sprites.get(color, 96, 0.25);
        ctx.globalAlpha = alpha * 0.55 * intro * g;
        ctx.drawImage(sprite, sx[i] - haloR, sy[i] - haloR, haloR * 2, haloR * 2);
        // 2. Hard crystal core (filled circle)
        ctx.globalAlpha = alpha * intro * g;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sx[i], sy[i], coreR, 0, Math.PI * 2); ctx.fill();
        // 3. Bright inner highlight (white dot) for issue/run/subissue
        if (t.kind === "issue" || t.kind === "run" || t.kind === "subissue") {
          ctx.globalAlpha = alpha * 0.5 * intro * g;
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath(); ctx.arc(sx[i], sy[i], coreR * 0.35, 0, Math.PI * 2); ctx.fill();
        }
        // 4. Convergence glyph — when multiple upstream thoughts
        // combine into this one, render a ring with inward ticks
        // (one per parent). Makes "thoughts joining" legible at a
        // glance beyond the edge-brightness lift.
        if (!isAnchor && graph) {
          const parentCount = graph.parents.get(t.id)?.length ?? 0;
          if (parentCount >= 2) {
            const ringR = Math.max(8, haloR * 0.45);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.globalAlpha = alpha * 0.5 * intro * g;
            ctx.beginPath();
            ctx.arc(sx[i], sy[i], ringR, 0, Math.PI * 2);
            ctx.stroke();
            // Inward tick marks — one per parent, spaced evenly.
            const maxTicks = Math.min(parentCount, 6);
            for (let pn = 0; pn < maxTicks; pn++) {
              const ang = (pn / maxTicks) * Math.PI * 2 - Math.PI / 2;
              const cos = Math.cos(ang), sin = Math.sin(ang);
              const r1 = ringR + 4;
              const r2 = ringR - 1.5;
              ctx.beginPath();
              ctx.moveTo(sx[i] + cos * r1, sy[i] + sin * r1);
              ctx.lineTo(sx[i] + cos * r2, sy[i] + sin * r2);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalAlpha = 1;

      // ── Hover / selection ring ──
      if (hIdx >= 0 && vis[hIdx]) {
        const r = mind[hIdx].radius * sc[hIdx] * 1.4;
        ctx.strokeStyle = ACID; ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7 * intro;
        ctx.beginPath(); ctx.arc(sx[hIdx], sy[hIdx], Math.max(10, r), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (sIdx >= 0 && vis[sIdx]) {
        const r = mind[sIdx].radius * sc[sIdx] * 1.8;
        ctx.strokeStyle = ACID; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85 * intro;
        ctx.beginPath(); ctx.arc(sx[sIdx], sy[sIdx], Math.max(14, r), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.4 * intro; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(sx[sIdx], sy[sIdx], Math.max(6, r * 0.5), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 1;

      // Vignette
      const vig = vignetteRef.current; if (vig) { ctx.globalAlpha = 0.85; ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }

      // ── Labels ── (drawn OVER vignette so they stay legible)
      // Subissues get identifier + short title; live runs get agent name;
      // the central issue gets its identifier; ancestors get identifiers.
      // Text shadow ensures readability over bright particle trails.
      if (intro > 0.3) {
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
        // LOD: when the viewer zooms out past ~0.7× only the anchor,
        // the resolution beacon, and chain-traced nodes keep their
        // labels. Everything else goes quiet so the scene doesn't
        // become a wall of text at far zoom.
        const lodZoom = cam.zoom < 0.7;
        for (let i = 0; i < mind.length; i++) {
          if (!vis[i]) continue;
          const t = mind[i].thought;
          const isAnchor = t.kind === "issue";
          const anchorScale = isAnchor ? 1.6 : 1;
          const nr = mind[i].radius * sc[i] * anchorScale;
          if (nr < 2) continue;
          if (lodZoom && !isAnchor && !(chainActive && chain.has(i))) continue;
          let label = ""; let lAlpha = 0; let lColor = WARM; let fontSize = 9;
          let secondaryLabel: string | null = null;
          switch (t.kind as ThoughtKind) {
            case "issue": {
              const iss = t.payload as Issue;
              label = iss.identifier ?? "";
              lAlpha = 0.95; lColor = WARM; fontSize = 12;
              // Anchor title — the "chapter opening" of the story.
              secondaryLabel = shortLabel(iss.title ?? "", 48);
              break;
            }
            case "subissue": {
              const sub = t.payload as Issue;
              label = `${sub.identifier ?? ""} ${shortLabel(sub.title, 22)}`;
              lAlpha = 0.75; lColor = statusColor(sub.status); fontSize = 9;
              break;
            }
            case "run": {
              if (t.isLive) { label = `● ${t.authorName}`; lAlpha = 0.85; lColor = "#E09437"; fontSize = 9; }
              else { label = t.authorName; lAlpha = 0.45; fontSize = 8; }
              break;
            }
            case "comment": {
              // Short "@author: first words" tag. Keeps comments
              // readable without a hover.
              const body = (t.payload as { body?: string }).body ?? "";
              label = `${t.authorName} — ${shortLabel(body, 28)}`;
              lAlpha = 0.55; lColor = WARM; fontSize = 8;
              break;
            }
            case "ancestor": {
              const anc = t.payload as { identifier?: string | null; title: string };
              label = anc.identifier ?? shortLabel(anc.title, 16);
              lAlpha = 0.6; lColor = "#C8A96E"; fontSize = 9;
              break;
            }
            default: continue; // no label for activity
          }
          if (!label || lAlpha < 0.05) continue;
          const lx = sx[i] + nr * 1.3 + 5;
          ctx.font = `${fontSize}px ui-monospace, monospace`;
          ctx.fillStyle = lColor;
          ctx.globalAlpha = lAlpha * intro;
          ctx.fillText(label, lx, sy[i]);
          if (secondaryLabel) {
            ctx.font = `italic 14px "Fraunces", ui-serif, Georgia, serif`;
            ctx.globalAlpha = lAlpha * intro * 0.88;
            ctx.fillText(secondaryLabel, lx, sy[i] + 18);
          }
        }
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;
      }

      // ── Resolution beacon ("finish line") ──
      // A world-space marker just past the deepest thought,
      // reflecting the case's current resolution state. This is the
      // scene's answer to "where is this headed?" — done = green
      // celebration, blocked = red choke, in-progress = forward
      // arrow, todo/backlog = quiet outline.
      if (intro > 0.4) {
        const beaconX = (maxDepth + 1) * DAG_DEPTH_STEP;
        const p = project(cam, beaconX, 0, 0);
        if (!p.behind) {
          const status = issue.status;
          let beaconColor = "#C8A96E", beaconAlpha = 0.45, beaconShape: "dot" | "arrow" | "outline" = "outline";
          let beaconPulse = 0.85;
          if (status === "done" || status === "cancelled") {
            beaconColor = "#3FCF8E"; beaconAlpha = 0.9; beaconShape = "dot";
            beaconPulse = 0.7 + 0.3 * Math.sin(now * 0.003); // celebratory
          } else if (status === "blocked") {
            beaconColor = "#E04444"; beaconAlpha = 0.9; beaconShape = "dot";
            beaconPulse = 0.6 + 0.4 * Math.abs(Math.sin(now * 0.0052)); // heart-beat
          } else if (status === "in_progress" || status === "in_review") {
            beaconColor = "#E09437"; beaconAlpha = 0.85; beaconShape = "arrow";
          } else {
            beaconColor = WARM_DIM; beaconAlpha = 0.35; beaconShape = "outline";
          }
          const baseR = 18 * p.scale;
          if (beaconShape === "dot") {
            const sprite = sprites.get(beaconColor, 96, 0.35);
            ctx.globalAlpha = beaconAlpha * intro * 0.55 * beaconPulse;
            const haloR = Math.max(22, baseR * 2.6);
            ctx.drawImage(sprite, p.sx - haloR, p.sy - haloR, haloR * 2, haloR * 2);
            ctx.globalAlpha = beaconAlpha * intro * beaconPulse;
            ctx.fillStyle = beaconColor;
            ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(5, baseR * 0.55), 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = beaconAlpha * intro * 0.6 * beaconPulse;
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(2, baseR * 0.22), 0, Math.PI * 2); ctx.fill();
          } else if (beaconShape === "arrow") {
            // Forward-arrow nose pointing rightward (along the flow).
            ctx.globalAlpha = beaconAlpha * intro;
            ctx.strokeStyle = beaconColor; ctx.lineWidth = 2;
            ctx.shadowColor = beaconColor; ctx.shadowBlur = 10;
            const nose = Math.max(18, baseR * 1.1);
            const flare = Math.max(9, baseR * 0.55);
            ctx.beginPath();
            ctx.moveTo(p.sx - nose, p.sy - flare);
            ctx.lineTo(p.sx + nose * 0.4, p.sy);
            ctx.lineTo(p.sx - nose, p.sy + flare);
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else {
            // Quiet outline for todo/backlog — "journey hasn't started yet".
            ctx.globalAlpha = beaconAlpha * intro;
            ctx.strokeStyle = beaconColor; ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(8, baseR * 0.7), 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.globalAlpha = 1;
        }
      }
    };

    const start = () => { introStartRef.current = performance.now(); lastTimeRef.current = performance.now(); rafRef.current = requestAnimationFrame(tick); };
    const h = typeof requestIdleCallback === "function" ? requestIdleCallback(start, { timeout: 500 }) : (setTimeout(start, 250) as unknown as number);
    return () => { clearTimeout(h); if (typeof cancelIdleCallback === "function") cancelIdleCallback(h); if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  const selectedThought = useMemo(() => selectedId ? thoughts.find(t => t.id === selectedId) ?? null : null, [selectedId, thoughts]);

  return (
    <div ref={wrapperRef} className={cn("relative w-full overflow-hidden border border-foreground select-none", className)} style={{ height: "min(80vh, 860px)", background: BG }}>
      <canvas ref={glCanvasRef} className="absolute inset-0 block pointer-events-none" />
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-grab active:cursor-grabbing"
        onPointerMove={handlePointerMove} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
        onPointerLeave={() => { hoverIdxRef.current = -1; setHoverInfo(null); dragRef.current = null; }}
        onContextMenu={e => e.preventDefault()} />

      <div className="absolute top-5 left-5 z-10 pointer-events-none">
        <div className="font-mono text-[0.54rem] uppercase tracking-[0.24em]" style={{ color: WARM_DIM, opacity: 0.7 }}>The thought network</div>
        <div className="flex gap-3 mt-2">
          {[["run", "#E09437", "Runs"], ["comment", "#5CC8E4", "Comments"], ["subissue", "#3FCF8E", "Sub-issues"], ["ancestor", "#C8A96E", "Ancestry"]] .map(([, c, l]) => (
            <div key={l as string} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: c as string, opacity: 0.7 }} />
              <span className="font-mono text-[0.46rem] uppercase tracking-[0.12em]" style={{ color: WARM_DIM, opacity: 0.5 }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none" style={{ color: WARM_DIM, opacity: hintVisible && !selectedId && !tourCaption ? 0.55 : 0, transition: "opacity 900ms ease-out" }}>
        <div className="font-mono text-[0.52rem] uppercase tracking-[0.24em] text-center">drag · scroll · click</div>
      </div>

      {/* Title card — the "chapter opening" that fires at the start
          of each auto-tour cycle. Big serif italic, holds ~3 s, then
          fades out into the chyron below. */}
      <div
        className="absolute top-[18%] left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[80%] text-center"
        style={{
          color: WARM,
          opacity: titleCardVisible && !selectedId ? 1 : 0,
          transition: "opacity 900ms ease-out",
        }}
      >
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] mb-2" style={{ color: WARM_DIM }}>
          {issue.identifier ?? "the matter"} · dossier
        </div>
        <div
          className="font-serif italic leading-[1.1]"
          style={{ fontSize: "clamp(1.4rem, 3.6vw, 2.4rem)" }}
        >
          {leadHeadline && leadHeadline.trim().length > 0
            ? leadHeadline
            : shortLabel(issue.title ?? "", 80)}
        </div>
      </div>

      {/* Auto-tour chyron — surfaces when the scene is self-narrating.
          Pulsing acid dot signals "camera is moving automatically,
          you can still interrupt by dragging or clicking". */}
      <div
        className="absolute bottom-9 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        style={{
          color: WARM,
          opacity: tourCaption && !titleCardVisible && !selectedId ? 0.9 : 0,
          transition: "opacity 700ms ease-out",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
          </span>
          <span className="font-serif italic text-[0.88rem]">
            {tourCaption ?? ""}
          </span>
          <span className="font-mono text-[0.52rem] uppercase tracking-[0.2em]" style={{ color: WARM_DIM }}>
            tap to stop
          </span>
        </div>
      </div>

      {/* Tour progress bar — thin line along the bottom so the
          viewer knows the journey has a length and where they are.
          Fills forward through the ping-pong phase; direction dot
          on the right signals which way the camera is sweeping. */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] z-10 pointer-events-none"
        style={{
          opacity: tourProgress !== null && !selectedId ? 1 : 0,
          transition: "opacity 700ms ease-out",
          background: `linear-gradient(90deg, transparent 0%, rgba(242,230,196,0.08) 50%, transparent 100%)`,
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, Math.min(1, tourProgress ?? 0)) * 100}%`,
            background: "linear-gradient(90deg, rgba(242,230,196,0) 0%, var(--boared-acid) 100%)",
            transition: "width 400ms linear",
          }}
        />
      </div>

      {!selectedId && hoverInfo && (
        <div className="absolute top-5 right-5 z-10 pointer-events-none text-right max-w-[40ch]" style={{ color: WARM }}>
          <div className="font-mono text-[0.54rem] uppercase tracking-[0.2em] mb-1" style={{ color: WARM_DIM }}>
            {hoverInfo.kind === "issue" ? "The matter" : hoverInfo.kind === "comment" ? "Correspondence" : hoverInfo.kind === "activity" ? "Activity" : hoverInfo.kind === "subissue" ? "Sub-matter" : hoverInfo.kind === "ancestor" ? "Ancestor" : "Run"} · {hoverInfo.authorName}
          </div>
          <div className="text-[0.78rem] leading-snug font-medium">{shortLabel(hoverInfo.label, 120)}</div>
        </div>
      )}

      {/* In-scene selection panel. Suppressed when the Dossier owns
          the selection surface (onNodeActivate is wired) — that keeps
          one source of truth for "what is selected". */}
      {!onNodeActivate && selectedId && selectedThought && (
        <div className="absolute top-1/2 left-6 md:left-10 z-20 max-w-[440px] pointer-events-none" style={{ transform: "translate(0, -50%)" }}>
          <div className="p-6 pointer-events-auto max-h-[70vh] overflow-y-auto backdrop-blur-sm" style={{ background: "rgba(15,14,12,0.82)", border: `1px solid ${WARM_DIM}`, color: WARM }}>
            <div className="font-mono text-[0.56rem] uppercase tracking-[0.2em] mb-3" style={{ color: WARM_DIM }}>{selectedThought.kind === "issue" ? "The matter" : selectedThought.kind === "comment" ? "Correspondence" : selectedThought.kind === "activity" ? "Activity" : selectedThought.kind === "subissue" ? "Sub-matter" : selectedThought.kind === "ancestor" ? "Ancestor" : "Run"} · {selectedThought.ts > 0 ? relativeTime(new Date(selectedThought.ts).toISOString()) : ""}</div>
            <div className="text-[1.2rem] leading-[1.22] font-semibold max-w-[36ch] mb-3">{shortLabel(selectedThought.label, 140)}</div>
            {selectedThought.kind === "comment" && <div className="text-[0.82rem] leading-snug whitespace-pre-wrap max-w-[40ch] mb-4" style={{ opacity: 0.85 }}>{(selectedThought.payload as IssueComment).body}</div>}
            <button type="button" onClick={() => setSelectedId(null)} className="inline-flex items-center gap-2 px-3 h-8 font-mono text-[0.62rem] uppercase tracking-[0.12em]" style={{ border: `1px solid ${WARM_DIM}`, color: WARM, background: "transparent" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}), (prev, next) => {
  // Custom comparator — prevents re-renders from react-query polling
  // that returns new array refs with identical content. We check what
  // actually drives the visualization: issue identity + status, and
  // the LENGTHS of the data arrays (if a new comment/run/event arrives
  // the length changes and we re-render; otherwise skip). gateById is
  // a ref-equality check — the Dossier rebuilds the Map only when
  // scrubber/focus change, so identical refs mean "skip".
  return (
    prev.issue.id === next.issue.id &&
    prev.issue.status === next.issue.status &&
    prev.issue.priority === next.issue.priority &&
    (prev.comments?.length ?? 0) === (next.comments?.length ?? 0) &&
    (prev.activity?.length ?? 0) === (next.activity?.length ?? 0) &&
    (prev.childIssues?.length ?? 0) === (next.childIssues?.length ?? 0) &&
    (prev.linkedRuns?.length ?? 0) === (next.linkedRuns?.length ?? 0) &&
    prev.agentMap === next.agentMap &&
    prev.gateById === next.gateById &&
    prev.onNodeActivate === next.onNodeActivate &&
    prev.onNodeFeature === next.onNodeFeature &&
    prev.leadHeadline === next.leadHeadline
  );
});
