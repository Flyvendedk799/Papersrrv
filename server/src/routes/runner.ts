/**
 * Remote Runner API
 *
 * Allows an external runner process (e.g. on a local laptop) to claim queued
 * heartbeat runs, stream logs, and report completion.  The server schedules
 * runs via the heartbeat system as usual, but when PAPERCLIP_RUNNER_MODE=remote,
 * local adapters (cursor, process, etc.) are not executed server-side.  Instead
 * the runner polls these endpoints.
 *
 * Authentication: runner must provide a valid runner token via
 *   Authorization: Bearer <PAPERCLIP_RUNNER_TOKEN>
 */

import { Router, type Request, type Response } from "express";
import { and, eq, asc, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, heartbeatRunEvents, agentRuntimeState, agentTaskSessions, issues } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { publishLiveEvent } from "../services/live-events.js";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { getRunLogStore, type RunLogHandle } from "../services/run-log-store.js";
import { secretService } from "../services/index.js";
import { indexRunFromLog } from "../services/file-indexer.js";
import { estimateCostUsd } from "../services/token-cost-estimator.js";

/** Adapter types that require a local CLI and cannot run on a cloud server. */
const LOCAL_ADAPTER_TYPES = new Set(["cursor", "process", "claude_local", "codex_local", "opencode_local", "pi_local"]);

export function isRemoteRunnerMode(): boolean {
  return process.env.PAPERCLIP_RUNNER_MODE === "remote";
}

/** Returns true if the given adapter type needs a remote runner. */
export function needsRemoteRunner(adapterType: string | null): boolean {
  if (!isRemoteRunnerMode()) return false;
  return LOCAL_ADAPTER_TYPES.has(adapterType ?? "process");
}

function assertRunnerAuth(req: Request, res: Response): boolean {
  const token = process.env.PAPERCLIP_RUNNER_TOKEN;
  if (!token) {
    res.status(500).json({ error: "PAPERCLIP_RUNNER_TOKEN not configured on server" });
    return false;
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== token) {
    res.status(401).json({ error: "Invalid or missing runner token" });
    return false;
  }
  return true;
}

/** In-memory map of runId → log handle for persisting runner logs to disk. */
const runLogHandles = new Map<string, RunLogHandle>();

/** In-memory seq counters per run – avoids a COUNT(*) query on every log call. */
const runSeqCounters = new Map<string, number>();

