import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePapee } from "@/context/PapeeContext";
import { papeeApi, PAPEE_TOOL_TIER, type PapeeTool, type PapeeToolKind, type PapeeToolResult } from "@/api/papee";
import { useCompany } from "@/context/CompanyContext";
import { runToolArc, type ToolArc } from "@/lib/papee-tool-arcs";
import { telemetry } from "@/lib/papee-telemetry";
import { usePapeeConfirm } from "./usePapeeConfirm";

/**
 * papee.enact() — central dispatcher for PapeeTool calls
 * (PAPEE_TOOLS_PLAN.md "Action plumbing" + Phase Z.3 narrative arcs).
 *
 *   1. Resolves the tool's risk tier.
 *   2. Tier-2: pops a confirmation modal in `guarding` pose.
 *   3. Plays the pre-pose, calls the server, plays during/success/error.
 *   4. Tier-1: shows a 2–4s undo toast.
 *
 * Returns the PapeeToolResult so callers can react further.
 */
export function usePapeeEnact() {
  const papee = usePapee();
  const company = useCompany();
  const companyId = company.selectedCompanyId ?? "";
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = usePapeeConfirm();
  const inflightRef = useRef(0);

  const enact = useCallback(
    async (tool: PapeeTool): Promise<PapeeToolResult> => {
      if (!companyId) return { ok: false, summary: "no company selected", error: "no_company" };
      const tier = PAPEE_TOOL_TIER[tool.kind as PapeeToolKind];
      telemetry.log("enact.start", { kind: tool.kind, tier });
      const arc: ToolArc = ARC_BY_KIND[tool.kind] ?? DEFAULT_ARC;

      // Tier 2 → require confirmation
      if (tier === "tier-2") {
        papee.setAnimState("guarding");
        const ok = await confirm({
          title: arc.confirmTitle ?? `Run ${tool.kind}?`,
          description: describeTool(tool),
          confirmLabel: "Yes, do it",
          cancelLabel: "Cancel",
          variant: "danger",
        });
        if (!ok) {
          papee.showSpeechBubble("Stood down.", 1500);
          return { ok: false, summary: "cancelled by user", error: "cancelled" };
        }
      }

      // Client-only tools that don't need a server round-trip.
      if (tool.kind === "navigate") {
        papee.queueReaction("waving", 600);
        papee.showSpeechBubble("Follow me!", 1200);
        navigate(tool.path);
        papee.setLastToolResult({ ok: true, summary: `Navigated to ${tool.path}` });
        return { ok: true, summary: `Navigated to ${tool.path}` };
      }
      if (tool.kind === "highlightOnPage") {
        papee.setHighlightTarget(tool.targetId);
        papee.showSpeechBubble("Look here →", 1500);
        setTimeout(() => papee.setHighlightTarget(null), 3000);
        return { ok: true, summary: "Highlighted on page" };
      }

      // Play the arc's pre-beat (pose + speech).
      runToolArc(papee, arc, "pre");
      const id = ++inflightRef.current;
      runToolArc(papee, arc, "during");

      try {
        const result = await papeeApi.enact(companyId, tool);

        if (id !== inflightRef.current) return result; // raced — abandon side-effects
        papee.setLastToolResult(result);

        if (!result.ok) {
          runToolArc(papee, arc, "error");
          papee.showSpeechBubble(result.error || "I fumbled that.", 2200);
          papee.pushBubble(result.error || "I fumbled that.", "critical");
          telemetry.log("enact.error", { kind: tool.kind, error: result.error });
          return result;
        }

        runToolArc(papee, arc, "success");
        papee.showSpeechBubble(result.summary, 2400);
        // Mirror to the §Z.7 stack so multi-tool runs accumulate
        papee.pushBubble(result.summary, "normal");
        telemetry.log("enact.success", { kind: tool.kind, summary: result.summary, hasUndo: !!result.undo });

        if (tier === "tier-1") {
          const inverse = result.undo;
          papee.showUndoToast(
            `${result.summary} — undo?`,
            async () => {
              papee.dismissUndoToast();
              if (!inverse) {
                papee.showSpeechBubble("Nothing to roll back.", 1500);
                return;
              }
              papee.showSpeechBubble("Rolling back…", 1500);
              try {
                await papeeApi.enact(companyId, inverse);
                papee.showSpeechBubble("Rolled back.", 1500);
                papee.setAnimState("thumbs-up");
              } catch {
                papee.setAnimState("alarmed");
                papee.showSpeechBubble("Rollback failed.", 2000);
              }
            },
            tool.kind === "createIssue" ? 4000 : 2000,
          );
        }
        return result;
      } catch (err) {
        if (id !== inflightRef.current) {
          return { ok: false, summary: "raced", error: "raced" };
        }
        runToolArc(papee, arc, "error");
        const msg = err instanceof Error ? err.message : String(err);
        papee.showSpeechBubble("Server refused that one.", 2200);
        return { ok: false, summary: "request failed", error: msg };
      }
    },
    [papee, companyId, navigate, confirm],
  );

  return { enact, ConfirmDialog } as const;
}

