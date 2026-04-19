/* mind.ts — 3D neural model: types, graph, layout, camera, particles */

export type ThoughtKind = "issue" | "comment" | "activity" | "subissue" | "run" | "ancestor";

export interface Thought {
  id: string; kind: ThoughtKind; label: string; author: string;
  authorName: string; ts: number; isLive?: boolean; payload: unknown;
}

export interface Vec3 { x: number; y: number; z: number }

export interface MindNode {
  thought: Thought; pos: Vec3; radius: number; phase: number;
  introDelay: number;
}

export interface Edge { parentIdx: number; childIdx: number }

export interface CausalGraph {
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  depth: Map<string, number>;
}

/* ── Graph ──────────────────────────────────────────────────────── */

/* Explicit causal-linkage fields on each payload kind. When present,
 * these override the time-proximity fallback below — the graph then
 * reflects *actual* causation (who replied to what, which run a
 * comment triggered, which run a sub-matter was spawned from) rather
 * than "these two thoughts happened near each other". */
type CommentPayload = { id: string; replyToCommentId?: string | null };
type RunPayload = {
  triggeredByCommentId?: string | null;
  triggeredByActivityId?: string | null;
};
type SubissuePayload = {
  createdFromCommentId?: string | null;
  createdFromRunId?: string | null;
};
type ActivityPayload = {
  runId?: string | null;
  triggeredByCommentId?: string | null;
};

const FALLBACK_WINDOW_MS = 30 * 60 * 1000;

export function buildGraph(thoughts: Thought[]): CausalGraph {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>();
  const issue = thoughts.find(t => t.kind === "issue");
  if (!issue) return { parents, children, depth };

  // Every thought id that actually exists in this graph — used to
  // filter out payload references that point at something outside
  // the issue's slice (e.g. a cross-issue reply target).
  const known = new Set(thoughts.map(t => t.id));

  const sorted = [...thoughts].sort((a, b) => a.ts - b.ts);
  parents.set(issue.id, []);
  depth.set(issue.id, 0);

  const addChild = (p: string, c: string) => {
    const arr = children.get(p) ?? [];
    if (!arr.includes(c)) arr.push(c);
    children.set(p, arr);
  };

  let lastComment: Thought | null = null;
  for (const t of sorted) {
    if (t.kind === "issue" || t.kind === "ancestor") continue;

    const ps: string[] = [];

    // Phase 1 — explicit fields on the payload. These are the truth.
    const payload = t.payload;
    if (t.kind === "comment" && payload) {
      const c = payload as CommentPayload;
      if (c.replyToCommentId) {
        const pid = `comment:${c.replyToCommentId}`;
        if (known.has(pid)) ps.push(pid);
      }
    } else if (t.kind === "run" && payload) {
      const r = payload as RunPayload;
      if (r.triggeredByCommentId) {
        const pid = `comment:${r.triggeredByCommentId}`;
        if (known.has(pid)) ps.push(pid);
      }
      if (r.triggeredByActivityId) {
        const pid = `activity:${r.triggeredByActivityId}`;
        if (known.has(pid) && !ps.includes(pid)) ps.push(pid);
      }
    } else if (t.kind === "subissue" && payload) {
      const s = payload as SubissuePayload;
      if (s.createdFromCommentId) {
        const pid = `comment:${s.createdFromCommentId}`;
        if (known.has(pid)) ps.push(pid);
      }
      if (s.createdFromRunId) {
        const pid = `run:${s.createdFromRunId}`;
        if (known.has(pid) && !ps.includes(pid)) ps.push(pid);
      }
    } else if (t.kind === "activity" && payload) {
      const e = payload as ActivityPayload;
      if (e.triggeredByCommentId) {
        const pid = `comment:${e.triggeredByCommentId}`;
        if (known.has(pid)) ps.push(pid);
      }
      if (e.runId) {
        const pid = `run:${e.runId}`;
        if (known.has(pid) && !ps.includes(pid)) ps.push(pid);
      }
    }

    // Phase 2 — fallback. If nothing explicit, link to the most
    // recent comment within FALLBACK_WINDOW_MS, regardless of
    // author. Comments are the primary causal trigger in a
    // user-driven workflow; "same author consecutive" (the old
    // heuristic) was mostly noise.
    if (ps.length === 0 && lastComment && t.id !== lastComment.id) {
      if (t.ts - lastComment.ts >= 0 && t.ts - lastComment.ts < FALLBACK_WINDOW_MS) {
        ps.push(lastComment.id);
      }
    }

    // Phase 3 — last resort. Parent to the issue anchor.
    if (ps.length === 0) ps.push(issue.id);

    parents.set(t.id, ps);
    for (const p of ps) addChild(p, t.id);
    if (t.kind === "comment") lastComment = t;
  }

  // BFS depth from issue. Unreachable thoughts get depth 1 so they
  // still render somewhere on the DAG plane.
  const queue = [issue.id];
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    for (const c of children.get(id) ?? []) {
      if (!depth.has(c)) { depth.set(c, d + 1); queue.push(c); }
    }
  }
  for (const t of thoughts) if (!depth.has(t.id)) depth.set(t.id, 1);
  return { parents, children, depth };
}

