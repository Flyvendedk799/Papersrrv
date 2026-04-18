// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CUE_URLS, POSE_TO_CUE, type PapeeCue } from "./papee-soundtrack";

describe("papee-soundtrack (PAPEE_TOOLS_PLAN.md §Z.9)", () => {
  it("every cue has a generated WAV data URL", () => {
    for (const cue of Object.keys(CUE_URLS) as PapeeCue[]) {
      const url = CUE_URLS[cue];
      expect(url.startsWith("data:audio/wav;base64,"), `cue=${cue}`).toBe(true);
      expect(url.length, `cue=${cue}`).toBeGreaterThan(100);
    }
  });

  it("pose→cue mapping references real cues", () => {
    for (const cue of Object.values(POSE_TO_CUE)) {
      expect(cue && CUE_URLS[cue]).toBeDefined();
    }
  });

  it("9 distinct foley cues defined", () => {
    expect(Object.keys(CUE_URLS).length).toBe(9);
  });
});
