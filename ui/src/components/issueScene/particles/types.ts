/**
 * Shared types for the neuron-native particle field.
 *
 * See plan: /Users/tobiasmastek/.claude/plans/gleaming-cooking-blanket.md
 */

/**
 * Adaptive particle tiers. Total particle count is split 80/20
 * between FIELD (Role A, home-bound orbit) and WAVE (Role B, edge-rider).
 */
export type ParticleTier = "potato" | "mini" | "default" | "hero" | "extreme";

export interface ParticleBudget {
  tier: ParticleTier;
  total: number;
  field: number; // Role A slots (orbit/home-bound)
  wave: number; // Role B slots (edge-rider / event-driven)
  /** Use CPU fallback (no GPGPU) — potato tier only. */
  cpuFallback: boolean;
  /** Sim grid side length (√total rounded up to power-of-two). */
  gridSize: number;
}

export const TIER_TOTALS: Record<ParticleTier, number> = {
  potato: 2_000,
  mini: 5_000,
  default: 15_000,
  hero: 30_000,
  extreme: 50_000,
};

/**
 * Pick a tier given a few coarse signals. Called once at mount; the runtime
 * fps monitor may downshift later.
 */
export function budgetFor(options: {
  tier: ParticleTier;
  cpuFallback?: boolean;
}): ParticleBudget {
  const total = TIER_TOTALS[options.tier];
  // 90 / 10 split — field dominates so the scene reads as tissue, not a
  // blizzard of flying waves. Wave particles stay big per-sprite so the
  // rivers of thought are still visible against the cloud.
  const field = Math.round(total * 0.9);
  const wave = total - field;
  // Pack particles into a square grid for GPGPU ping-pong. Round up to
  // the next power of two so WebGL2 is happy across the board.
  const side = Math.ceil(Math.sqrt(total));
  const gridSize = ceilPow2(side);
  return {
    tier: options.tier,
    total: gridSize * gridSize,
    field,
    wave,
    cpuFallback: options.cpuFallback ?? false,
    gridSize,
  };
}

function ceilPow2(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Particle role. Encoded in stateRT.x so the sim shader can cheap-branch
 * (though the primary split between field and wave is by buffer slice,
 * not per-particle branching).
 */
export enum Role {
  /** Role A — dead/unallocated. Position parked far offscreen. */
  Dead = 0,
  /** Role A — home-bound orbit/drift around a node centroid. */
  Field = 1,
  /** Role B — edge-rider, transient. */
  Wave = 2,
  /** Role C — chronology progression rider. */
  Chrono = 3,
}

/**
 * Event kinds emitted by useSceneEvents. Packed into eventTex row 0.
 */
export enum EventKind {
  None = 0,
  CommentPosted = 1,
  RunStarted = 2,
  RunFinished = 3,
  ApprovalDecided = 4,
  /** Drives the sub-issue branching wave. */
  SubissueSpawned = 5,
}