/* ── Layout ─────────────────────────────────────────────────────── */

/** World units per causal-depth step. Exported so consumers can
 * place world-space decorations (beacon, chapter guides) at the
 * same scale the layout uses. */
export const DAG_DEPTH_STEP = 110;

const RADII: Record<ThoughtKind, number> = {
  issue: 24, run: 14, subissue: 14, comment: 11, activity: 7, ancestor: 16,
};

/* ── Status & kind colors ──────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  backlog: "#8B8FA3", todo: "#5CC8E4", in_progress: "#E09437",
  in_review: "#A36ADE", done: "#3FCF8E", blocked: "#E04444", cancelled: "#6B6B6B",
};
export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "#8B8FA3";
}

const KIND_COLORS: Record<ThoughtKind, string> = {
  issue: "#F2E6C4", run: "#E09437", comment: "#5CC8E4",
  activity: "#7A6F50", subissue: "#3FCF8E", ancestor: "#C8A96E",
};
export function kindColor(kind: ThoughtKind): string {
  return KIND_COLORS[kind] ?? "#F2E6C4";
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function layoutMind(thoughts: Thought[], graph: CausalGraph): MindNode[] {
  /* ── Causal DAG flow layout ──────────────────────────────────────
   *
   *   ancestors  ·  issue  ·  depth 1  ·  depth 2  ·  …  ·  leaf thoughts
   *   ◀── upstream                                     downstream ──▶
   *
   *   X = causal depth (the story's time-agnostic flow axis).
   *       Ancestors sit at negative X — they're "before" the issue in
   *       causality. Issue is the origin. Derived thoughts push right
   *       by the BFS depth computed in buildGraph: depth 1 is the
   *       first generation spawned from the issue, depth 2 is the
   *       next, etc.
   *   Y = kind band. Visual type separates "what kind of thought is
   *       this?" so two thoughts at the same depth are still readable
   *       (comments above, runs centred, sub-matters below, activity
   *       drifting near the issue plane, ancestors stacked up-left).
   *   Z = spread within (depth, kind) bucket so co-depth siblings
   *       don't collapse onto a single line. Timestamp order drives
   *       the sign of the spread — earlier → closer to Z=0, later →
   *       further out.
   *
   * The particle field then flows along the causal edges (built in
   * buildEdges from graph.children), which — given this layout —
   * means particles flow left-to-right along the depth axis, exactly
   * the n8n / workflow brainwave read: upstream thoughts send pulses
   * to their downstream consequences.
   * ─────────────────────────────────────────────────────────────── */

  const nodes: MindNode[] = [];
  const issue = thoughts.find(t => t.kind === "issue");
  if (!issue) return nodes;

  const DEPTH_STEP = DAG_DEPTH_STEP;
  /** Vertical band per kind. Activity sits near the flow plane
   * rather than scattered — it's narrative texture, not structure. */
  const Y_BAND: Record<ThoughtKind, number> = {
    ancestor: 180, comment: 75, issue: 0, activity: -15, run: -80, subissue: -200,
  };

  // Anchor
  nodes.push({
    thought: issue, pos: { x: 0, y: 0, z: 0 },
    radius: RADII.issue, phase: 0, introDelay: 0,
  });

  // Ancestors — sort far → near (great-grandparent first). We want
  // the nearest ancestor adjacent to the issue (X = -1 step) and the
  // great-great grandparent pushed further left.
  const ancestors = thoughts.filter(t => t.kind === "ancestor");
  // `ts` on ancestors is a negative index (see IssueThoughtSpace:
  // ts = -(ai+1)). Smaller ts → further-back ancestor → further-left.
  ancestors.sort((a, b) => a.ts - b.ts);
  const ancCount = ancestors.length;
  ancestors.forEach((t, i) => {
    // i=0 is the oldest ancestor. We want it at the leftmost X, so
    // depth = -(ancCount - i). The nearest (i=ancCount-1) lands at -1.
    const depth = -(ancCount - i);
    const zJ = (hash(t.id + "z") % 60) - 30;
    const yJ = (hash(t.id + "y") % 40) - 20;
    nodes.push({
      thought: t,
      pos: { x: depth * DEPTH_STEP, y: Y_BAND.ancestor + yJ, z: zJ },
      radius: RADII.ancestor, phase: 0, introDelay: 60 + (ancCount - i - 1) * 25,
    });
  });

  // Group derived thoughts by (depth, kind) so we can spread them
  // along Z within each bucket.
  type K = Exclude<ThoughtKind, "issue" | "ancestor">;
  const buckets = new Map<string, { kind: K; depth: number; list: Thought[] }>();
  for (const t of thoughts) {
    if (t.kind === "issue" || t.kind === "ancestor") continue;
    const kind = t.kind as K;
    const depth = Math.max(1, graph.depth.get(t.id) ?? 1);
    const key = `${depth}:${kind}`;
    const existing = buckets.get(key);
    if (existing) existing.list.push(t);
    else buckets.set(key, { kind, depth, list: [t] });
  }

  // Scale-down for single-thought issues so the plane doesn't feel empty
  const spreadScale = Math.min(1, Math.max(0.55, (thoughts.length - 1) / 40));

  buckets.forEach(({ kind, depth, list }) => {
    // Sort by timestamp so the earliest thought at this depth is
    // closest to Z=0 and later siblings push out symmetrically.
    list.sort((a, b) => a.ts - b.ts);
    const n = list.length;
    const stride = 60 * spreadScale;
    list.forEach((t, i) => {
      // Centred zig-zag: i=0 at z=0, i=1 at -stride, i=2 at +stride,
      // i=3 at -2·stride, etc. Keeps the centre busy and spreads out.
      const sign = i % 2 === 0 ? 1 : -1;
      const mag = Math.ceil(i / 2);
      const z = sign * mag * stride;
      // Tiny Y jitter so two co-depth siblings of the same kind don't
      // render at identical screen Y.
      const yJitter = ((hash(t.id) % 30) - 15) * 0.6;
      const delay = 60 + i * (kind === "activity" ? 4 : kind === "comment" ? 8 : 12);
      nodes.push({
        thought: t,
        pos: { x: depth * DEPTH_STEP, y: Y_BAND[kind] + yJitter, z },
        radius: RADII[kind],
        phase: (hash(t.id) % 628) / 100,
        introDelay: delay + Math.min(n - 1, 6) * 10,
      });
    });
  });

  return nodes;
}

