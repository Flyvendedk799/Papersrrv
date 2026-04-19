/**
 * timeMap — maps real timestamps to a normalised [0, 1] X axis for
 * the Dossier chronicle. Compresses long quiet periods so they don't
 * swallow the visualization while keeping dense periods legible.
 *
 * The honest choice would be linear calendar time ("1 day = same
 * screen width every time") but realistic issues have enormous
 * dynamic range — a ticket opened in Feb, worked on in June, closed
 * in August would render as three clusters separated by empty
 * months. Nothing to look at, no story to read.
 *
 * Instead we build a piecewise-linear mapping where any gap between
 * consecutive events longer than `QUIET_THRESHOLD_MS` collapses to a
 * small `QUIET_GAP_WIDTH`. Active stretches (where events are
 * clustered) pass through at roughly linear scale. The resulting X
 * axis reads as "event-time" while still respecting chronological
 * order.
 *
 * Usage:
 *
 *   const tm = buildTimeMap([issueCreatedMs, ...commentMs, ...runMs, now]);
 *   const x = tm.toX(someTs); // 0..1
 *   const gaps = tm.gaps;      // where the ribbon should draw "· · ·"
 */

export interface TimeGap {
  /** Real timestamp where the gap starts. */
  fromTs: number;
  /** Real timestamp where the gap ends (next event). */
  toTs: number;
  /** X position [0, 1] on the compressed axis where the gap sits. */
  atX: number;
}

export interface TimeMap {
  readonly minTs: number;
  readonly maxTs: number;
  /** All breakpoints on the piecewise-linear mapping. */
  readonly breakpoints: ReadonlyArray<{ ts: number; x: number }>;
  /** Gap regions the ribbon can render as compressed. */
  readonly gaps: ReadonlyArray<TimeGap>;
  /** Map a real timestamp to X on [0, 1]. Clamped at endpoints. */
  toX(ts: number): number;
  /** Inverse: given an X on [0, 1], what real ts does it represent? */
  fromX(x: number): number;
}

/** Anything over this gap between consecutive events is "quiet". */
const QUIET_THRESHOLD_MS = 12 * 60 * 60 * 1000;         // 12 h
/** Minimum gap width so two adjacent events aren't on top of each
 * other even in the busiest stretch. In unit time (ms), small. */
const MIN_EVENT_STEP_MS = 60 * 1000;                    // 1 min
/** Quiet gaps collapse to this compressed width (in unit time). */
const QUIET_GAP_COMPRESSED_MS = 30 * 60 * 1000;         // 30 min-equivalent

/**
 * Build the compressed time mapping from a list of timestamps. The
 * list should include the issue's creation time, every event's
 * timestamp (comments, runs, activities, sub-matter creations), and
 * `now` so the axis extends to the present.
 */
export function buildTimeMap(timestamps: number[]): TimeMap {
  if (timestamps.length === 0) {
    return emptyTimeMap();
  }
  const sorted = [...new Set(timestamps)].sort((a, b) => a - b);
  if (sorted.length === 1) {
    const ts = sorted[0];
    return {
      minTs: ts,
      maxTs: ts,
      breakpoints: [{ ts, x: 0.5 }],
      gaps: [],
      toX: () => 0.5,
      fromX: () => ts,
    };
  }

  const minTs = sorted[0];
  const maxTs = sorted[sorted.length - 1];

  // Walk adjacent pairs building a "unit time" axis where quiet gaps
  // are compressed. Each event contributes a MIN_EVENT_STEP_MS bump
  // so identical or near-simultaneous events don't collide at the
  // same X; gaps between events add min(real_gap, compressed_gap).
  const gaps: TimeGap[] = [];
  type Seg = { fromTs: number; toTs: number; fromU: number; toU: number; isGap: boolean };
  const segs: Seg[] = [];
  let unit = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const real = b - a;
    const isGap = real > QUIET_THRESHOLD_MS;
    const consumed = isGap ? QUIET_GAP_COMPRESSED_MS : Math.max(real, MIN_EVENT_STEP_MS);
    segs.push({ fromTs: a, toTs: b, fromU: unit, toU: unit + consumed, isGap });
    unit += consumed;
  }
  const totalUnit = Math.max(1, unit);

  // Normalise unit-time to [0, 1] for breakpoints + gap overlay.
  const breakpoints: Array<{ ts: number; x: number }> = [{ ts: sorted[0], x: 0 }];
  for (const s of segs) {
    breakpoints.push({ ts: s.toTs, x: s.toU / totalUnit });
    if (s.isGap) {
      gaps.push({ fromTs: s.fromTs, toTs: s.toTs, atX: (s.fromU + s.toU) / 2 / totalUnit });
    }
  }

  const toX = (ts: number): number => {
    if (ts <= minTs) return 0;
    if (ts >= maxTs) return 1;
    // Binary search through breakpoints (linear is fine at typical
    // issue sizes; keeping it simple).
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const b0 = breakpoints[i];
      const b1 = breakpoints[i + 1];
      if (ts >= b0.ts && ts <= b1.ts) {
        if (b1.ts === b0.ts) return b0.x;
        const t = (ts - b0.ts) / (b1.ts - b0.ts);
        return b0.x + t * (b1.x - b0.x);
      }
    }
    return 1;
  };

  const fromX = (x: number): number => {
    const c = Math.max(0, Math.min(1, x));
    if (c === 0) return minTs;
    if (c === 1) return maxTs;
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const b0 = breakpoints[i];
      const b1 = breakpoints[i + 1];
      if (c >= b0.x && c <= b1.x) {
        if (b1.x === b0.x) return b0.ts;
        const t = (c - b0.x) / (b1.x - b0.x);
        return b0.ts + t * (b1.ts - b0.ts);
      }
    }
    return maxTs;
  };

  return { minTs, maxTs, breakpoints, gaps, toX, fromX };
}

function emptyTimeMap(): TimeMap {
  const now = Date.now();
  return {
    minTs: now,
    maxTs: now,
    breakpoints: [{ ts: now, x: 0.5 }],
    gaps: [],
    toX: () => 0.5,
    fromX: () => now,
  };
}
