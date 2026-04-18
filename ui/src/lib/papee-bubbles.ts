/**
 * PAPEE_TOOLS_PLAN.md §Z.7 — Speech-bubble choreography rules.
 *
 * Bubbles pair with poses on a strict timing contract:
 *
 *   pose beat starts
 *       ↓ 120ms
 *   bubble fades in
 *       ↓ hold (600ms + 25ms per word, clamped [900, 5000])
 *   bubble fades out (400ms)
 *
 * Stacking rules:
 *   - Max 2 visible at once. New bubble pushes the older one up 28px
 *     and shrinks it 10% (depth cue).
 *   - Critical bubbles replace the stack and outline in alert color.
 *   - `shush` pose suppresses all bubbles for 8s (snooze).
 *   - Streaming bubbles (Z.8) use their own slot; don't count toward the stack.
 */

export type BubbleSeverity = "normal" | "critical";

export interface QueuedBubble {
  id: number;
  text: string;
  severity: BubbleSeverity;
  spawnedAt: number;
  holdMs: number;
}

export const BUBBLE_FADE_IN_MS = 120;
export const BUBBLE_FADE_OUT_MS = 400;
export const BUBBLE_HOLD_MIN = 900;
export const BUBBLE_HOLD_MAX = 5000;
export const BUBBLE_HOLD_PER_WORD = 25;
export const BUBBLE_HOLD_BASE = 600;
export const BUBBLE_STACK_MAX = 2;
export const SHUSH_MUTE_MS = 8000;

export function computeHoldMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const raw = BUBBLE_HOLD_BASE + words * BUBBLE_HOLD_PER_WORD;
  return Math.max(BUBBLE_HOLD_MIN, Math.min(BUBBLE_HOLD_MAX, raw));
}

let nextId = 1;
export function makeBubble(text: string, severity: BubbleSeverity = "normal"): QueuedBubble {
  return {
    id: nextId++,
    text,
    severity,
    spawnedAt: performance.now(),
    holdMs: computeHoldMs(text),
  };
}

export interface StackState {
  bubbles: QueuedBubble[];
  shushUntil: number;
}

export const EMPTY_STACK: StackState = { bubbles: [], shushUntil: 0 };

export function pushBubble(state: StackState, b: QueuedBubble): StackState {
  if (performance.now() < state.shushUntil && b.severity !== "critical") {
    return state;
  }
  if (b.severity === "critical") {
    // Replace the entire stack with the critical bubble
    return { ...state, bubbles: [b] };
  }
  const next = [...state.bubbles, b];
  while (next.length > BUBBLE_STACK_MAX) next.shift();
  return { ...state, bubbles: next };
}

export function pruneExpired(state: StackState): StackState {
  const now = performance.now();
  const survivors = state.bubbles.filter(
    (b) => now - b.spawnedAt < BUBBLE_FADE_IN_MS + b.holdMs + BUBBLE_FADE_OUT_MS,
  );
  if (survivors.length === state.bubbles.length) return state;
  return { ...state, bubbles: survivors };
}

export function applyShush(state: StackState): StackState {
  return { bubbles: [], shushUntil: performance.now() + SHUSH_MUTE_MS };
}