export function buildEdges(nodes: MindNode[], graph: CausalGraph): Edge[] {
  const out: Edge[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, number>();
  nodes.forEach((n, i) => byId.set(n.thought.id, i));
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ parentIdx: a, childIdx: b });
  };
  // Causal edges (directed parent→child)
  for (const [pid, kids] of graph.children) {
    const p = byId.get(pid);
    if (p === undefined) continue;
    for (const cid of kids) {
      const c = byId.get(cid);
      if (c !== undefined) addEdge(p, c);
    }
  }
  // k-NN spatial edges (k=3) — these let particles circulate WITHIN
  // the brain volume instead of just streaming outward from the core.
  const K = 3;
  const topIdx = new Int32Array(K), topDist = new Float32Array(K);
  for (let i = 0; i < nodes.length; i++) {
    const xi = nodes[i].pos.x, yi = nodes[i].pos.y, zi = nodes[i].pos.z;
    for (let m = 0; m < K; m++) { topIdx[m] = -1; topDist[m] = Infinity; }
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = xi - nodes[j].pos.x, dy = yi - nodes[j].pos.y, dz = zi - nodes[j].pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= topDist[K - 1]) continue;
      let pos = K - 1;
      while (pos > 0 && topDist[pos - 1] > d2) pos--;
      for (let m = K - 1; m > pos; m--) { topIdx[m] = topIdx[m - 1]; topDist[m] = topDist[m - 1]; }
      topIdx[pos] = j; topDist[pos] = d2;
    }
    for (let q = 0; q < K; q++) { if (topIdx[q] >= 0) addEdge(i, topIdx[q]); }
  }
  return out;
}

