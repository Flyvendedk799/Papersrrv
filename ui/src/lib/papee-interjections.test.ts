// @vitest-environment node
import { describe, it, expect } from "vitest";
import { canFire, markFired, INTERJECT_TRIGGERS } from "./papee-interjections";

describe("papee-interjections (PAPEE_TOOLS_PLAN.md §M.6)", () => {
  it("respects per-trigger cooldown", () => {
    let ledger = {};
    const trigger = INTERJECT_TRIGGERS.agent_error!;
    expect(canFire(ledger, trigger)).toBe(true);
    ledger = markFired(ledger, trigger.id);
    expect(canFire(ledger, trigger)).toBe(false);
  });

  it("respects session-global 20s cooldown across triggers", () => {
    let ledger = {};
    ledger = markFired(ledger, INTERJECT_TRIGGERS.run_failed!.id);
    // A different trigger should also be blocked by the 20s global floor
    expect(canFire(ledger, INTERJECT_TRIGGERS.new_comment!)).toBe(false);
  });
});
