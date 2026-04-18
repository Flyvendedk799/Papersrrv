// @vitest-environment node
import { describe, it, expect } from "vitest";
import { pickIdlePose, MOOD_POOLS } from "./papee-idle-pool";

describe("papee-idle-pool (PAPEE_TOOLS_PLAN.md §Z.1)", () => {
  it("never picks a recent pose", () => {
    const pick = pickIdlePose({
      mood: "calm",
      page: "dashboard",
      msOnPage: 5000,
      hour: 14,
      recent: ["idle-blink", "idle-look-around"],
    });
    expect(pick).not.toBe("idle-blink");
    expect(pick).not.toBe("idle-look-around");
  });

  it("biases sleepy after 22:00", () => {
    let sleepyHits = 0;
    for (let i = 0; i < 200; i++) {
      const p = pickIdlePose({
        mood: "calm",
        page: "dashboard",
        msOnPage: 0,
        hour: 23,
        recent: [],
      });
      if (p === "sleepy-nod" || p === "yawning") sleepyHits++;
    }
    // Should be measurable, not zero
    expect(sleepyHits).toBeGreaterThan(5);
  });

  it("each mood pool sums to ~100", () => {
    for (const mood of Object.keys(MOOD_POOLS) as (keyof typeof MOOD_POOLS)[]) {
      const sum = MOOD_POOLS[mood].reduce((a, e) => a + e.weight, 0);
      expect(sum).toBeGreaterThanOrEqual(95);
      expect(sum).toBeLessThanOrEqual(105);
    }
  });
});
