// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { PapeeAnimationScheduler } from "./papee-scheduler";

describe("PapeeAnimationScheduler (PAPEE_TOOLS_PLAN.md §Z.6)", () => {
  // Diagnostic: run with real performance.now and real timers.
  // We hand-instrument time advancement by directly manipulating
  // the scheduler's internal lastChangeAt via a long sleep.
  // For dead-man we use fake timers in a single test.
  function advance(ms: number) {
    vi.advanceTimersByTime(ms);
  }

  it("critical priority preempts immediately", () => {
    const applied: string[] = [];
    const sch = new PapeeAnimationScheduler({
      apply: (p) => applied.push(p),
      forceIdlePick: () => {},
    });
    // Critical preempts no matter what — bypasses debounce + priority
    sch.schedule({ pose: "alarmed", priority: "critical" });
    expect(applied).toEqual(["alarmed"]);
    sch.dispose();
  });

  it("debounces a second idle schedule fired immediately after the first", async () => {
    const applied: string[] = [];
    const sch = new PapeeAnimationScheduler({
      apply: (p) => applied.push(p),
      forceIdlePick: () => {},
    });
    // First call: should bypass debounce because lastChangeAt==0 and now is large
    sch.schedule({ pose: "scanning", priority: "idle" });
    const afterFirst = applied.length;
    sch.schedule({ pose: "humming", priority: "idle" });
    // Second call within ~1ms is below the 1200ms idle floor → dropped
    expect(applied.length).toBe(afterFirst);
    sch.dispose();
  });

  it("dead-man switch fires forceIdlePick on its 8s timer", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    let forced = 0;
    const sch = new PapeeAnimationScheduler({
      apply: () => {},
      forceIdlePick: () => {
        forced++;
      },
    });
    advance(8001);
    expect(forced).toBeGreaterThanOrEqual(1);
    sch.dispose();
    vi.useRealTimers();
  });

  it("a higher-priority schedule eventually fires", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const applied: string[] = [];
    const sch = new PapeeAnimationScheduler({
      apply: (p) => applied.push(p),
      forceIdlePick: () => {},
    });
    sch.schedule({ pose: "idle", priority: "idle", durationMs: 1500 });
    sch.schedule({ pose: "thinking", priority: "narrative" });
    advance(2000);
    expect(applied).toContain("thinking");
    sch.dispose();
    vi.useRealTimers();
  });
});