function describeTool(tool: PapeeTool): string {
  switch (tool.kind) {
    case "triggerAgentRun":
      return `Should I run agent ${tool.agentId}${tool.prompt ? ` with: "${tool.prompt}"` : ""}?`;
    case "killRun":
      return `Stop run ${tool.runId}? It can't be resumed.`;
    case "setAgentBudget":
      return `Cap agent ${tool.agentId} budget at $${(tool.cents / 100).toFixed(2)}?`;
    case "runWorkflow":
      return `Trigger workflow ${tool.workflowId}?`;
    case "grantSecretToAgent":
      return `Grant secret ${tool.secretId} to agent ${tool.agentId}?`;
    case "createProject":
      return `Create new project "${tool.name}"?`;
    case "moveIssueToProject":
      return `Move issue to project ${tool.projectId}? Watchers will be notified.`;
    default:
      return "Confirm this action?";
  }
}

/* ───────────── Arc table (PAPEE_TOOLS_PLAN.md tools §1–§25) ─────────── */

const DEFAULT_ARC: ToolArc = {
  pre: { pose: "thinking", speech: "Working on it…" },
  during: { pose: "thinking" },
  success: { pose: "thumbs-up", speech: "Done." },
  error: { pose: "alarmed", speech: "I fumbled that." },
};

