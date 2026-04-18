import type { PapeeAnimState } from "@/components/papee/PapeeSprites";

/**
 * PAPEE_TOOLS_PLAN.md §Z.2 — Transition glue metadata.
 *
 * Each pose declares an exit shape, an entry shape, and a "weight"
 * (how much physical bridge displacement to apply). Used by the
 * scheduler crossfade to make pose changes feel deliberate instead of
 * popping.
 */

export interface PoseDef {
  exit: "blink" | "crouch" | "lean-back" | "shrug";
  entry: "bounce-in" | "slide-in" | "pop-in" | "fade-in";
  /** Bridge Y-translate in pixels during the crossfade. */
  weight: number;
}

const DEFAULT_DEF: PoseDef = { exit: "blink", entry: "fade-in", weight: 2 };

export const POSE_DEFS: Partial<Record<PapeeAnimState, PoseDef>> = {
  idle: { exit: "blink", entry: "fade-in", weight: 1 },
  "idle-blink": { exit: "blink", entry: "fade-in", weight: 1 },
  "idle-look-around": { exit: "blink", entry: "fade-in", weight: 1 },
  walking: { exit: "lean-back", entry: "slide-in", weight: 3 },
  jumping: { exit: "crouch", entry: "bounce-in", weight: 6 },
  thinking: { exit: "shrug", entry: "fade-in", weight: 2 },
  celebrating: { exit: "crouch", entry: "bounce-in", weight: 5 },
  alarmed: { exit: "lean-back", entry: "pop-in", weight: 4 },
  sleeping: { exit: "blink", entry: "fade-in", weight: 1 },
  waving: { exit: "shrug", entry: "bounce-in", weight: 3 },
  "thumbs-up": { exit: "shrug", entry: "bounce-in", weight: 3 },
  guarding: { exit: "crouch", entry: "pop-in", weight: 4 },
  "pointing-left": { exit: "shrug", entry: "slide-in", weight: 3 },
  "pointing-right": { exit: "shrug", entry: "slide-in", weight: 3 },
  typing: { exit: "shrug", entry: "fade-in", weight: 2 },
  writing: { exit: "shrug", entry: "fade-in", weight: 2 },
  scanning: { exit: "blink", entry: "slide-in", weight: 2 },
  magnifying: { exit: "blink", entry: "pop-in", weight: 3 },
  digging: { exit: "crouch", entry: "fade-in", weight: 4 },
  unlocking: { exit: "lean-back", entry: "pop-in", weight: 3 },
  "throwing-switch": { exit: "lean-back", entry: "bounce-in", weight: 5 },
  stopping: { exit: "lean-back", entry: "pop-in", weight: 4 },
  shush: { exit: "blink", entry: "fade-in", weight: 1 },
  broom: { exit: "shrug", entry: "slide-in", weight: 3 },
  ledger: { exit: "shrug", entry: "fade-in", weight: 2 },
  "sleepy-nod": { exit: "blink", entry: "fade-in", weight: 1 },
  humming: { exit: "blink", entry: "fade-in", weight: 1 },
  yawning: { exit: "lean-back", entry: "fade-in", weight: 2 },
  stretching: { exit: "lean-back", entry: "fade-in", weight: 3 },
  squint: { exit: "blink", entry: "fade-in", weight: 1 },
  pacing: { exit: "lean-back", entry: "slide-in", weight: 3 },
  "head-tilt": { exit: "blink", entry: "fade-in", weight: 1 },
  "sigh-of-relief": { exit: "blink", entry: "fade-in", weight: 2 },
  "speaking-gesture": { exit: "shrug", entry: "fade-in", weight: 2 },
};

export function getPoseDef(pose: PapeeAnimState): PoseDef {
  return POSE_DEFS[pose] ?? DEFAULT_DEF;
}
