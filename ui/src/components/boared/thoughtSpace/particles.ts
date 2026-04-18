import type { Stream } from "./stream";

/* ─────────────────────────────────────────────────────────────────────
 *  ParticlePool — struct-of-arrays particle system.
 *
 *  Thousands of particles drift along the stream's velocity field,
 *  colored by the author node nearest their spawn location. They
 *  respawn when they age out, leave the viewport, or get caught in a
 *  burst.
 *
 *  The update step is O(n) with tiny per-particle cost:
 *    1. Look up the stream field at the particle's cell (O(1))
 *    2. Nudge velocity toward the downstream tangent
 *    3. Add a slow curl-like perturbation (sin/cos of position)
 *    4. If a cursor/attract point is near, pull toward it
 *    5. Integrate, damp, advance life
 *
 *  Rendering is batched by tint (8 groups) using `fillRect` — one
 *  `fillStyle` set per group, zero per-particle style changes.
 * ───────────────────────────────────────────────────────────────────── */

export interface TintStop {
  u: number;      // stream position
  color: string;  // hex color
}

export class ParticlePool {
  readonly n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  size: Float32Array;
  tint: Uint8Array;   // index into caller-supplied tint palette

  constructor(n: number) {
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.tint = new Uint8Array(n);
  }

  seedAll(stream: Stream, pickTint: (u: number) => number) {
    for (let i = 0; i < this.n; i++) {
      this.respawn(i, stream, pickTint);
    }
  }

  respawn(i: number, stream: Stream, pickTint: (u: number) => number) {
    const u = Math.random();
    const perp = (Math.random() - 0.5) * Math.min(stream.w, stream.h) * 0.5;
    const p = stream.offsetFrom(u, perp);
    this.x[i] = p.x + (Math.random() - 0.5) * 24;
    this.y[i] = p.y + (Math.random() - 0.5) * 24;
    const speed = 0.5 + Math.random() * 0.9;
    this.vx[i] = p.tx * speed;
    this.vy[i] = p.ty * speed;
    this.life[i] = Math.random() * 0.3; // stagger initial age
    this.maxLife[i] = 4 + Math.random() * 6;
    this.size[i] = 0.4 + Math.random() * 1.3;
    this.tint[i] = pickTint(u);
  }

  /** Update loop. All units: px, seconds. */
  update(
    dtSec: number,
    stream: Stream,
    pickTint: (u: number) => number,
    opts: {
      attractX: number | null;
      attractY: number | null;
      attractStrength: number;
      attractRadius: number;
      burstX: number | null;
      burstY: number | null;
      burstStrength: number;
      time: number;
    },
  ) {
    const w = stream.w;
    const h = stream.h;
    const { attractX, attractY, attractStrength, attractRadius, burstX, burstY, burstStrength, time } = opts;
    const attractR2 = attractRadius * attractRadius;
    const burstR2 = 260 * 260;
    const damping = Math.max(0, 1 - dtSec * 0.7);
    const baseSpeed = 60; // px/sec nominal downstream speed
    const curlAmp = 14;

    for (let i = 0; i < this.n; i++) {
      const px = this.x[i];
      const py = this.y[i];

      // Stream field nudge — steer velocity toward stream tangent
      const field = stream.sampleField(px, py);
      const wantVx = field.tx * baseSpeed * (0.4 + 0.9 * field.strength);
      const wantVy = field.ty * baseSpeed * (0.4 + 0.9 * field.strength);
      const steerK = 0.9 * dtSec * (0.5 + field.strength);
      let vx = this.vx[i] + (wantVx - this.vx[i]) * steerK;
      let vy = this.vy[i] + (wantVy - this.vy[i]) * steerK;

      // Curl-ish perturbation — gives each particle a swimming wiggle
      const noise = Math.sin((px + py) * 0.012 + time * 0.7 + i * 0.002);
      vx += -field.ty * noise * curlAmp * dtSec;
      vy += field.tx * noise * curlAmp * dtSec;

      // Cursor attraction — iron-filing pull toward hovered node
      if (attractX !== null && attractY !== null && attractStrength > 0) {
        const dx = attractX - px;
        const dy = attractY - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < attractR2 && d2 > 4) {
          const d = Math.sqrt(d2);
          const falloff = 1 - d / attractRadius;
          const pull = attractStrength * falloff * 260 * dtSec;
          vx += (dx / d) * pull;
          vy += (dy / d) * pull;
        }
      }

      // Burst push — outward shove from a recent click/event
      if (burstX !== null && burstY !== null && burstStrength > 0) {
        const dx = px - burstX;
        const dy = py - burstY;
        const d2 = dx * dx + dy * dy;
        if (d2 < burstR2 && d2 > 4) {
          const d = Math.sqrt(d2);
          const falloff = 1 - d / 260;
          const push = burstStrength * falloff * 340 * dtSec;
          vx += (dx / d) * push;
          vy += (dy / d) * push;
        }
      }

      // Integrate
      vx *= damping;
      vy *= damping;
      this.vx[i] = vx;
      this.vy[i] = vy;
      const nx = px + vx * dtSec;
      const ny = py + vy * dtSec;
      this.x[i] = nx;
      this.y[i] = ny;

      // Age
      this.life[i] += dtSec;

      // Respawn if too old or off-screen
      if (
        this.life[i] > this.maxLife[i] ||
        nx < -30 ||
        nx > w + 30 ||
        ny < -30 ||
        ny > h + 30
      ) {
        this.respawn(i, stream, pickTint);
      }
    }
  }
}
