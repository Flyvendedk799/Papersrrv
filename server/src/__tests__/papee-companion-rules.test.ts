import { describe, expect, it } from "vitest";
import { advanceRitualProgress, interactionDelta } from "../services/papee-companion-rules.js";

describe("papee companion ritual rules", () => {
  it("advances ritual steps and completes at the final step", () => {
    const nowIso = "2026-04-17T10:00:00.000Z";
    const first = advanceRitualProgress("pulse_sweep", {}, "advance", nowIso);
    expect(first.currentStep).toBe(0);
    expect(first.nextStep).toBe(1);
    expect(first.completed).toBe(false);
    expect(first.progressed).toBe(true);

    const complete = advanceRitualProgress("pulse_sweep", first.progress, "complete", nowIso);
    expect(complete.nextStep).toBe(2);
    expect(complete.completed).toBe(true);
    expect(complete.progress["pulse_sweep"]?.completedAt).toBe(nowIso);
  });

  it("keeps progress idempotent at the final step", () => {
    const nowIso = "2026-04-17T10:00:00.000Z";
    const done = advanceRitualProgress(
      "focus_sprint",
      { focus_sprint: { step: 2, completedAt: nowIso } },
      "advance",
      nowIso,
    );
    expect(done.nextStep).toBe(2);
    expect(done.completed).toBe(true);
  });

  it("applies interaction reward deltas", () => {
    expect(interactionDelta({ type: "pet" })).toEqual({ bondDelta: 3, energyDelta: 4 });
    expect(interactionDelta({ type: "focus_action" })).toEqual({ bondDelta: 2, energyDelta: -2 });
    expect(interactionDelta({ type: "chat_prompt" })).toEqual({ bondDelta: 1, energyDelta: -1 });
  });
});
