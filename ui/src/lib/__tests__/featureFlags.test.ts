import { describe, expect, it } from "vitest";
import { isFeatureEnabled, getAllFlagValues } from "../featureFlags";

describe("featureFlags", () => {
  it("has sensible defaults for all keys", () => {
    const flags = getAllFlagValues();
    expect(typeof flags.issue_relevance_panel).toBe("boolean");
    expect(typeof flags.markdown_reader_core).toBe("boolean");
    expect(typeof flags.perf_instrumentation).toBe("boolean");
  });

  it("isFeatureEnabled returns a boolean for all known keys", () => {
    expect(typeof isFeatureEnabled("markdown_reader_core")).toBe("boolean");
    expect(typeof isFeatureEnabled("issue_handoff_checklist")).toBe("boolean");
  });
});
