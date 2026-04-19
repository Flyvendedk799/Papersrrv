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
   * to 1.0. Used by the Dossier to drive the temporal scrubber (future
   * events fade to ~0.05) and the phase-rail focus (non-focused
   * clusters fade to ~0.1).
   */
  gateById?: Map<string, number>;
}

export interface IssueThoughtSpaceHandle {
  /** Programmatically select a node by thought id (e.g. `comment:abc`,
   * `run:xyz`). Drives the camera fly-to via the existing selection
   * path, so the info panel opens too. */
  focusNodeId: (id: string | null) => void;
}

export const IssueThoughtSpace = memo(forwardRef<IssueThoughtSpaceHandle, Props>(
  function IssueThoughtSpace({ issue, comments, activity, childIssues, linkedRuns, agentMap, className, gateById }, ref) {
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ label: string; kind: ThoughtKind; authorName: string } | null>(null);
  const [hintVisible, setHintVisible] = useState(true);

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
      if (idx >= 0) setSelectedId(nodesRef.current[idx].thought.id);
      else if (selectedIdxRef.current >= 0) setSelectedId(null);
    }
  }, [hitTest]);

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
      updateCamera(cam, dt);

      const hIdx = hoverIdxRef.current, sIdx = selectedIdxRef.current;
      const focusIdx = sIdx >= 0 ? sIdx : hIdx;
      let attract: Vec3 | null = null, attractStr = 0;
      if (focusIdx >= 0) { attract = mind[focusIdx].pos; attractStr = sIdx >= 0 ? 0.5 : 0.85; }
      field.update(dt, edges, mind, attract, attractStr, now * 0.001);

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
      if (graph && intro > 0.1) {
        ctx.lineCap = "round";

        // Helper: draw a glowing line; extra `g` multiplier dims the
        // whole line when either endpoint is gated (scrubber/focus).
        const glowLine = (x1: number, y1: number, x2: number, y2: number, col: string, a: number, w: number, g: number) => {
          ctx.shadowColor = col; ctx.shadowBlur = 10;
          ctx.strokeStyle = col; ctx.lineWidth = w;
          ctx.globalAlpha = a * intro * g;
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
            const pk = mind[pi].thought.kind, ck = mind[ci].thought.kind;
            if (pk === "activity" && ck === "activity") continue;
            if (pk === "activity" || ck === "activity") {
              // Dim for activity-involved edges
              ctx.strokeStyle = WARM_DIM; ctx.lineWidth = 0.5;
              ctx.globalAlpha = 0.08 * intro * gEdge; ctx.shadowBlur = 0;
              ctx.beginPath(); ctx.moveTo(sx[pi], sy[pi]); ctx.lineTo(sx[ci], sy[ci]); ctx.stroke();
            } else {
              glowLine(sx[pi], sy[pi], sx[ci], sy[ci], WARM, 0.18, 1.0, gEdge);
            }
          }
        }

        // Ancestor chain — golden luminous thread
        const ancNodes: number[] = [];
        for (let i = 0; i < mind.length; i++) if (mind[i].thought.kind === "ancestor" && vis[i]) ancNodes.push(i);
        const gIssue = gate[0] ?? 1;
        if (ancNodes.length > 0 && vis[0]) {
          const g0 = Math.min(gIssue, gate[ancNodes[0]] ?? 1);
          glowLine(sx[0], sy[0], sx[ancNodes[0]], sy[ancNodes[0]], "#C8A96E", 0.45, 1.8, g0);
          for (let ai = 1; ai < ancNodes.length; ai++) {
            const g = Math.min(gate[ancNodes[ai - 1]] ?? 1, gate[ancNodes[ai]] ?? 1);
            glowLine(sx[ancNodes[ai - 1]], sy[ancNodes[ai - 1]], sx[ancNodes[ai]], sy[ancNodes[ai]], "#C8A96E", 0.4, 1.5, g);
          }
        }

        // Subissue connections — emerald luminous threads
        for (let i = 0; i < mind.length; i++) {
          if (mind[i].thought.kind === "subissue" && vis[i] && vis[0]) {
            const g = Math.min(gIssue, gate[i] ?? 1);
            glowLine(sx[0], sy[0], sx[i], sy[i], "#3FCF8E", 0.35, 1.4, g);
          }
        }
        ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineCap = "butt";
      }

      // ── Node markers: hard crystal core + soft halo ──
      // The STARS of the show. Each structural node gets a bright hard
      // center circle with a soft radial glow behind it.  Activities are
      // skipped — they're background texture, not landmarks.
      for (let i = 0; i < mind.length; i++) {
        if (!vis[i]) continue;
        const t = mind[i].thought;
        const nodeR = mind[i].radius * sc[i];
        if (nodeR < 0.5) continue;
        const g = gate[i] ?? 1;
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
        for (let i = 0; i < mind.length; i++) {
          if (!vis[i]) continue;
          const t = mind[i].thought;
          const nr = mind[i].radius * sc[i];
          if (nr < 2) continue;
          let label = ""; let lAlpha = 0; let lColor = WARM; let fontSize = 9;
          switch (t.kind as ThoughtKind) {
            case "issue": {
              label = (t.payload as Issue).identifier ?? "";
              lAlpha = 0.85; lColor = WARM; fontSize = 11;
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
            case "ancestor": {
              const anc = t.payload as { identifier?: string | null; title: string };
              label = anc.identifier ?? shortLabel(anc.title, 16);
              lAlpha = 0.6; lColor = "#C8A96E"; fontSize = 9;
              break;
            }
            default: continue; // no label for comments/activity
          }
          if (!label || lAlpha < 0.05) continue;
          ctx.font = `${fontSize}px ui-monospace, monospace`;
          ctx.fillStyle = lColor;
          ctx.globalAlpha = lAlpha * intro;
          const lx = sx[i] + nr * 1.3 + 5;
          ctx.fillText(label, lx, sy[i]);
        }
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;
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

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none" style={{ color: WARM_DIM, opacity: hintVisible && !selectedId ? 0.55 : 0, transition: "opacity 900ms ease-out" }}>
        <div className="font-mono text-[0.52rem] uppercase tracking-[0.24em] text-center">drag · scroll · click</div>
      </div>

      {!selectedId && hoverInfo && (
        <div className="absolute top-5 right-5 z-10 pointer-events-none text-right max-w-[40ch]" style={{ color: WARM }}>
          <div className="font-mono text-[0.54rem] uppercase tracking-[0.2em] mb-1" style={{ color: WARM_DIM }}>
            {hoverInfo.kind === "issue" ? "The matter" : hoverInfo.kind === "comment" ? "Correspondence" : hoverInfo.kind === "activity" ? "Activity" : hoverInfo.kind === "subissue" ? "Sub-matter" : hoverInfo.kind === "ancestor" ? "Ancestor" : "Run"} · {hoverInfo.authorName}
          </div>
          <div className="text-[0.78rem] leading-snug font-medium">{shortLabel(hoverInfo.label, 120)}</div>
        </div>
      )}

      {selectedId && selectedThought && (
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
    prev.gateById === next.gateById
  );
});
