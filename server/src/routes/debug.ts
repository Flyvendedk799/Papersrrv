import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentWakeupRequests, agents, heartbeatRuns, heartbeatRunEvents } from "@paperclipai/db";
import { eq, and, asc, desc, sql, isNotNull } from "drizzle-orm";
import { assertCompanyAccess } from "./authz.js";
import { getRunLogStore } from "../services/run-log-store.js";
import { extractFileOpsFromLog, extractFileOpsFromChunks } from "../services/file-indexer.js";

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

  /**
   * GET /companies/:companyId/debug/run-log/:runId
   * Diagnostic: reads a run's NDJSON log and shows what the file-indexer parser finds.
   * Returns raw log sample, parsed events, and extracted file ops.
   */
  router.get("/companies/:companyId/debug/run-log/:runId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const runId = req.params.runId as string;
    assertCompanyAccess(req, companyId);

    const run = await db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        logStore: heartbeatRuns.logStore,
        logRef: heartbeatRuns.logRef,
        logBytes: heartbeatRuns.logBytes,
        status: heartbeatRuns.status,
      })
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId)))
      .then((rows) => rows[0] ?? null);

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const result: Record<string, unknown> = {
      run: { id: run.id, agentId: run.agentId, status: run.status, logStore: run.logStore, logRef: run.logRef, logBytes: run.logBytes },
    };

    // Try reading the NDJSON log file
    if (run.logRef) {
      try {
        const logStore = getRunLogStore();
        const handle = { store: (run.logStore ?? "local_file") as "local_file", logRef: run.logRef };
        const logResult = await logStore.read(handle, { offset: 0, limitBytes: 2_000_000 });
        const logContent = logResult.content;

        result.logAvailable = true;
        result.logContentLength = logContent.length;

        // Show first 10 raw NDJSON lines
        const lines = logContent.split("\n").filter((l: string) => l.trim());
        result.totalLines = lines.length;
        result.rawSample = lines.slice(0, 10);

        // Show what the parser found for each of those lines
        const parsedSample: unknown[] = [];
        for (const line of lines.slice(0, 20)) {
          try {
            const entry = JSON.parse(line) as { stream?: string; chunk?: string };
            const chunkPreview = entry.chunk?.slice(0, 500);
            parsedSample.push({
              stream: entry.stream,
              chunkLength: entry.chunk?.length,
              chunkPreview,
            });
          } catch {
            parsedSample.push({ parseError: true, raw: line.slice(0, 200) });
          }
        }
        result.parsedSample = parsedSample;

        // Run the full extractor
        const fileOps = extractFileOpsFromLog(logContent);
        result.extractedFileOps = fileOps.length;
        result.fileOpsSample = fileOps.slice(0, 20).map((op) => ({
          filePath: op.filePath,
          operation: op.operation,
          hasContent: !!op.content,
          contentLength: op.content?.length,
        }));
      } catch (err) {
        result.logAvailable = false;
        result.logError = err instanceof Error ? err.message : String(err);
      }
    } else {
      result.logAvailable = false;
      result.logError = "No logRef on run";
    }

    // Also show run events from the DB as fallback data source
    const allEvents = await db
      .select({
        seq: heartbeatRunEvents.seq,
        stream: heartbeatRunEvents.stream,
        message: heartbeatRunEvents.message,
      })
      .from(heartbeatRunEvents)
      .where(eq(heartbeatRunEvents.runId, runId))
      .orderBy(asc(heartbeatRunEvents.seq));

    result.dbEventsTotal = allEvents.length;
    result.dbEventsSample = allEvents.slice(0, 10).map((e) => ({
      seq: e.seq,
      stream: e.stream,
      messagePreview: (e.message ?? "").slice(0, 500),
    }));

    // Try parsing stdout events through the file-indexer (DB event fallback)
    const stdoutEvents = allEvents.filter((e) => e.stream === "stdout");
    result.dbStdoutEventsCount = stdoutEvents.length;
    if (stdoutEvents.length > 0) {
      const chunks = stdoutEvents.map((e) => e.message ?? "").filter(Boolean);
      const dbFileOps = extractFileOpsFromChunks(chunks);
      result.dbExtractedFileOps = dbFileOps.length;
      result.dbFileOpsSample = dbFileOps.slice(0, 20).map((op) => ({
        filePath: op.filePath,
        operation: op.operation,
        hasContent: !!op.content,
        contentLength: op.content?.length,
      }));
    }

    res.json(result);
  });

  /**
   * GET /companies/:companyId/debug/recent-log-check
   * Quick check: finds the most recent completed run with a logRef and tries to parse it.
   * No params needed — just hit this to see if file indexing would work for recent runs.
   */
  router.get("/companies/:companyId/debug/recent-log-check", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Find most recent completed run with logRef
    const run = await db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        logStore: heartbeatRuns.logStore,
        logRef: heartbeatRuns.logRef,
        logBytes: heartbeatRuns.logBytes,
        status: heartbeatRuns.status,
        finishedAt: heartbeatRuns.finishedAt,
      })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          isNotNull(heartbeatRuns.logRef),
          eq(heartbeatRuns.status, "succeeded"),
        ),
      )
      .orderBy(desc(heartbeatRuns.finishedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!run) {
      res.json({ error: "No completed runs with logRef found" });
      return;
    }

    // Redirect to the detailed endpoint
    res.redirect(`/api/companies/${companyId}/debug/run-log/${run.id}`);
  });

  return router;
}
