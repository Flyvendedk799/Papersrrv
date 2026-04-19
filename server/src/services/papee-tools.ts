import type { Db } from "@paperclipai/db";
import { issueLinks } from "@paperclipai/db";
import type {
  BacklogItemSourceRef,
  PapeeTool,
  PapeeToolResult,
} from "@paperclipai/shared";
import { issueService } from "./issues.js";
import { heartbeatService } from "./heartbeat.js";
import { activityService } from "./activity.js";
import { agentService } from "./agents.js";
import { projectService } from "./projects.js";
import { workflowEngine } from "./workflow-engine.js";
import { secretService } from "./secrets.js";
import { logActivity } from "./activity-log.js";
import { recall } from "./papee-memory.js";
import { backlogService } from "./backlog.js";

/**
 * PAPEE_TOOLS_PLAN.md — central tools dispatcher.
 *
 * Every Papee tool call flows through this service. Each handler:
 *   1. Performs a permission check (companyId already validated by route).
 *   2. Resolves any identifier → uuid via the relevant service.
 *   3. Calls the existing service mutation/read.
 *   4. Writes an activityLog entry tagged actorType=system + papee.
 *   5. Returns a PapeeToolResult envelope.
 *
 * Tier 0 (read) handlers are wired in this initial drop. Tier 1 and
 * Tier 2 handlers are stubbed and throw — they'll be wired in the
 * next phases of PAPEE_TOOLS_PLAN.md.
 */

export interface PapeeToolActor {
  type: "user" | "agent" | "system";
  id: string;
  userId?: string;
}

