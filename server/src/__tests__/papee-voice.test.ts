import { describe, it, expect } from "vitest";
import { buildVoicePrefix } from "../services/papee-voice.js";

describe("papee-voice (PAPEE_TOOLS_PLAN.md §M.7)", () => {
  it("includes core rules block", () => {
    const out = buildVoicePrefix();
    expect(out).toContain("VOICE RULES");
    expect(out).toContain("Warm competence");
    expect(out).toContain("Terse by default");
  });

  it("appends mood modifier when mood provided", () => {
    expect(buildVoicePrefix({ mood: "urgent" })).toContain("Mood: urgent");
    expect(buildVoicePrefix({ mood: "happy" })).toContain("Mood: happy");
    expect(buildVoicePrefix({ mood: "guarding" })).toContain("Mood: guarding");
  });

  it("appends memory block when present", () => {
    const out = buildVoicePrefix({ memoryBlock: "WHO YOU'RE TALKING TO:\n- nickname: Boss" });
    expect(out).toContain("WHO YOU'RE TALKING TO");
    expect(out).toContain("Boss");
  });

  it("omits memory block when empty", () => {
    const out = buildVoicePrefix({ memoryBlock: "" });
    expect(out).not.toContain("WHO YOU'RE TALKING TO");
  });

  it("urgent mood enforces single-sentence rule", () => {
    const out = buildVoicePrefix({ mood: "urgent" });
    expect(out).toMatch(/ONE sentence|1.sentence/i);
  });
});
