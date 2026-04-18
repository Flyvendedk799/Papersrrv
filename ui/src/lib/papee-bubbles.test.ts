// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  applyShush,
  computeHoldMs,
  EMPTY_STACK,
  makeBubble,
  pruneExpired,
  pushBubble,
  BUBBLE_HOLD_MIN,
  BUBBLE_HOLD_MAX,
  BUBBLE_STACK_MAX,
} from "./papee-bubbles";

describe("papee-bubbles (PAPEE_TOOLS_PLAN.md §Z.7)", () => {
  it("clamps hold to [900, 5000]", () => {
    expect(computeHoldMs("a")).toBeGreaterThanOrEqual(BUBBLE_HOLD_MIN);
    expect(computeHoldMs("word ".repeat(500))).toBeLessThanOrEqual(BUBBLE_HOLD_MAX);
  });

  it("max 2 visible bubbles in stack", () => {
    let s = EMPTY_STACK;
    s = pushBubble(s, makeBubble("a"));
    s = pushBubble(s, makeBubble("b"));
    s = pushBubble(s, makeBubble("c"));
    expect(s.bubbles.length).toBe(BUBBLE_STACK_MAX);
    expect(s.bubbles.map((b) => b.text)).toEqual(["b", "c"]);
  });

  it("critical bubble replaces the stack", () => {
    let s = EMPTY_STACK;
    s = pushBubble(s, makeBubble("a"));
    s = pushBubble(s, makeBubble("b"));
    s = pushBubble(s, makeBubble("CRIT", "critical"));
    expect(s.bubbles.length).toBe(1);
    expect(s.bubbles[0]!.text).toBe("CRIT");
  });

  it("shush mutes non-critical for 8s", () => {
    let s = applyShush(EMPTY_STACK);
    s = pushBubble(s, makeBubble("dropped"));
    expect(s.bubbles.length).toBe(0);
    s = pushBubble(s, makeBubble("urgent", "critical"));
    expect(s.bubbles.length).toBe(1);
  });

  it("pruneExpired drops finished bubbles", () => {
    const old = makeBubble("old");
    old.spawnedAt = performance.now() - 10_000;
    const s = pruneExpired({ bubbles: [old], shushUntil: 0 });
    expect(s.bubbles.length).toBe(0);
  });
});
