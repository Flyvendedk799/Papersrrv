/* ─────────────────────────────────────────────────────────────────────
 *  Stream — the curving river that runs through the thought network.
 *
 *  A parametric curve from "origin" (u=0, left) to "now" (u=1, right).
 *  Built from N samples with precomputed tangents and cumulative arc
 *  length, so `sampleAt(u)` returns a point at uniform arc-length speed
 *  regardless of how wiggly the curve is.
 *
 *  `buildVelocityGrid()` produces a cheap O(1) vector-field lookup used
 *  by the particle system: every cell stores the tangent of the closest
 *  stream point and a 0..1 proximity strength. Particles read the grid
 *  and drift downstream without a per-frame projection search.
 * ───────────────────────────────────────────────────────────────────── */

export interface StreamSample {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export class Stream {
  w: number;
  h: number;
  samples: StreamSample[] = [];
  cumLen: number[] = [];
  totalLen = 0;

  readonly gridCols = 64;
  readonly gridRows = 40;
  velocityGrid: Float32Array;

  constructor(w: number, h: number, seed = 0) {
    this.w = w;
    this.h = h;
    this.velocityGrid = new Float32Array(this.gridCols * this.gridRows * 3);
    this.build(seed);
    this.buildVelocityGrid();
  }

  private build(seed: number) {
    const N = 260;
    const padX = this.w * 0.08;
    const x0 = padX;
    const x1 = this.w - padX;
    const midY = this.h * 0.52;
    const ampY = this.h * 0.22;
    const samples: StreamSample[] = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = lerp(x0, x1, u);
      // Layered sines — a calm, organic river with two visible bends.
      const y =
        midY +
        Math.sin(u * Math.PI * 1.6 + seed) * ampY * 0.55 +
        Math.sin(u * Math.PI * 3.1 + seed * 1.7) * ampY * 0.18 +
        Math.sin(u * Math.PI * 0.9 + 0.4 + seed * 0.3) * ampY * 0.32;
      samples.push({ x, y, tx: 0, ty: 0 });
    }
    // Tangents (central differences)
    for (let i = 0; i < N; i++) {
      const prev = samples[Math.max(0, i - 1)];
      const next = samples[Math.min(N - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const L = Math.hypot(dx, dy) || 1;
      samples[i].tx = dx / L;
      samples[i].ty = dy / L;
    }
    // Cumulative arc length
    const cum: number[] = [0];
    let total = 0;
    for (let i = 1; i < N; i++) {
      total += Math.hypot(
        samples[i].x - samples[i - 1].x,
        samples[i].y - samples[i - 1].y,
      );
      cum.push(total);
    }
    this.samples = samples;
    this.cumLen = cum;
    this.totalLen = total;
  }

  /** Sample at u ∈ [0,1] with uniform arc-length spacing. */
  sampleAt(u: number): StreamSample {
    const u01 = u < 0 ? 0 : u > 1 ? 1 : u;
    const target = u01 * this.totalLen;
    const cum = this.cumLen;
    // Binary search the sample interval that contains `target`.
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const segLen = Math.max(1e-6, cum[hi] - cum[lo]);
    const t = (target - cum[lo]) / segLen;
    const a = this.samples[lo];
    const b = this.samples[hi];
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      tx: lerp(a.tx, b.tx, t),
      ty: lerp(a.ty, b.ty, t),
    };
  }

  /** Project (x,y) to nearest sample. O(N) — only used at layout time. */
  project(x: number, y: number): { u: number; sample: StreamSample; dist: number } {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const dx = this.samples[i].x - x;
      const dy = this.samples[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return {
      u: this.cumLen[bestI] / (this.totalLen || 1),
      sample: this.samples[bestI],
      dist: Math.sqrt(bestD),
    };
  }

  /** Point on stream at `u`, offset perpendicular by `perp` pixels. */
  offsetFrom(u: number, perp: number): { x: number; y: number; tx: number; ty: number } {
    const s = this.sampleAt(u);
    // Left-hand normal: (-ty, tx)
    return {
      x: s.x - s.ty * perp,
      y: s.y + s.tx * perp,
      tx: s.tx,
      ty: s.ty,
    };
  }

  /** Build the velocity grid used by particles. */
  private buildVelocityGrid() {
    const grid = this.velocityGrid;
    const cellW = this.w / this.gridCols;
    const cellH = this.h / this.gridRows;
    const falloff = Math.max(this.h * 0.28, 120);
    for (let gy = 0; gy < this.gridRows; gy++) {
      for (let gx = 0; gx < this.gridCols; gx++) {
        const wx = (gx + 0.5) * cellW;
        const wy = (gy + 0.5) * cellH;
        const p = this.project(wx, wy);
        const strength = Math.max(0, 1 - p.dist / falloff);
        const base = (gy * this.gridCols + gx) * 3;
        grid[base] = p.sample.tx;
        grid[base + 1] = p.sample.ty;
        grid[base + 2] = strength;
      }
    }
  }

  /** O(1) field lookup for particle update. */
  sampleField(x: number, y: number): { tx: number; ty: number; strength: number } {
    let gx = Math.floor((x / this.w) * this.gridCols);
    let gy = Math.floor((y / this.h) * this.gridRows);
    if (gx < 0) gx = 0;
    else if (gx >= this.gridCols) gx = this.gridCols - 1;
    if (gy < 0) gy = 0;
    else if (gy >= this.gridRows) gy = this.gridRows - 1;
    const base = (gy * this.gridCols + gx) * 3;
    return {
      tx: this.velocityGrid[base],
      ty: this.velocityGrid[base + 1],
      strength: this.velocityGrid[base + 2],
    };
  }
}