export function papeeToolsService(db: Db) {
  const issues = issueService(db);
  const heartbeat = heartbeatService(db);
  const activity = activityService(db);
  const agents = agentService(db);
  const projects = projectService(db);
  const workflows = workflowEngine(db);
  const secrets = secretService(db);
  const backlog = backlogService(db);

  function actorFor(actor: PapeeToolActor): { agentId?: string; userId?: string } {
    if (actor.type === "agent") return { agentId: actor.id };
    if (actor.type === "user") return { userId: actor.userId ?? actor.id };
    return {};
  }

  /**
   * PAPEE_TOOLS_PLAN.md §M.10 — Memory-aware tool inspection.
   * Reads recent personal memory rows once per call and lets the
   * handlers cheap-check pet-peeves and preferences before mutating.
   */
  async function loadMemoryFlags(companyId: string, actor: PapeeToolActor) {
    try {
      const rows = await recall(db, { companyId, userId: actor.userId ?? null, limit: 50 });
      const join = rows.map((r) => `${r.type}: ${r.content}`).join("\n").toLowerCase();
      return {
        terse: /preference: terse|prefer.*terse|hate.*long/.test(join),
        noDuplicates: /pet-peeve.*duplicate|no.*duplicate/.test(join),
        skipConfirm: /preference.*skip.*confirm|no.*confirm/.test(join),
      };
    } catch {
      return { terse: false, noDuplicates: false, skipConfirm: false };
    }
  }

  async function audit(
    companyId: string,
    actor: PapeeToolActor,
    action: string,
    entity: { type: string; id: string },
    details?: Record<string, unknown>,
  ) {
    try {
      await logActivity(db, {
        companyId,
        actorType: actor.type === "agent" ? "agent" : actor.type === "user" ? "user" : "system",
        actorId: actor.id,
        action: `papee.${action}`,
        entityType: entity.type,
        entityId: entity.id,
        details,
      });
    } catch {
      // audit failures must not break the tool call
    }
  }

  return {
    /** Dispatcher entry point. Routes a PapeeTool to its handler.
     * `causalContext` lets callers thread the comment / run that
     * triggered this enact so the Dossier's DAG gets a real edge. */
    async enact(
      companyId: string,
      tool: PapeeTool,
      actor: PapeeToolActor,
      causalContext: { sourceCommentId?: string | null; sourceRunId?: string | null } = {},
    ): Promise<PapeeToolResult> {
      const flags = await loadMemoryFlags(companyId, actor);
      switch (tool.kind) {
        /* ─────── Tier 0 — read & investigation ─────── */
        case "searchIssues": {
          const rows = await issues.list(companyId, {
            q: tool.query,
            ...(tool.filters ?? {}),
          });
          await audit(companyId, actor, "searchIssues", { type: "search", id: tool.query });
          return {
            ok: true,
            summary: `Found ${rows.length} issue${rows.length === 1 ? "" : "s"} for "${tool.query}"`,
            data: rows.slice(0, 10).map((r) => ({
              id: r.id,
              identifier: r.identifier,
              title: r.title,
              status: r.status,
            })),
          };
        }

        case "getRunDetails": {
          const run = await heartbeat.getRun(tool.runId);
          if (!run) return { ok: false, summary: "Run not found", error: "not_found" };
          await audit(companyId, actor, "getRunDetails", { type: "run", id: tool.runId });
          return {
            ok: true,
            summary: `Run ${run.status}${run.exitCode != null ? ` (exit ${run.exitCode})` : ""}`,
            entity: { type: "run", id: run.id },
            data: {
              id: run.id,
              status: run.status,
              exitCode: run.exitCode,
              agentId: run.agentId,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
              usageJson: run.usageJson,
            },
          };
        }

        case "tailRunLogs": {
          const lines = tool.lines ?? 50;
          const events = await heartbeat.listEvents(tool.runId, 0, Math.max(lines, 200));
          const tail = events.slice(-lines).map((e) => ({
            seq: e.seq,
            eventType: e.eventType,
            stream: e.stream,
            message: e.message,
            createdAt: e.createdAt,
          }));
          await audit(companyId, actor, "tailRunLogs", { type: "run", id: tool.runId }, { lines });
          return {
            ok: true,
            summary: `Got ${tail.length} log line${tail.length === 1 ? "" : "s"}`,
            entity: { type: "run", id: tool.runId },
            data: tail,
          };
        }

        case "listRecentChanges": {
          const since = tool.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const rows = await activity.list({ companyId, since, limit: 50 });
          await audit(companyId, actor, "listRecentChanges", { type: "activity", id: since });
          return {
            ok: true,
            summary: `${rows.length} change${rows.length === 1 ? "" : "s"} since ${new Date(since).toLocaleString()}`,
            data: rows.map((r) => ({
              action: r.action,
              entityType: r.entityType,
              entityId: r.entityId,
              actorType: r.actorType,
              createdAt: r.createdAt,
            })),
          };
        }

        case "summarizeThread": {
          const comments = await issues.listComments(tool.issueId);
          await audit(companyId, actor, "summarizeThread", { type: "issue", id: tool.issueId });
          return {
            ok: true,
            summary: `Read ${comments.length} comment${comments.length === 1 ? "" : "s"} — draft ready for review`,
            entity: { type: "issue", id: tool.issueId },
            data: {
              count: comments.length,
              // Surface a compact transcript so the chat layer can ask Claude
              // for a real summary on the next turn (M.8 follow-ups).
              transcript: comments.slice(-30).map((c) => ({
                authorAgentId: c.authorAgentId,
                authorUserId: c.authorUserId,
                createdAt: c.createdAt,
                body: typeof c.body === "string" ? c.body.slice(0, 600) : "",
              })),
            },
          };
        }

        /* ─────── Tier 1 — safe writes ─────── */
        case "commentOnIssue": {
          // M.10: terse preference → truncate to ~280 chars
          const body = flags.terse && tool.body.length > 280
            ? tool.body.slice(0, 277) + "…"
            : tool.body;
          const comment = await issues.addComment(
            tool.issueId,
            body,
            actorFor(actor),
            { replyToCommentId: causalContext.sourceCommentId ?? null },
          );
          await audit(companyId, actor, "commentOnIssue", { type: "issue", id: tool.issueId }, { commentId: comment.id });
          return {
            ok: true,
            summary: "Comment posted",
            entity: { type: "issue", id: tool.issueId },
            data: { commentId: comment.id },
          };
        }

        case "setIssueStatus": {
          const before = await issues.getById(tool.issueId);
          const updated = await issues.update(tool.issueId, { status: tool.status });
          if (!updated) return { ok: false, summary: "Issue not found", error: "not_found" };
          await audit(companyId, actor, "setIssueStatus", { type: "issue", id: tool.issueId }, { status: tool.status });
          return {
            ok: true,
            summary: `Status → ${tool.status}`,
            entity: { type: "issue", id: tool.issueId, identifier: updated.identifier ?? undefined },
            undo: before?.status
              ? { kind: "setIssueStatus", issueId: tool.issueId, status: before.status }
              : undefined,
          };
        }

        case "setIssuePriority": {
          const before = await issues.getById(tool.issueId);
          const updated = await issues.update(tool.issueId, { priority: tool.priority });
          if (!updated) return { ok: false, summary: "Issue not found", error: "not_found" };
          await audit(companyId, actor, "setIssuePriority", { type: "issue", id: tool.issueId }, { priority: tool.priority });
          return {
            ok: true,
            summary: `Priority → ${tool.priority}`,
            entity: { type: "issue", id: tool.issueId, identifier: updated.identifier ?? undefined },
            undo: before?.priority
              ? { kind: "setIssuePriority", issueId: tool.issueId, priority: before.priority as never }
              : undefined,
          };
        }

        case "assignIssue": {
          const before = await issues.getById(tool.issueId);
          // Heuristic: UUID-shaped → agent id; otherwise user id
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(tool.assignee);
          const patch = isUuid
            ? { assigneeAgentId: tool.assignee, assigneeUserId: null }
            : { assigneeUserId: tool.assignee, assigneeAgentId: null };
          const updated = await issues.update(tool.issueId, patch);
          if (!updated) return { ok: false, summary: "Issue not found", error: "not_found" };
          await audit(companyId, actor, "assignIssue", { type: "issue", id: tool.issueId }, { assignee: tool.assignee });
          const priorAssignee = before?.assigneeAgentId ?? before?.assigneeUserId ?? null;
          return {
            ok: true,
            summary: `Assigned to ${tool.assignee}`,
            entity: { type: "issue", id: tool.issueId, identifier: updated.identifier ?? undefined },
            undo: priorAssignee
              ? { kind: "assignIssue", issueId: tool.issueId, assignee: priorAssignee }
              : undefined,
          };
        }

        case "createBacklogItem": {
          const created = await backlog.createItem(
            companyId,
            {
              title: tool.title,
              body: tool.body ?? null,
              status: "idea",
              source: tool.source ?? "chat",
              sourceRef: (tool.sourceRef ?? null) as BacklogItemSourceRef | null,
              projectId: tool.projectId ?? null,
              goalId: tool.goalId ?? null,
              planId: tool.planId ?? null,
            },
            {
              userId: actor.type === "user" ? (actor.userId ?? actor.id) : null,
              agentId: actor.type === "agent" ? actor.id : null,
            },
          );
          await audit(companyId, actor, "createBacklogItem", { type: "backlog_item", id: created.id }, {
            title: tool.title,
            source: created.source,
          });
          return {
            ok: true,
            summary: `Saved to your backlog: ${created.title.slice(0, 60)}`,
            entity: { type: "backlog_item", id: created.id },
            data: { backlogItemId: created.id, status: created.status },
          };
        }

        case "createIssue": {
          // M.10: pet-peeve "no duplicates" → quick search first
          if (flags.noDuplicates) {
            const dups = await issues.list(companyId, { q: tool.title });
            const exact = dups.find((i) => i.title.toLowerCase() === tool.title.toLowerCase());
            if (exact) {
              return {
                ok: false,
                summary: `Looks like a duplicate of ${exact.identifier ?? exact.id}`,
                error: "duplicate_suspected",
                entity: { type: "issue", id: exact.id, identifier: exact.identifier ?? undefined },
              };
            }
          }
          const created = await issues.create(companyId, {
            title: tool.title,
            description: tool.description ?? null,
            status: "todo",
            priority: "medium",
            projectId: tool.projectId ?? null,
            assigneeAgentId: tool.assignee && /^[0-9a-f]{8}-/.test(tool.assignee) ? tool.assignee : null,
            assigneeUserId: tool.assignee && !/^[0-9a-f]{8}-/.test(tool.assignee) ? tool.assignee : null,
            createdFromCommentId: causalContext.sourceCommentId ?? null,
            createdFromRunId: causalContext.sourceRunId ?? null,
          } as never);
          await audit(companyId, actor, "createIssue", { type: "issue", id: created.id }, { title: tool.title });
          return {
            ok: true,
            summary: `Filed ${created.identifier ?? created.id}`,
            entity: { type: "issue", id: created.id, identifier: created.identifier ?? undefined },
            data: { issueId: created.id, identifier: created.identifier },
          };
        }

        case "linkIssues": {
          try {
            await db.insert(issueLinks).values({
              companyId,
              sourceIssueId: tool.sourceId,
              targetIssueId: tool.targetId,
              relation: tool.relation,
              createdByUserId: actor.type === "user" ? (actor.userId ?? actor.id) : null,
              createdByAgentId: actor.type === "agent" ? actor.id : null,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Unique-violation = link already exists; treat as a soft no-op
            if (!/duplicate key|unique/i.test(msg)) {
              return { ok: false, summary: "Couldn't link", error: msg };
            }
          }
          await audit(companyId, actor, "linkIssues", { type: "issue", id: tool.sourceId }, {
            target: tool.targetId,
            relation: tool.relation,
          });
          return {
            ok: true,
            summary: `Linked: ${tool.relation}`,
            entity: { type: "issue", id: tool.sourceId },
          };
        }

        case "navigate":
        case "openIssue":
        case "openAgent":
        case "highlightOnPage":
          // Pure client-side; the server enact route can be called for
          // audit only. The UI dispatcher in usePapeeEnact short-circuits
          // navigate/highlight before calling the server.
          await audit(companyId, actor, tool.kind, { type: "ui", id: JSON.stringify(tool) });
          return { ok: true, summary: `Client navigation: ${tool.kind}` };

        case "acknowledgeHealthIssue": {
          // Health acks are session-scoped; record in activity log so the
          // dashboard can suppress repeats for the next interval.
          await audit(companyId, actor, "acknowledgeHealthIssue", { type: "health", id: tool.issueId });
          return { ok: true, summary: "Acknowledged" };
        }

        case "snoozeReminder": {
          await audit(companyId, actor, "snoozeReminder", { type: "papee", id: "reminder" }, { minutes: tool.minutes });
          return { ok: true, summary: `Snoozed for ${tool.minutes}m` };
        }

        case "pauseAgent": {
          const updated = tool.paused
            ? await agents.pause(tool.agentId)
            : await agents.resume(tool.agentId);
          if (!updated) return { ok: false, summary: "Agent not found", error: "not_found" };
          await audit(companyId, actor, tool.paused ? "pauseAgent" : "resumeAgent", { type: "agent", id: tool.agentId });
          return {
            ok: true,
            summary: tool.paused ? "Agent paused" : "Agent resumed",
            entity: { type: "agent", id: tool.agentId },
            undo: { kind: "pauseAgent", agentId: tool.agentId, paused: !tool.paused },
          };
        }

        /* ─────── Tier 2 — destructive ─────── */
        case "triggerAgentRun": {
          const run = await heartbeat.wakeup(tool.agentId, {
            source: "on_demand",
            triggerDetail: "manual",
            reason: tool.prompt ?? "Triggered by Papee",
            requestedByActorType: actor.type === "agent" ? "agent" : actor.type === "user" ? "user" : "system",
            requestedByActorId: actor.id,
            payload: tool.prompt ? { prompt: tool.prompt } : null,
            triggeredByCommentId: causalContext.sourceCommentId ?? null,
          });
          if (!run) return { ok: false, summary: "Adapter refused", error: "no_run_created" };
          await audit(companyId, actor, "triggerAgentRun", { type: "agent", id: tool.agentId }, { runId: run.id });
          return {
            ok: true,
            summary: `Run started`,
            entity: { type: "run", id: run.id },
            data: { runId: run.id, agentId: tool.agentId },
          };
        }

        case "killRun": {
          const run = await heartbeat.cancelRun(tool.runId);
          if (!run) return { ok: false, summary: "Run not found or already finished", error: "not_found" };
          await audit(companyId, actor, "killRun", { type: "run", id: tool.runId });
          return {
            ok: true,
            summary: "Run cancelled",
            entity: { type: "run", id: tool.runId },
          };
        }

        case "setAgentBudget": {
          const updated = await agents.update(tool.agentId, { budgetMonthlyCents: tool.cents });
          if (!updated) return { ok: false, summary: "Agent not found", error: "not_found" };
          await audit(companyId, actor, "setAgentBudget", { type: "agent", id: tool.agentId }, { cents: tool.cents });
          return {
            ok: true,
            summary: `Budget capped at $${(tool.cents / 100).toFixed(2)}`,
            entity: { type: "agent", id: tool.agentId },
          };
        }

        case "runWorkflow": {
          const run = await workflows.startRun(tool.workflowId, {
            companyId,
            triggerType: "manual",
            triggerPayload: tool.input ?? {},
            createdByUserId: actor.type === "user" ? (actor.userId ?? actor.id) : undefined,
            createdByAgentId: actor.type === "agent" ? actor.id : undefined,
          });
          await audit(companyId, actor, "runWorkflow", { type: "workflow", id: tool.workflowId }, { runId: run.id });
          return {
            ok: true,
            summary: "Workflow running",
            entity: { type: "workflow_run", id: run.id },
            data: { runId: run.id },
          };
        }

        case "grantSecretToAgent": {
          // Mirrors the inline mutation in papee-chat.executeGrantSecret:
          // patches the agent's adapterConfig.env with a secret_ref binding.
          const secret = await secrets.getById(tool.secretId);
          if (!secret) return { ok: false, summary: "Secret not found", error: "not_found" };
          const agent = await agents.getById(tool.agentId);
          if (!agent) return { ok: false, summary: "Agent not found", error: "not_found" };
          const adapterConfig = (agent.adapterConfig ?? {}) as Record<string, unknown>;
          const env = (adapterConfig.env ?? {}) as Record<string, unknown>;
          const envKey = (secret.name ?? `SECRET_${tool.secretId.slice(0, 8)}`).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
          env[envKey] = { type: "secret_ref", secretId: tool.secretId, version: "latest" };
          adapterConfig.env = env;
          await agents.update(tool.agentId, { adapterConfig: adapterConfig as never });
          await audit(companyId, actor, "grantSecretToAgent", { type: "agent", id: tool.agentId }, { secretId: tool.secretId, envKey });
          return {
            ok: true,
            summary: `Granted ${envKey}`,
            entity: { type: "agent", id: tool.agentId },
            sideEffects: [`adapterConfig.env.${envKey} → secret_ref`],
          };
        }

        case "createProject": {
          const created = await projects.create(companyId, {
            name: tool.name,
            description: tool.description ?? null,
          } as never);
          await audit(companyId, actor, "createProject", { type: "project", id: created.id }, { name: tool.name });
          return {
            ok: true,
            summary: `Created project ${created.name}`,
            entity: { type: "project", id: created.id },
            data: { projectId: created.id },
          };
        }

        case "moveIssueToProject": {
          const before = await issues.getById(tool.issueId);
          const updated = await issues.update(tool.issueId, { projectId: tool.projectId });
          if (!updated) return { ok: false, summary: "Issue not found", error: "not_found" };
          await audit(companyId, actor, "moveIssueToProject", { type: "issue", id: tool.issueId }, { projectId: tool.projectId });
          return {
            ok: true,
            summary: "Issue moved",
            entity: { type: "issue", id: tool.issueId, identifier: updated.identifier ?? undefined },
            undo: before?.projectId
              ? { kind: "moveIssueToProject", issueId: tool.issueId, projectId: before.projectId }
              : undefined,
          };
        }

        /* ─────── Boared recovery stubs (full impl pending) ─────── */
        default: {
          const kind = (tool as { kind: string }).kind ?? "unknown";
          return {
            ok: false,
            summary: `Papee tool "${kind}" is not yet wired server-side.`,
            error: "not_implemented",
          };
        }
      }
    },
  };
}