const ARC_BY_KIND: Partial<Record<PapeeToolKind, ToolArc>> = {
  // Tier 0
  searchIssues: {
    pre: { pose: "thinking", speech: "Searching…" },
    during: { pose: "scanning" },
    success: { pose: "magnifying", speech: "Found it." },
    error: { pose: "alarmed", speech: "No results." },
  },
  getRunDetails: {
    pre: { pose: "walking" },
    during: { pose: "digging" },
    success: { pose: "magnifying", speech: "Got the run." },
    error: { pose: "alarmed", speech: "Run not found." },
  },
  tailRunLogs: {
    pre: { pose: "thinking" },
    during: { pose: "typing" },
    success: { pose: "pointing-right", speech: "Tail captured." },
    error: { pose: "alarmed", speech: "No logs available." },
  },
  listRecentChanges: {
    pre: { pose: "walking" },
    during: { pose: "scanning" },
    success: { pose: "thumbs-up", speech: "Caught up." },
    error: { pose: "alarmed", speech: "Couldn't read activity." },
  },
  summarizeThread: {
    pre: { pose: "thinking" },
    during: { pose: "writing" },
    success: { pose: "magnifying", speech: "Drafted a summary." },
    error: { pose: "alarmed", speech: "Thread unreadable." },
  },
  // Tier 1
  commentOnIssue: {
    pre: { pose: "walking", speech: "Posting…" },
    during: { pose: "typing" },
    success: { pose: "celebrating", speech: "Posted!" },
    error: { pose: "alarmed", speech: "Post failed — draft saved." },
  },
  setIssueStatus: {
    pre: { pose: "pointing-right" },
    during: { pose: "thinking" },
    success: { pose: "thumbs-up", speech: "Status updated." },
    error: { pose: "alarmed", speech: "Couldn't change status." },
  },
  setIssuePriority: {
    pre: { pose: "ledger" },
    during: { pose: "writing" },
    success: { pose: "thumbs-up", speech: "Priority set." },
    error: { pose: "alarmed", speech: "Couldn't set priority." },
  },
  assignIssue: {
    pre: { pose: "walking" },
    during: { pose: "writing" },
    success: { pose: "pointing-right", speech: "Assigned." },
    error: { pose: "alarmed", speech: "Assignment failed." },
  },
  createIssue: {
    pre: { pose: "writing", speech: "Drafting…" },
    during: { pose: "typing" },
    success: { pose: "jumping", speech: "Filed!" },
    error: { pose: "alarmed", speech: "Couldn't file — draft kept." },
  },
  linkIssues: {
    pre: { pose: "walking" },
    during: { pose: "thinking" },
    success: { pose: "thumbs-up", speech: "Linked." },
    error: { pose: "alarmed", speech: "Link failed." },
  },
  openIssue: {
    pre: { pose: "waving", speech: "Opening…" },
    during: { pose: "walking" },
    success: { pose: "pointing-right", speech: "Here it is." },
    error: { pose: "alarmed", speech: "Issue gone." },
  },
  openAgent: {
    pre: { pose: "waving", speech: "Opening…" },
    during: { pose: "walking" },
    success: { pose: "pointing-right", speech: "Here." },
    error: { pose: "alarmed", speech: "Agent gone." },
  },
  acknowledgeHealthIssue: {
    pre: { pose: "walking" },
    during: { pose: "shush" },
    success: { pose: "thumbs-up", speech: "Acknowledged." },
    error: { pose: "alarmed" },
  },
  snoozeReminder: {
    pre: { pose: "shush" },
    during: { pose: "sleepy-nod" },
    success: { pose: "sleepy-nod", speech: "Zzz…" },
    error: { pose: "alarmed" },
  },
  pauseAgent: {
    pre: { pose: "walking" },
    during: { pose: "stopping" },
    success: { pose: "thumbs-up", speech: "Agent paused." },
    error: { pose: "alarmed", speech: "Couldn't pause." },
  },
  // Tier 2
  triggerAgentRun: {
    confirmTitle: "Trigger agent run?",
    pre: { pose: "guarding" },
    during: { pose: "throwing-switch" },
    success: { pose: "celebrating", speech: "Running." },
    error: { pose: "alarmed", speech: "Adapter refused." },
  },
  killRun: {
    confirmTitle: "Stop this run?",
    pre: { pose: "stopping" },
    during: { pose: "alarmed" },
    success: { pose: "thumbs-up", speech: "Stopped it." },
    error: { pose: "alarmed", speech: "Couldn't kill it." },
  },
  setAgentBudget: {
    confirmTitle: "Update budget?",
    pre: { pose: "ledger" },
    during: { pose: "writing" },
    success: { pose: "thumbs-up", speech: "Budget set." },
    error: { pose: "alarmed", speech: "Budget rejected." },
  },
  runWorkflow: {
    confirmTitle: "Run workflow?",
    pre: { pose: "guarding" },
    during: { pose: "throwing-switch" },
    success: { pose: "celebrating", speech: "Workflow running." },
    error: { pose: "alarmed", speech: "Workflow refused." },
  },
  grantSecretToAgent: {
    confirmTitle: "Grant secret access?",
    pre: { pose: "guarding" },
    during: { pose: "unlocking" },
    success: { pose: "guarding", speech: "Granted." },
    error: { pose: "alarmed", speech: "Denied." },
  },
  createProject: {
    confirmTitle: "Create project?",
    pre: { pose: "writing" },
    during: { pose: "writing" },
    success: { pose: "jumping", speech: "New project!" },
    error: { pose: "alarmed", speech: "Couldn't create." },
  },
  moveIssueToProject: {
    confirmTitle: "Move this issue?",
    pre: { pose: "walking" },
    during: { pose: "thinking" },
    success: { pose: "thumbs-up", speech: "Moved." },
    error: { pose: "alarmed", speech: "Move failed." },
  },
};