/* ── Camera ─────────────────────────────────────────────────────── */

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }

export { clamp };

export interface Camera {
  focalLength: number;
  rotY: number; rotX: number; tRotY: number; tRotX: number;
  zoom: number; tZoom: number;
  target: Vec3; tTarget: Vec3;
  centerX: number; centerY: number;
  userControlled: number; autoRot: number; autoPhase?: number;
}

export function makeCamera(w: number, h: number): Camera {
  return {
    // DAG flow: small slice angle so X (depth) stays roughly
    // horizontal on screen, tiny bird's-eye tilt so Y bands read.
    focalLength: 600, rotY: 0.18, rotX: -0.14, tRotY: 0.18, tRotX: -0.14,
    zoom: 0.85, tZoom: 1.1, target: { x: 0, y: 0, z: 0 }, tTarget: { x: 0, y: 0, z: 0 },
    // autoRot was a full-spin orbit when the layout was brain-orb.
    // With DAG flow a slow sway is enough to give subtle life without
    // dragging the flow axis out from under the viewer.
    centerX: w / 2, centerY: h / 2, userControlled: 0, autoRot: 0.008,
  };
}

export interface Projected { sx: number; sy: number; scale: number; z: number; behind: boolean }

export function project(cam: Camera, wx: number, wy: number, wz: number): Projected {
  const rx = wx - cam.target.x, ry = wy - cam.target.y, rz = wz - cam.target.z;
  const cY = Math.cos(cam.rotY), sY = Math.sin(cam.rotY);
  const x1 = rx * cY + rz * sY, z1 = -rx * sY + rz * cY;
  const cX = Math.cos(cam.rotX), sX = Math.sin(cam.rotX);
  const y2 = ry * cX - z1 * sX, z2 = ry * sX + z1 * cX;
  const d = cam.focalLength + z2;
  if (d <= 20) return { sx: 0, sy: 0, scale: 0, z: z2, behind: true };
  const s = (cam.focalLength / d) * cam.zoom;
  return { sx: x1 * s + cam.centerX, sy: y2 * s + cam.centerY, scale: s, z: z2, behind: false };
}

export function updateCamera(cam: Camera, dt: number) {
  const k = 0.12;
  cam.rotY = lerp(cam.rotY, cam.tRotY, k);
  cam.rotX = lerp(cam.rotX, cam.tRotX, k);
  cam.zoom = lerp(cam.zoom, cam.tZoom, k);
  cam.target.x = lerp(cam.target.x, cam.tTarget.x, k);
  cam.target.y = lerp(cam.target.y, cam.tTarget.y, k);
  cam.target.z = lerp(cam.target.z, cam.tTarget.z, k);
  if (cam.userControlled > 0) cam.userControlled -= dt * 1000;
  else {
    // Idle: oscillate rotY around 0.18 (the DAG view angle) instead
    // of accumulating a full orbit. Tiny rotX bob on top. Sway period
    // ~22 s, amplitude ~0.12 rad (~7°) so the flow axis stays readable.
    cam.autoPhase = (cam.autoPhase ?? 0) + dt * cam.autoRot * 3;
    cam.tRotY = 0.18 + Math.sin(cam.autoPhase) * 0.12;
    cam.tRotX = -0.14 + Math.sin(cam.autoPhase * 0.5 + 1.7) * 0.05;
  }
}

export function focusOn(cam: Camera, p: Vec3, zoom: number) {
  cam.tTarget.x = p.x; cam.tTarget.y = p.y; cam.tTarget.z = p.z;
  cam.tZoom = zoom; cam.userControlled = 5000;
}

