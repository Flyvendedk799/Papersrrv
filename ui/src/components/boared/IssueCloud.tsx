import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { cn } from "../../lib/utils";
import type { Issue, Agent } from "@paperclipai/shared";

/* ─────────────────────────────────────────────────────────────────────
 *  IssueCloud — immersive point-cloud visualization of issues.
 *
 *  Same data as the list view (issues, agents, liveIssueIds), totally
 *  different expression: each issue is a particle in a Canvas 2D field,
 *  pulled toward its assignee's gravity well, mutually repelled, with
 *  delegation drawn as hairline curves and live runs pulsing.
 *
 *  Architecture:
 *    - Particles live in a ref-managed array (no React re-renders during
 *      animation; only setState for hover/select state).
 *    - One requestAnimationFrame loop ticks at the display rate.
 *    - Pointer events translate to canvas-space and find the nearest
 *      particle within a hit radius.
 *    - Click bubbles up to onSelectIssue; the parent shows an info panel.
 *
 *  No business logic, no mutations — pure visualization of read-only data.
 * ───────────────────────────────────────────────────────────────────── */

interface IssueCloudProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  search?: string;
  statusFilter?: string[]; // empty = all
  className?: string;
  /** Optional callback when a particle is clicked. */
  onSelectIssue?: (issue: Issue) => void;
}

interface Particle {
  id: string;
  issue: Issue;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // base radius
  pulse: number; // 0..1 pulse phase
  /** The center this particle is attracted to. */
  homeX: number;
  homeY: number;
  /** Cached match score for current search/filter (1 = full, 0 = filtered out). */
  match: number;
}

interface AgentCenter {
  id: string;
  name: string;
  x: number;
  y: number;
  utilization: number; // count of issues assigned
}

const HIT_RADIUS = 14;
const MAX_PARTICLES = 300;

function priorityRadius(priority: string): number {
  switch (priority) {
    case "critical":
      return 3.6;
    case "high":
      return 2.8;
    case "medium":
      return 2.2;
    default:
      return 1.8;
  }
}

function statusOpacity(status: string): number {
  switch (status) {
    case "done":
      return 0.32;
    case "cancelled":
      return 0.18;
    case "backlog":
      return 0.55;
    case "in_review":
      return 0.85;
    default:
      return 1;
  }
}

function isLiveStatus(status: string): boolean {
  return status === "in_progress" || status === "in_review";
}

