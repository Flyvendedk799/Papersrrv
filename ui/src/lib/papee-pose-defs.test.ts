// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPoseDef, POSE_DEFS } from "./papee-pose-defs";
import type { PapeeAnimState } from "@/components/papee/PapeeSprites";

describe("papee-pose-defs (PAPEE_TOOLS_PLAN.md §Z.2)", () => {
  it("returns a default for unknown poses", () => {
    const def = getPoseDef("unknown" as PapeeAnimState);
    expect(def).toBeDefined();
    expect(def.exit).toBeDefined();
    expect(def.entry).toBeDefined();
    expect(typeof def.weight).toBe("number");
  });

  it("every declared pose has weight in [1, 6]", () => {
    for (const [name, def] of Object.entries(POSE_DEFS)) {
      expect(def!.weight, `pose=${name}`).toBeGreaterThanOrEqual(1);
      expect(def!.weight, `pose=${name}`).toBeLessThanOrEqual(6);
    }
  });

  it("celebrating + jumping carry the heaviest weights", () => {
    expect(getPoseDef("celebrating").weight).toBeGreaterThanOrEqual(4);
    expect(getPoseDef("jumping").weight).toBeGreaterThanOrEqual(4);
  });
});