export function panCamera(cam: Camera, dx: number, dy: number) {
  const cY = Math.cos(cam.rotY), sY = Math.sin(cam.rotY);
  const cX = Math.cos(cam.rotX), sX = Math.sin(cam.rotX);
  const s = 1 / cam.zoom;
  cam.tTarget.x -= (dx * cY + dy * sY * sX) * s;
  cam.tTarget.y -= dy * cX * s;
  cam.tTarget.z -= (-dx * sY + dy * cY * sX) * s;
}

/* ── Particle field ─────────────────────────────────────────────── */

export class Field {
  readonly n: number;
  pos: Float32Array;
  edgeIdx: Int32Array;
  t: Float32Array;
  speed: Float32Array;
  ox: Float32Array; oy: Float32Array; oz: Float32Array;
  avx: Float32Array; avy: Float32Array; avz: Float32Array;

  constructor(n: number) {
    this.n = n;
    // 4 floats per particle: x, y, z, kind (0=ambient, 1=comment, 2=run, 3=activity, 4=subissue, 5=issue)
    this.pos = new Float32Array(n * 4);
    this.edgeIdx = new Int32Array(n);
    this.t = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.ox = new Float32Array(n); this.oy = new Float32Array(n); this.oz = new Float32Array(n);
    this.avx = new Float32Array(n); this.avy = new Float32Array(n); this.avz = new Float32Array(n);
    for (let i = 0; i < n; i++) this.edgeIdx[i] = -1;
  }

  respawn(i: number, edges: Edge[], nodes: MindNode[]) {
    // 88% edge-bound (flowing along causal + spatial paths), 12%
    // ambient. Fewer ambient particles keeps the focus on the
    // structural flow while still providing atmospheric depth.
    const use = edges.length > 0 && Math.random() < 0.88;
    const i4 = i * 4;
    if (use) {
      this.edgeIdx[i] = Math.floor(Math.random() * edges.length);
      this.t[i] = Math.random();
      this.speed[i] = 0.18 + Math.random() * 0.24;
      const off = 6 + Math.random() * 12; // tighter tubes so flow is visible
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      this.ox[i] = Math.sin(ph) * Math.cos(th) * off;
      this.oy[i] = Math.sin(ph) * Math.sin(th) * off;
      this.oz[i] = Math.cos(ph) * off;
      const e = edges[this.edgeIdx[i]];
      const p = nodes[e.parentIdx].pos, c = nodes[e.childIdx].pos;
      const tt = this.t[i];
      this.pos[i4] = p.x + (c.x - p.x) * tt + this.ox[i];
      this.pos[i4 + 1] = p.y + (c.y - p.y) * tt + this.oy[i];
      this.pos[i4 + 2] = p.z + (c.z - p.z) * tt + this.oz[i];
      // Encode destination node's kind as 4th float for shader tinting
      const destKind = nodes[e.childIdx].thought.kind;
      this.pos[i4 + 3] = destKind === "comment" ? 1 : destKind === "run" ? 2 : destKind === "activity" ? 3 : destKind === "subissue" ? 4 : destKind === "ancestor" ? 6 : 5;
    } else {
      // Ambient: uniformly fill a sphere. Cube-root distribution for
      // uniform density inside the volume.
      this.edgeIdx[i] = -1;
      const brainR = 220; // tighter to match structured layout
      const ph2 = Math.acos(2 * Math.random() - 1);
      const th2 = Math.random() * Math.PI * 2;
      const rr = Math.cbrt(Math.random()) * brainR;
      const px = Math.sin(ph2) * Math.cos(th2) * rr;
      const py = Math.sin(ph2) * Math.sin(th2) * rr;
      const pz = Math.cos(ph2) * rr;
      this.pos[i4] = px;
      this.pos[i4 + 1] = py;
      this.pos[i4 + 2] = pz;
      this.pos[i4 + 3] = 0; // ambient
      this.avx[i] = (Math.random() - 0.5) * 6;
      this.avy[i] = (Math.random() - 0.5) * 6;
      this.avz[i] = (Math.random() - 0.5) * 6;
    }
  }

  seedAll(edges: Edge[], nodes: MindNode[]) {
    for (let i = 0; i < this.n; i++) this.respawn(i, edges, nodes);
  }