function tokenizeSearch(search: string | undefined): string[] {
  if (!search || !search.trim()) return [];
  return search
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function issueMatchesSearch(issue: Issue, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = `${issue.identifier ?? ""} ${issue.title ?? ""} ${issue.description ?? ""}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function issueMatchesStatus(issue: Issue, statuses: string[] | undefined): boolean {
  if (!statuses || statuses.length === 0) return true;
  return statuses.includes(issue.status);
}

export function IssueCloud({
  issues,
  agents,
  liveIssueIds,
  search,
  statusFilter,
  className,
  onSelectIssue,
}: IssueCloudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const agentCentersRef = useRef<AgentCenter[]>([]);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const navigate = useNavigate();

  // Derived state for the info panel — set on click only, not hover.
  const [selected, setSelected] = useState<Issue | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ id: string; x: number; y: number } | null>(null);

  // Build agent centers (gravity wells) from the agents list.
  const agentCenters = useMemo<AgentCenter[]>(() => {
    if (!agents || agents.length === 0) return [];
    const counts = new Map<string, number>();
    for (const issue of issues) {
      if (issue.assigneeAgentId) {
        counts.set(issue.assigneeAgentId, (counts.get(issue.assigneeAgentId) ?? 0) + 1);
      }
    }
    // Place agents on a circle. Centers are computed as fractions of canvas size
    // and resolved to absolute coordinates inside the RAF loop.
    return agents.map((agent, i) => {
      const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      return {
        id: agent.id,
        name: agent.name,
        // Fractional placement from center (-0.4 .. 0.4). Resolved per frame.
        x: Math.cos(angle) * 0.34,
        y: Math.sin(angle) * 0.34,
        utilization: counts.get(agent.id) ?? 0,
      };
    });
  }, [agents, issues]);

  // Match scores for the current search + filter — recomputed only when inputs change.
  const matchScores = useMemo(() => {
    const tokens = tokenizeSearch(search);
    const map = new Map<string, number>();
    for (const issue of issues) {
      const matchesS = issueMatchesSearch(issue, tokens);
      const matchesF = issueMatchesStatus(issue, statusFilter);
      map.set(issue.id, matchesS && matchesF ? 1 : 0);
    }
    return map;
  }, [issues, search, statusFilter]);

  // Resize handling — observe wrapper and update canvas backing store.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const apply = () => {
      const rect = wrapper.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // Build / refresh particle list when issues change.
  // We try to preserve existing particle positions when an issue persists,
  // so the cloud feels stable across data refetches.
  useEffect(() => {
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;
    agentCentersRef.current = agentCenters.map((c) => ({
      ...c,
      x: cx + c.x * Math.min(w, h),
      y: cy + c.y * Math.min(w, h),
    }));

    const existing = new Map(particlesRef.current.map((p) => [p.id, p]));
    const next: Particle[] = [];
    const cap = Math.min(issues.length, MAX_PARTICLES);

    for (let i = 0; i < cap; i++) {
      const issue = issues[i]!;
      const home = issue.assigneeAgentId
        ? agentCentersRef.current.find((c) => c.id === issue.assigneeAgentId)
        : null;
      const homeX = home ? home.x : cx + Math.cos(i * 0.7) * Math.min(w, h) * 0.18;
      const homeY = home ? home.y : cy + Math.sin(i * 0.7) * Math.min(w, h) * 0.18;
      const prev = existing.get(issue.id);
      next.push({
        id: issue.id,
        issue,
        x: prev?.x ?? homeX + (Math.random() - 0.5) * 60,
        y: prev?.y ?? homeY + (Math.random() - 0.5) * 60,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        r: priorityRadius(issue.priority),
        pulse: prev?.pulse ?? Math.random(),
        homeX,
        homeY,
        match: matchScores.get(issue.id) ?? 1,
      });
    }

    particlesRef.current = next;
  }, [issues, agentCenters, matchScores]);

  // Pointer move — record mouse position and find the nearest particle to highlight.
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y };

    let bestId: string | null = null;
    let bestDist = HIT_RADIUS * HIT_RADIUS;
    for (const p of particlesRef.current) {
      if (p.match === 0) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestId = p.id;
      }
    }

    if (bestId !== hoverIdRef.current) {
      hoverIdRef.current = bestId;
      if (bestId) {
        const p = particlesRef.current.find((pp) => pp.id === bestId)!;
        setHoverInfo({ id: bestId, x: p.x, y: p.y });
        canvas.style.cursor = "pointer";
      } else {
        setHoverInfo(null);
        canvas.style.cursor = "default";
      }
    } else if (bestId) {
      // Update overlay position smoothly with the particle
      const p = particlesRef.current.find((pp) => pp.id === bestId)!;
      setHoverInfo({ id: bestId, x: p.x, y: p.y });
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    mouseRef.current = null;
    if (hoverIdRef.current) {
      hoverIdRef.current = null;
      setHoverInfo(null);
    }
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
  }, []);

  const handleClick = useCallback(() => {
    const id = hoverIdRef.current;
    if (!id) return;
    const p = particlesRef.current.find((pp) => pp.id === id);
    if (!p) return;
    setSelected(p.issue);
    onSelectIssue?.(p.issue);
  }, [onSelectIssue]);

  // Animation loop — physics + draw.
  useEffect(() => {
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 16.67; // normalize to ~60fps frames
      last = now;

      const { w, h, dpr } = sizeRef.current;
      const canvas = canvasRef.current;
      if (!canvas || w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Background — let the page paper show through; just paint a faint inner gradient
      // for depth. (No solid fill — keeps the body grain visible.)
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, "rgba(0,0,0,0.0)");
      grad.addColorStop(1, "rgba(0,0,0,0.04)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const particles = particlesRef.current;
      const centers = agentCentersRef.current;
      const liveSet = liveIssueIds ?? new Set<string>();

      // Build a quick lookup for delegation lines: child id → parent particle
      const byId = new Map(particles.map((p) => [p.id, p]));

      // ── Physics ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;

        // Attraction toward home
        const ax = (p.homeX - p.x) * 0.0035;
        const ay = (p.homeY - p.y) * 0.0035;

        // Mild noise (organic drift) — use particle index + time for stable wobble
        const t = now / 1000;
        const nx = Math.sin(t * 0.6 + i * 0.13) * 0.03;
        const ny = Math.cos(t * 0.7 + i * 0.17) * 0.03;

        // Mutual repulsion — only check nearby particles (cap to avoid O(n²) blow-up)
        let rx = 0;
        let ry = 0;
        for (let j = 0; j < particles.length; j++) {
          if (i === j) continue;
          const o = particles[j]!;
          const dx = p.x - o.x;
          const dy = p.y - o.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 144 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (12 - d) * 0.02;
            rx += (dx / d) * force;
            ry += (dy / d) * force;
          }
        }

        p.vx = (p.vx + ax + nx + rx) * 0.86;
        p.vy = (p.vy + ay + ny + ry) * 0.86;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Pulse phase
        p.pulse = (p.pulse + 0.02 * dt) % 1;
      }

      // ── Draw delegation lines (parent → child) — extremely faint hairlines ──
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      for (const p of particles) {
        const parentId = (p.issue as { parentIssueId?: string | null }).parentIssueId;
        if (!parentId) continue;
        const parent = byId.get(parentId);
        if (!parent) continue;
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        // Quadratic curve for organic feel
        const mx = (parent.x + p.x) / 2 + (p.y - parent.y) * 0.1;
        const my = (parent.y + p.y) / 2 - (p.x - parent.x) * 0.1;
        ctx.quadraticCurveTo(mx, my, p.x, p.y);
        ctx.stroke();
      }

      // ── Draw agent gravity centers — faint cross + name ──
      ctx.font = "9px ui-monospace, 'Fragment Mono', monospace";
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const c of centers) {
        ctx.fillText(c.name.toUpperCase(), c.x, c.y - 22);
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.moveTo(c.x - 4, c.y);
        ctx.lineTo(c.x + 4, c.y);
        ctx.moveTo(c.x, c.y - 4);
        ctx.lineTo(c.x, c.y + 4);
        ctx.stroke();
      }

      // ── Draw particles ──
      const hoverId = hoverIdRef.current;
      for (const p of particles) {
        const isLive = liveSet.has(p.id) || isLiveStatus(p.issue.status);
        const isHover = p.id === hoverId;
        const baseAlpha = statusOpacity(p.issue.status);
        const filterAlpha = p.match === 0 ? 0.06 : 1;
        const alpha = baseAlpha * filterAlpha;

        // Pulse modulates radius for live particles
        const pulseMod = isLive ? 1 + Math.sin(p.pulse * Math.PI * 2) * 0.4 : 1;
        const r = (isHover ? p.r * 1.8 : p.r) * pulseMod;

        // Critical = acid red; blocked = small acid square; everything else = ink
        const isCritical = p.issue.priority === "critical";
        const isBlocked = p.issue.status === "blocked";

        ctx.globalAlpha = alpha;
        if (isBlocked) {
          ctx.fillStyle = "#B22B1A";
          ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        } else if (isCritical) {
          ctx.fillStyle = "#B22B1A";
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#1A1A18";
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Live particles get a faint outer halo
        if (isLive) {
          const haloR = r + 3 + Math.sin(p.pulse * Math.PI * 2) * 1.5;
          ctx.globalAlpha = alpha * 0.18;
          ctx.strokeStyle = isCritical || isBlocked ? "#B22B1A" : "#1A1A18";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Hovered particle gets a hairline ring
        if (isHover) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#1A1A18";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [liveIssueIds]);

  // Hovered issue (from particle index)
  const hoveredIssue = useMemo(() => {
    if (!hoverInfo) return null;
    return issues.find((i) => i.id === hoverInfo.id) ?? null;
  }, [hoverInfo, issues]);

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ minHeight: "560px", height: "calc(100vh - 320px)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />

      {/* Hover overlay — particle identity floats next to the cursor */}
      {hoverInfo && hoveredIssue && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full pb-3"
          style={{ left: hoverInfo.x, top: hoverInfo.y - 8 }}
        >
          <div className="border border-foreground bg-[var(--boared-paper)] px-2 py-1.5 max-w-[260px]">
            <div className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground mb-0.5">
              {hoveredIssue.identifier ?? hoveredIssue.id.slice(0, 8)} ·{" "}
              {hoveredIssue.status.replace(/_/g, " ")}
            </div>
            <div className="text-[0.78rem] leading-snug text-foreground truncate">
              {hoveredIssue.title}
            </div>
          </div>
        </div>
      )}

      {/* Selected issue panel — slides in from bottom-right when a particle is clicked */}
      {selected && (
        <div className="absolute bottom-4 right-4 z-20 max-w-[420px] border-2 border-foreground bg-[var(--boared-paper)] shadow-none">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--boared-rule)] flex items-baseline justify-between gap-3">
            <div className="boared-label text-foreground">
              {selected.identifier ?? selected.id.slice(0, 8)} · {selected.status.replace(/_/g, " ")}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              Close
            </button>
          </div>
          <div className="px-4 py-4">
            <h3 className="boared-display text-[1.4rem] leading-[1.1] text-foreground mb-3">
              {selected.title}
            </h3>
            {selected.description && (
              <p className="font-mono text-[0.72rem] leading-relaxed text-muted-foreground italic line-clamp-4">
                "{selected.description.split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? ""}"
              </p>
            )}
            <div className="mt-4 pt-3 border-t border-[var(--boared-rule)] flex items-center justify-between gap-3">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">
                Priority {selected.priority}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/issues/${selected.identifier ?? selected.id}`)}
                className="inline-flex items-center gap-2 px-3 h-8 border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors font-mono text-[0.62rem] uppercase tracking-[0.1em]"
              >
                Open full
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend — small mono caps key bottom-left */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <div className="font-mono text-[0.56rem] uppercase tracking-[0.1em] text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 bg-foreground" /> matter
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 bg-[#B22B1A]" /> critical
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 bg-[#B22B1A]" style={{ borderRadius: 0 }} /> blocked
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 bg-foreground animate-pulse" /> in progress
          </div>
        </div>
      </div>
    </div>
  );
}
