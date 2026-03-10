import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentWakeupRequests, agents, heartbeatRuns } from "@paperclipai/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { assertCompanyAccess } from "./authz.js";

export function debugRoutes(db: Db) {
  const router = Router();

  /**
   * GET /companies/:companyId/debug/wakeups
   * Shows recent wakeup requests with agent names, statuses, timing.
   * Query params:
   *   ?limit=50       (default 50, max 200)
   *   ?agentId=...    (filter by agent)
   *   ?status=...     (filter by status: queued, claimed, completed, failed, coalesced)
   */
  router.get("/companies/:companyId/debug/wakeups", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const agentIdFilter = req.query.agentId as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    const conditions = [eq(agentWakeupRequests.companyId, companyId)];
    if (agentIdFilter) conditions.push(eq(agentWakeupRequests.agentId, agentIdFilter));
    if (statusFilter) conditions.push(eq(agentWakeupRequests.status, statusFilter));

    const rows = await db
      .select({
        id: agentWakeupRequests.id,
        agentId: agentWakeupRequests.agentId,
        agentName: agents.name,
        source: agentWakeupRequests.source,
        triggerDetail: agentWakeupRequests.triggerDetail,
        reason: agentWakeupRequests.reason,
        status: agentWakeupRequests.status,
        coalescedCount: agentWakeupRequests.coalescedCount,
        requestedByActorType: agentWakeupRequests.requestedByActorType,
        requestedByActorId: agentWakeupRequests.requestedByActorId,
        runId: agentWakeupRequests.runId,
        payload: agentWakeupRequests.payload,
        error: agentWakeupRequests.error,
        requestedAt: agentWakeupRequests.requestedAt,
        claimedAt: agentWakeupRequests.claimedAt,
        finishedAt: agentWakeupRequests.finishedAt,
      })
      .from(agentWakeupRequests)
      .innerJoin(agents, eq(agentWakeupRequests.agentId, agents.id))
      .where(and(...conditions))
      .orderBy(desc(agentWakeupRequests.requestedAt))
      .limit(limit);

    // Summary stats
    const stats = await db
      .select({
        status: agentWakeupRequests.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agentWakeupRequests)
      .where(eq(agentWakeupRequests.companyId, companyId))
      .groupBy(agentWakeupRequests.status);

    res.json({ stats: Object.fromEntries(stats.map((s) => [s.status, s.count])), rows });
  });

  /**
   * GET /companies/:companyId/debug/runs
   * Shows recent heartbeat runs with agent names and statuses.
   * Query params:
   *   ?limit=50       (default 50, max 200)
   *   ?agentId=...    (filter by agent)
   *   ?status=...     (filter: queued, running, completed, failed, cancelled)
   */
  router.get("/companies/:companyId/debug/runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const agentIdFilter = req.query.agentId as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    const conditions = [eq(heartbeatRuns.companyId, companyId)];
    if (agentIdFilter) conditions.push(eq(heartbeatRuns.agentId, agentIdFilter));
    if (statusFilter) conditions.push(eq(heartbeatRuns.status, statusFilter));

    const rows = await db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        agentName: agents.name,
        invocationSource: heartbeatRuns.invocationSource,
        triggerDetail: heartbeatRuns.triggerDetail,
        status: heartbeatRuns.status,
        wakeupRequestId: heartbeatRuns.wakeupRequestId,
        exitCode: heartbeatRuns.exitCode,
        error: heartbeatRuns.error,
        errorCode: heartbeatRuns.errorCode,
        logRef: heartbeatRuns.logRef,
        logBytes: heartbeatRuns.logBytes,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        createdAt: heartbeatRuns.createdAt,
      })
      .from(heartbeatRuns)
      .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
      .where(and(...conditions))
      .orderBy(desc(heartbeatRuns.createdAt))
      .limit(limit);

    // Summary stats
    const stats = await db
      .select({
        status: heartbeatRuns.status,
        count: sql<number>`count(*)::int`,
      })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.companyId, companyId))
      .groupBy(heartbeatRuns.status);

    res.json({ stats: Object.fromEntries(stats.map((s) => [s.status, s.count])), rows });
  });

  /**
   * GET /companies/:companyId/debug/mentions
   * Shows recent wakeups specifically triggered by mentions (reason = 'issue_comment_mentioned').
   * Useful for debugging "agent didn't wake up when mentioned" issues.
   */
  router.get("/companies/:companyId/debug/mentions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const wakeups = await db
      .select({
        id: agentWakeupRequests.id,
        agentId: agentWakeupRequests.agentId,
        agentName: agents.name,
        source: agentWakeupRequests.source,
        triggerDetail: agentWakeupRequests.triggerDetail,
        reason: agentWakeupRequests.reason,
        status: agentWakeupRequests.status,
        coalescedCount: agentWakeupRequests.coalescedCount,
        payload: agentWakeupRequests.payload,
        runId: agentWakeupRequests.runId,
        error: agentWakeupRequests.error,
        requestedAt: agentWakeupRequests.requestedAt,
        claimedAt: agentWakeupRequests.claimedAt,
        finishedAt: agentWakeupRequests.finishedAt,
      })
      .from(agentWakeupRequests)
      .innerJoin(agents, eq(agentWakeupRequests.agentId, agents.id))
      .where(
        and(
          eq(agentWakeupRequests.companyId, companyId),
          eq(agentWakeupRequests.reason, "issue_comment_mentioned"),
        ),
      )
      .orderBy(desc(agentWakeupRequests.requestedAt))
      .limit(limit);

    // For each wakeup with a runId, get the run status
    const runIds = wakeups.map((w) => w.runId).filter(Boolean) as string[];
    let runStatuses: Record<string, string> = {};
    if (runIds.length > 0) {
      const runs = await db
        .select({ id: heartbeatRuns.id, status: heartbeatRuns.status })
        .from(heartbeatRuns)
        .where(sql`${heartbeatRuns.id} = ANY(${runIds})`);
      runStatuses = Object.fromEntries(runs.map((r) => [r.id, r.status]));
    }

    res.json({
      total: wakeups.length,
      wakeups: wakeups.map((w) => ({
        ...w,
        runStatus: w.runId ? runStatuses[w.runId] ?? "unknown" : null,
      })),
    });
  });

  return router;
}