  update(dt: number, edges: Edge[], nodes: MindNode[], attract: Vec3 | null, attractStr: number, time: number) {
    const n = this.n, damp = Math.max(0, 1 - dt * 0.35);
    const aR = 220, aR2 = aR * aR;
    const boundR2 = 340 * 340; // spherical boundary for ambient particles
    const pos = this.pos;
    // Gentle global swirl around TWO axes — Y (primary) and X (secondary).
    // A single-axis swirl lets the perpendicular velocity component decay
    // to zero via damping, which collapses the sphere into a flat disc
    // over time.  Two perpendicular swirls keep all three velocity
    // components alive so the volumetric shape is sustained indefinitely.
    const swirlY = 8 * dt;
    const syCos = Math.cos(swirlY), sySin = Math.sin(swirlY);
    const swirlX = 5 * dt;               // slower, different rate
    const sxCos = Math.cos(swirlX), sxSin = Math.sin(swirlX);
    for (let i = 0; i < n; i++) {
      const i4 = i * 4, eIdx = this.edgeIdx[i];
      if (eIdx >= 0) {
        if (eIdx >= edges.length) { this.respawn(i, edges, nodes); continue; }
        const e = edges[eIdx], p = nodes[e.parentIdx].pos, c = nodes[e.childIdx].pos;
        this.t[i] += this.speed[i] * dt;
        if (this.t[i] >= 1) { this.respawn(i, edges, nodes); continue; }
        const tt = this.t[i];
        pos[i4] = p.x + (c.x - p.x) * tt + this.ox[i];
        pos[i4 + 1] = p.y + (c.y - p.y) * tt + this.oy[i];
        pos[i4 + 2] = p.z + (c.z - p.z) * tt + this.oz[i];
      } else {
        let vx = this.avx[i], vy = this.avy[i], vz = this.avz[i];
        const px = pos[i4], py = pos[i4 + 1], pz = pos[i4 + 2];
        vx -= px * 0.18 * dt; vy -= py * 0.18 * dt; vz -= pz * 0.18 * dt;
        if (attract && attractStr > 0) {
          const dx = attract.x - px, dy = attract.y - py, dz = attract.z - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < aR2 && d2 > 4) {
            const d = Math.sqrt(d2), pull = attractStr * (1 - d / aR) * 340 * dt;
            vx += dx / d * pull; vy += dy / d * pull; vz += dz / d * pull;
          }
        }
        vx *= damp; vy *= damp; vz *= damp;
        // Swirl around Y axis (rotates vx ↔ vz)
        const svx = vx * syCos + vz * sySin;
        let svz = -vx * sySin + vz * syCos;
        // Swirl around X axis (rotates vy ↔ vz), prevents Y-collapse
        const svy = vy * sxCos + svz * sxSin;
        svz    = -vy * sxSin + svz * sxCos;
        this.avx[i] = svx; this.avy[i] = svy; this.avz[i] = svz;
        pos[i4] = px + svx * dt; pos[i4 + 1] = py + svy * dt; pos[i4 + 2] = pz + svz * dt;
        // Respawn when outside the spherical boundary
        if (pos[i4] * pos[i4] + pos[i4 + 1] * pos[i4 + 1] + pos[i4 + 2] * pos[i4 + 2] > boundR2)
          this.respawn(i, edges, nodes);
      }
    }
  }
}

/* ── Glow sprite ────────────────────────────────────────────────── */

export class SpriteCache {
  private c = new Map<string, HTMLCanvasElement>();
  get(color: string, size = 128, hardness = 0.15) {
    const k = `${color}@${size}@${hardness}`;
    let s = this.c.get(k);
    if (!s) {
      s = document.createElement("canvas"); s.width = size; s.height = size;
      const ctx = s.getContext("2d")!;
      const cx = size / 2, g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      const b = color.length === 7 ? color : "#F2E6C4";
      g.addColorStop(0, b + "FF"); g.addColorStop(hardness, b + "CC");
      g.addColorStop(0.5, b + "44"); g.addColorStop(0.82, b + "11"); g.addColorStop(1, b + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      this.c.set(k, s);
    }
    return s;
  }
  clear() { this.c.clear(); }
}
