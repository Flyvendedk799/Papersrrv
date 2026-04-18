// @vitest-environment node
import { describe, it, expect } from "vitest";
import { shouldInterject } from "./papee-turn-taking";

describe("papee-turn-taking (PAPEE_TOOLS_PLAN.md §M.5)", () => {
  it("defers non-critical while user is typing", () => {
    expect(
      shouldInterject(
        { msSinceTyping: 100, msSinceScroll: 1000, msSinceInteraction: 500, chatOpen: false },
        "normal",
      ),
    ).toBe("defer");
  });

  it("fires critical even mid-typing", () => {
    expect(
      shouldInterject(
        { msSinceTyping: 100, msSinceScroll: 1000, msSinceInteraction: 500, chatOpen: false },
        "critical",
      ),
    ).toBe("fire");
  });

  it("drops non-critical when chat is open", () => {
    expect(
      shouldInterject(
        { msSinceTyping: 5000, msSinceScroll: 5000, msSinceInteraction: 5000, chatOpen: true },
        "normal",
      ),
    ).toBe("drop-non-critical");
  });

  it("fires when user is reading (stationary)", () => {
    expect(
      shouldInterject(
        { msSinceTyping: 9999, msSinceScroll: 9999, msSinceInteraction: 9999, chatOpen: false },
        "normal",
      ),
    ).toBe("fire");
  });
});
