// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAPEE_TOOL_TIER, type PapeeToolKind } from "@/api/papee";
import { requiresPapeeConfirm } from "./usePapeeEnact";

describe("usePapeeEnact safety gates", () => {
  it("requires confirm for all tier-2 tools", () => {
    const tier2Kinds = (Object.keys(PAPEE_TOOL_TIER) as PapeeToolKind[]).filter(
      (kind) => PAPEE_TOOL_TIER[kind] === "tier-2",
    );
    for (const kind of tier2Kinds) {
      expect(requiresPapeeConfirm(kind, PAPEE_TOOL_TIER[kind])).toBe(true);
    }
  });

  it("requires confirm for guarded tier-1 issue/project mutations", () => {
    const guarded: PapeeToolKind[] = [
      "commentOnIssue",
      "setIssueStatus",
      "setIssuePriority",
      "assignIssue",
      "createIssue",
      "linkIssues",
    ];
    for (const kind of guarded) {
      expect(requiresPapeeConfirm(kind, "tier-1")).toBe(true);
    }
  });

  it("keeps tier-0 and low-risk tier-1 auto-executable", () => {
    expect(requiresPapeeConfirm("searchIssues", "tier-0")).toBe(false);
    expect(requiresPapeeConfirm("navigate", "tier-1")).toBe(false);
    expect(requiresPapeeConfirm("highlightOnPage", "tier-1")).toBe(false);
    expect(requiresPapeeConfirm("acknowledgeHealthIssue", "tier-1")).toBe(false);
    expect(requiresPapeeConfirm("snoozeReminder", "tier-1")).toBe(false);
  });
});
