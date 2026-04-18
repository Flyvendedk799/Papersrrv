/**
 * Shared envelope smoke test — mirrors a subset of the UI suite to make
 * sure server- and client-side serializations agree on the PapeeTool /
 * PapeeToolResult shapes from PAPEE_TOOLS_PLAN.md.
 */
import { describe, it, expect } from "vitest";
import { PAPEE_TOOL_TIER, type PapeeTool, type PapeeToolKind } from "@paperclipai/shared";

describe("PapeeTool envelope (PAPEE_TOOLS_PLAN.md action plumbing)", () => {
  it("PAPEE_TOOL_TIER covers all 25 plan kinds", () => {
    const expected: PapeeToolKind[] = [
      // Tier 0 — read
      "searchIssues", "getRunDetails", "tailRunLogs", "listRecentChanges", "summarizeThread",
      // Tier 1 — safe writes
      "commentOnIssue", "setIssueStatus", "setIssuePriority", "assignIssue",
      "createIssue", "linkIssues", "navigate", "openIssue", "openAgent",
      "highlightOnPage", "acknowledgeHealthIssue", "snoozeReminder", "pauseAgent",
      // Tier 2 — destructive
      "triggerAgentRun", "killRun", "setAgentBudget", "runWorkflow",
      "grantSecretToAgent", "createProject", "moveIssueToProject",
    ];
    expect(expected).toHaveLength(25);
    for (const kind of expected) {
      expect(PAPEE_TOOL_TIER[kind], `kind=${kind}`).toBeDefined();
    }
  });

  it("tier classification matches the plan", () => {
    expect(PAPEE_TOOL_TIER.searchIssues).toBe("tier-0");
    expect(PAPEE_TOOL_TIER.commentOnIssue).toBe("tier-1");
    expect(PAPEE_TOOL_TIER.killRun).toBe("tier-2");
    expect(PAPEE_TOOL_TIER.grantSecretToAgent).toBe("tier-2");
  });

  it("a tier-1 PapeeTool literal type-checks", () => {
    const t: PapeeTool = { kind: "commentOnIssue", issueId: "abc", body: "hi" };
    expect(t.kind).toBe("commentOnIssue");
  });

  it("a tier-2 PapeeTool literal type-checks", () => {
    const t: PapeeTool = { kind: "triggerAgentRun", agentId: "abc", prompt: "go" };
    expect(t.kind).toBe("triggerAgentRun");
  });
});