export function runnerRoutes(db: Db) {
  const router = Router();

  /**
   * GET /api/runner/poll
   * Returns the next queued run for a local adapter type.
   * Query params:
   *   adapterTypes - comma-separated adapter types (default: all local types)
   */
  router.get("/runner/poll", async (req: Request, res: Response) => {
    if (!assertRunnerAuth(req, res)) return;

    try {
      const requestedTypes = req.query.adapterTypes
        ? String(req.query.adapterTypes).split(",").filter((t) => LOCAL_ADAPTER_TYPES.has(t))
        : Array.from(LOCAL_ADAPTER_TYPES);

      if (requestedTypes.length === 0) {
        res.json({ run: null });
        return;
      }

      // Find queued runs whose agents use a local adapter type
      const queuedRuns = await db
        .select({
          runId: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          companyId: heartbeatRuns.companyId,
          adapterType: agents.adapterType,
          createdAt: heartbeatRuns.createdAt,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .where(
          and(
            eq(heartbeatRuns.status, "queued"),
            inArray(agents.adapterType, requestedTypes),
          ),
        )
        .orderBy(asc(heartbeatRuns.createdAt))
        .limit(1);

      if (queuedRuns.length === 0) {
        res.json({ run: null });
        return;
      }

      res.json({ run: queuedRuns[0] });
    } catch (err) {
      logger.error({ err }, "runner poll failed");
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * POST /api/runner/claim/:runId
   * Atomically claim a queued run (queued → running).
   * Returns the full execution context needed to run the adapter.
   */
  router.post("/runner/claim/:runId", async (req: Request, res: Response) => {
    if (!assertRunnerAuth(req, res)) return;

    try {
      const runId = String(req.params.runId);

      // Atomic claim: queued → running
      const claimedAt = new Date();
      const claimed = await db
        .update(heartbeatRuns)
        .set({
          status: "running",
          startedAt: claimedAt,
          updatedAt: claimedAt,
        })
        .where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.status, "queued")))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!claimed) {
        res.status(409).json({ error: "Run already claimed or not found" });
        return;
      }

      // Publish live event
      publishLiveEvent({
        companyId: claimed.companyId,
        type: "heartbeat.run.status",
        payload: {
          runId: claimed.id,
          agentId: claimed.agentId,
          status: "running",
          invocationSource: claimed.invocationSource,
          triggerDetail: claimed.triggerDetail,
          startedAt: claimedAt.toISOString(),
          finishedAt: null,
          error: null,
          errorCode: null,
        },
      });

      // Update agent status to running
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, claimed.agentId))
        .then((rows) => rows[0] ?? null);

      if (agent) {
        await db
          .update(agents)
          .set({ status: "running", updatedAt: new Date() })
          .where(eq(agents.id, agent.id));

        publishLiveEvent({
          companyId: agent.companyId,
          type: "agent.status",
          payload: { agentId: agent.id, status: "running", outcome: "running" },
        });
      }

      // Build execution context
      const context = claimed.contextSnapshot ?? {};
      const runtimeState = await db
        .select()
        .from(agentRuntimeState)
        .where(eq(agentRuntimeState.agentId, claimed.agentId))
        .then((rows) => rows[0] ?? null);

      // Initialize seq counter for this run
      runSeqCounters.set(claimed.id, 0);

      // Initialize the run log store so logs persist for the completed-run transcript
      try {
        const logStore = getRunLogStore();
        const handle = await logStore.begin({
          companyId: claimed.companyId,
          agentId: claimed.agentId,
          runId: claimed.id,
        });
        runLogHandles.set(claimed.id, handle);

        // Set logRef + logStore on the run so the UI can read persisted logs
        await db
          .update(heartbeatRuns)
          .set({ logRef: handle.logRef, logStore: handle.store, updatedAt: new Date() })
          .where(eq(heartbeatRuns.id, claimed.id));
      } catch (logErr) {
        logger.warn({ err: logErr, runId: claimed.id }, "Failed to initialize run log store");
      }

      // Generate a JWT for the agent to authenticate API calls
      const authToken = agent
        ? createLocalAgentJwt(agent.id, agent.companyId, agent.adapterType, claimed.id)
        : null;

      // Resolve secrets in adapterConfig before sending to remote runner
      let resolvedAdapterConfig: Record<string, unknown> = {};
      if (agent) {
        try {
          const rawConfig = typeof agent.adapterConfig === "string"
            ? JSON.parse(agent.adapterConfig)
            : (agent.adapterConfig || {});

          resolvedAdapterConfig = await secretService(db).resolveAdapterConfigForRuntime(
            agent.companyId,
            rawConfig as Record<string, unknown>,
          );
        } catch (resolveErr) {
          const errMsg = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
          logger.warn({ err: resolveErr, agentId: agent.id }, `Failed to resolve adapter config secrets for runner: ${errMsg}`);

          // Fallback to a safe object if parsing failed, but inject the error so it's visible to the runner logs
          const originalConfig = typeof agent.adapterConfig === "object" && agent.adapterConfig !== null
            ? { ...(agent.adapterConfig as Record<string, unknown>) }
            : {};

          // Inject a special error env var so the runner can see why resolution failed
          const env = (originalConfig.env as Record<string, unknown>) || {};
          originalConfig.env = {
            ...env,
            PAPERCLIP_SECRET_ERROR: `Failed to resolve secrets: ${errMsg}. Check if the secret exists for this company.`,
          };
          resolvedAdapterConfig = originalConfig;
        }
      }

      res.json({
        run: {
          id: claimed.id,
          agentId: claimed.agentId,
          companyId: claimed.companyId,
          status: claimed.status,
          invocationSource: claimed.invocationSource,
          triggerDetail: claimed.triggerDetail,
          contextSnapshot: context,
          wakeupRequestId: claimed.wakeupRequestId,
        },
        agent: agent
          ? {
            id: agent.id,
            name: agent.name,
            companyId: agent.companyId,
            adapterType: agent.adapterType,
            adapterConfig: resolvedAdapterConfig,
            runtimeConfig: agent.runtimeConfig,
          }
          : null,
        runtime: {
          sessionId: runtimeState?.sessionId ?? null,
          stateJson: runtimeState?.stateJson ?? null,
        },
        authToken,
      });
    } catch (err) {
      logger.error({ err }, "runner claim failed");
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * POST /api/runner/log/:runId
   * Append log lines to a running run.
   * Body: { stream: "stdout"|"stderr", chunk: string }
   */
  router.post("/runner/log/:runId", async (req: Request, res: Response) => {
    if (!assertRunnerAuth(req, res)) return;

    try {
      const runId = String(req.params.runId);
      const { stream, chunk } = req.body as { stream: "stdout" | "stderr"; chunk: string };

      if (!stream || !chunk) {
        res.status(400).json({ error: "stream and chunk required" });
        return;
      }

      const run = await db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, runId))
        .then((rows) => rows[0] ?? null);

      if (!run || run.status !== "running") {
        res.status(404).json({ error: "Run not found or not running" });
        return;
      }

      // Use in-memory seq counter (initialized at claim time) instead of COUNT(*) query
      const prevSeq = runSeqCounters.get(runId) ?? 0;
      const seq = prevSeq + 1;
      runSeqCounters.set(runId, seq);

      await db.insert(heartbeatRunEvents).values({
        companyId: run.companyId,
        runId,
        agentId: run.agentId,
        seq,
        eventType: "lifecycle",
        stream,
        level: "info",
        message: chunk.slice(0, 2000),
        createdAt: new Date(),
      });

      // Append to persisted log file for post-completion transcript
      const logHandle = runLogHandles.get(runId);
      if (logHandle) {
        try {
          const logStore = getRunLogStore();
          await logStore.append(logHandle, {
            stream,
            chunk,
            ts: new Date().toISOString(),
          });
        } catch (logErr) {
          logger.warn({ err: logErr, runId }, "Failed to append to run log store");
        }
      }

      // Publish live log event
      const payloadChunk = chunk.length > 8192 ? chunk.slice(chunk.length - 8192) : chunk;
      publishLiveEvent({
        companyId: run.companyId,
        type: "heartbeat.run.log",
        payload: {
          runId: run.id,
          agentId: run.agentId,
          stream,
          chunk: payloadChunk,
          truncated: payloadChunk.length !== chunk.length,
        },
      });

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "runner log failed");
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * POST /api/runner/complete/:runId
   * Mark a run as completed with a result.
   * Body: AdapterExecutionResult-like payload
   */
  router.post("/runner/complete/:runId", async (req: Request, res: Response) => {
    if (!assertRunnerAuth(req, res)) return;

    try {
      const runId = String(req.params.runId);
      const result = req.body as {
        exitCode?: number | null;
        signal?: string | null;
        timedOut?: boolean;
        errorMessage?: string | null;
        errorCode?: string | null;
        usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
        costUsd?: number | null;
        billingType?: string | null;
        sessionId?: string | null;
        summary?: string | null;
        stdoutExcerpt?: string | null;
        stderrExcerpt?: string | null;
      };

      const run = await db
        .select()
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, runId))
        .then((rows) => rows[0] ?? null);

      if (!run || run.status !== "running") {
        res.status(404).json({ error: "Run not found or not running" });
        return;
      }

      // Determine outcome
      let status: "succeeded" | "failed" | "timed_out";
      if (result.timedOut) {
        status = "timed_out";
      } else if ((result.exitCode ?? 0) === 0 && !result.errorMessage) {
        status = "succeeded";
      } else {
        status = "failed";
      }

      // If adapter didn't report costUsd but sent token counts, estimate cost
      let effectiveCostUsd = result.costUsd ?? null;
      if (effectiveCostUsd == null && result.usage) {
        const estimated = estimateCostUsd({
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cachedInputTokens,
        });
        if (estimated > 0) {
          effectiveCostUsd = estimated;
          logger.info(
            { runId, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, estimatedCostUsd: estimated },
            "runner: estimated costUsd from token counts",
          );
        }
      }

      const usageJson =
        result.usage || effectiveCostUsd != null
          ? {
            ...(result.usage ?? {}),
            ...(effectiveCostUsd != null ? { costUsd: effectiveCostUsd } : {}),
            ...(result.billingType ? { billingType: result.billingType } : {}),
          }
          : null;

      // Finalize the persisted log file
      let logBytes: number | null = null;
      const logHandle = runLogHandles.get(runId);
      if (logHandle) {
        try {
          const logStore = getRunLogStore();
          const summary = await logStore.finalize(logHandle);
          logBytes = summary.bytes;
        } catch (logErr) {
          logger.warn({ err: logErr, runId }, "Failed to finalize run log store");
        }
        runLogHandles.delete(runId);
      }
      runSeqCounters.delete(runId);

      await db
        .update(heartbeatRuns)
        .set({
          status,
          finishedAt: new Date(),
          error: status !== "succeeded" ? (result.errorMessage ?? "Runner reported failure") : null,
          errorCode: result.errorCode ?? (status === "timed_out" ? "timeout" : status === "failed" ? "adapter_failed" : null),
          exitCode: result.exitCode ?? null,
          signal: result.signal ?? null,
          usageJson: usageJson as Record<string, unknown> | null,
          stdoutExcerpt: result.stdoutExcerpt ?? null,
          stderrExcerpt: result.stderrExcerpt ?? null,
          sessionIdAfter: result.sessionId ?? null,
          ...(logBytes != null ? { logBytes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, runId));

      // Clear execution lock on any issues tied to this completed run
      await db
        .update(issues)
        .set({
          executionRunId: null,
          executionAgentNameKey: null,
          executionLockedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(issues.companyId, run.companyId), eq(issues.executionRunId, runId)));

      // Update agent status
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, run.agentId))
        .then((rows) => rows[0] ?? null);

      if (agent) {
        const newStatus = status === "succeeded" ? "idle" : "error";
        await db
          .update(agents)
          .set({ status: newStatus, lastHeartbeatAt: new Date(), updatedAt: new Date() })
          .where(eq(agents.id, agent.id));

        publishLiveEvent({
          companyId: agent.companyId,
          type: "agent.status",
          payload: { agentId: agent.id, status: newStatus, outcome: status },
        });
      }

      // Publish run status event
      publishLiveEvent({
        companyId: run.companyId,
        type: "heartbeat.run.status",
        payload: {
          runId: run.id,
          agentId: run.agentId,
          status,
          invocationSource: run.invocationSource,
          triggerDetail: run.triggerDetail,
          error: result.errorMessage ?? null,
          errorCode: result.errorCode ?? null,
          startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
          finishedAt: new Date().toISOString(),
        },
      });

      // Update runtime state (token usage)
      if (result.usage && agent) {
        const existing = await db
          .select()
          .from(agentRuntimeState)
          .where(eq(agentRuntimeState.agentId, agent.id))
          .then((rows) => rows[0] ?? null);

        if (existing) {
          await db
            .update(agentRuntimeState)
            .set({
              totalInputTokens: (existing.totalInputTokens ?? 0) + (result.usage.inputTokens ?? 0),
              totalOutputTokens: (existing.totalOutputTokens ?? 0) + (result.usage.outputTokens ?? 0),
              sessionId: result.sessionId ?? existing.sessionId,
              updatedAt: new Date(),
            })
            .where(eq(agentRuntimeState.agentId, agent.id));
        }
      }

      // Index files from the run log in the background (non-blocking)
      const logHandleForIndex = logHandle;
      if (logHandleForIndex) {
        indexRunFromLog(db, {
          id: runId,
          companyId: run.companyId,
          agentId: run.agentId,
          logStore: logHandleForIndex.store,
          logRef: logHandleForIndex.logRef,
        }).catch((indexErr) => {
          logger.warn({ err: indexErr, runId }, "background file indexing failed");
        });
      }

      res.json({ ok: true, status });
    } catch (err) {
      logger.error({ err }, "runner complete failed");
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * POST /api/runner/fix-adapters
   * Set adapterType on all agents that have null/empty adapterType.
   * Body (optional): { adapterType?: string, adapterConfig?: object }
   */
  router.post("/runner/fix-adapters", async (req: Request, res: Response) => {
    if (!assertRunnerAuth(req, res)) return;

    try {
      const defaultType = process.env.PAPERCLIP_DEFAULT_ADAPTER_TYPE || "cursor";
      const targetType = (req.body as Record<string, unknown>)?.adapterType as string | undefined || defaultType;

      // Find a reference agent that already has the target adapter type + config
      const reference = await db
        .select({ adapterConfig: agents.adapterConfig })
        .from(agents)
        .where(eq(agents.adapterType, targetType))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      const patch: Record<string, unknown> = {
        adapterType: targetType,
        updatedAt: new Date(),
      };

      // Copy only infrastructure settings from reference, not agent-specific ones
      const bodyConfig = (req.body as Record<string, unknown>)?.adapterConfig;
      let templateConfig: Record<string, unknown> | null = null;
      if (bodyConfig && typeof bodyConfig === "object") {
        templateConfig = bodyConfig as Record<string, unknown>;
      } else if (reference?.adapterConfig && typeof reference.adapterConfig === "object") {
        templateConfig = reference.adapterConfig as Record<string, unknown>;
      }

      // Match by specific agent IDs, or by adapter type conditions
      const agentIds = (req.body as Record<string, unknown>)?.agentIds as string[] | undefined;
      let whereCondition;

      if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
        whereCondition = inArray(agents.id, agentIds);
      } else {
        const fromTypes = (req.body as Record<string, unknown>)?.fromTypes as string[] | undefined;
        const matchConditions = [isNull(agents.adapterType), eq(agents.adapterType, "")];
        if (fromTypes && Array.isArray(fromTypes)) {
          for (const ft of fromTypes) {
            if (typeof ft === "string" && ft !== targetType) {
              matchConditions.push(eq(agents.adapterType, ft));
            }
          }
        }
        whereCondition = or(...matchConditions);
      }

      // Find matching agents first so we can set per-agent instructionsFilePath
      const toFix = await db
        .select({ id: agents.id, name: agents.name, adapterConfig: agents.adapterConfig })
        .from(agents)
        .where(whereCondition);

      const results: { id: string; name: string }[] = [];
      for (const agent of toFix) {
        const urlKey = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        // Build per-agent config: infrastructure from template, paths from agent identity
        const agentConfig: Record<string, unknown> = {
          ...(templateConfig ?? {}),
          instructionsFilePath: `/app/agents/${urlKey}/AGENTS.md`,
        };
        // Remove promptTemplate so it falls back to the agent's own default
        delete agentConfig.promptTemplate;

        await db
          .update(agents)
          .set({ adapterType: targetType, adapterConfig: agentConfig, updatedAt: new Date() })
          .where(eq(agents.id, agent.id));
        results.push({ id: agent.id, name: agent.name });
      }

      logger.info({ count: results.length, targetType }, "fix-adapters: patched agents");
      res.json({ ok: true, patched: results.length, agents: results });
    } catch (err) {
      logger.error({ err }, "fix-adapters failed");
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
}
