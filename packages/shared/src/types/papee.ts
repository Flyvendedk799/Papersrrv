import { z } from "zod";

export const papeeChatSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.object({
    page: z.string(),
    agentId: z.string().optional(),
    issueId: z.string().optional(),
    projectId: z.string().optional(),
    workflowId: z.string().optional(),
    runId: z.string().optional(),
  }),
  history: z.array(z.object({
    role: z.enum(["user", "papee"]),
    content: z.string(),
  })).max(20).optional(),
});

/* ────────────────────────────────────────────────────────────────────
 * PapeeTool envelope (PAPEE_TOOLS_PLAN.md — shared action plumbing)
 *
 * Every Papee-initiated mutation flows through this envelope so the
 * UI, server, and audit log agree on what happened. The legacy
 * PapeeAction (navigate / wake_agent / show_issue / grant_secret) is
 * preserved as a strict subset for back-compat with the existing chat
 * action chips, but new code should emit PapeeTool calls.
 * ──────────────────────────────────────────────────────────────────── */

export type PapeeRiskTier = "tier-0" | "tier-1" | "tier-2";

export type PapeeTool =
  // ── Tier 0 — Read & investigation ────────────────────────────────
  | { kind: "searchIssues"; query: string; filters?: Record<string, string> }
  | { kind: "getRunDetails"; runId: string }
  | { kind: "tailRunLogs"; runId: string; lines?: number }
  | { kind: "listRecentChanges"; since?: string }
  | { kind: "summarizeThread"; issueId: string }
  // ── Tier 1 — Safe writes ─────────────────────────────────────────
  | { kind: "commentOnIssue"; issueId: string; body: string }
  | { kind: "setIssueStatus"; issueId: string; status: string }
  | { kind: "setIssuePriority"; issueId: string; priority: "low" | "medium" | "high" | "critical" }
  | { kind: "assignIssue"; issueId: string; assignee: string }
  | { kind: "createIssue"; title: string; description?: string; assignee?: string; projectId?: string }
  | { kind: "linkIssues"; sourceId: string; targetId: string; relation: "blocks" | "blocked-by" | "relates-to" }
  | { kind: "navigate"; path: string }
  | { kind: "openIssue"; identifier: string }
  | { kind: "openAgent"; agentId: string }
  | { kind: "highlightOnPage"; targetId: string }
  | { kind: "acknowledgeHealthIssue"; issueId: string }
  | { kind: "snoozeReminder"; minutes: number }
  | { kind: "pauseAgent"; agentId: string; paused: boolean }
  // ── Tier 2 — Powerful / destructive ──────────────────────────────
  | { kind: "triggerAgentRun"; agentId: string; prompt?: string }
  | { kind: "killRun"; runId: string }
  | { kind: "setAgentBudget"; agentId: string; cents: number }
  | { kind: "runWorkflow"; workflowId: string; input?: Record<string, unknown> }
  | { kind: "grantSecretToAgent"; secretId: string; agentId: string }
  | { kind: "createProject"; name: string; description?: string }
  | { kind: "moveIssueToProject"; issueId: string; projectId: string };

export type PapeeToolKind = PapeeTool["kind"];

export const PAPEE_TOOL_TIER: Record<PapeeToolKind, PapeeRiskTier> = {
  searchIssues: "tier-0",
  getRunDetails: "tier-0",
  tailRunLogs: "tier-0",
  listRecentChanges: "tier-0",
  summarizeThread: "tier-0",
  commentOnIssue: "tier-1",
  setIssueStatus: "tier-1",
  setIssuePriority: "tier-1",
  assignIssue: "tier-1",
  createIssue: "tier-1",
  linkIssues: "tier-1",
  navigate: "tier-1",
  openIssue: "tier-1",
  openAgent: "tier-1",
  highlightOnPage: "tier-1",
  acknowledgeHealthIssue: "tier-1",
  snoozeReminder: "tier-1",
  pauseAgent: "tier-1",
  triggerAgentRun: "tier-2",
  killRun: "tier-2",
  setAgentBudget: "tier-2",
  runWorkflow: "tier-2",
  grantSecretToAgent: "tier-2",
  createProject: "tier-2",
  moveIssueToProject: "tier-2",
};

export interface PapeeToolEntityRef {
  type: string;
  id: string;
  identifier?: string;
}

export interface PapeeToolResult<T = unknown> {
  ok: boolean;
  summary: string;
  entity?: PapeeToolEntityRef;
  sideEffects?: string[];
  data?: T;
  error?: string;
  /** PAPEE_TOOLS_PLAN.md §16 — inverse tool the client can fire to undo this. */
  undo?: PapeeTool;
}

/* Legacy chat-action chips (kept for back-compat). */
export interface PapeeAction {
  type: "navigate" | "wake_agent" | "show_issue" | "grant_secret";
  label: string;
  payload: Record<string, string>;
}

export interface PapeeChatResponse {
  response: string;
  actions?: PapeeAction[];
  /** New: structured tool calls Claude wants Papee to enact. */
  tools?: PapeeTool[];
  /** PAPEE_TOOLS_PLAN.md §M.8 — short follow-up suggestions rendered as chips. */
  followUps?: string[];
  /** §M.8 topic stack — top 3 active topics for resurfacing. */
  topics?: string[];
  mood?: string;
}
