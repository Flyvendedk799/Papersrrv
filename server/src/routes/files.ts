import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { createFileSnapshotSchema, indexRunFilesSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { fileService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { indexRunFromLog } from "../services/file-indexer.js";
import { parsePaginationParams, buildPaginatedResponse } from "../lib/pagination.js";
import { logger } from "../middleware/logger.js";

export function fileRoutes(db: Db) {
  const router = Router();
  const svc = fileService(db);

  // List files for a company (with optional filters)
  router.get("/companies/:companyId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { agentId, runId, search } = req.query as {
      agentId?: string;
      runId?: string;
      search?: string;
    };
    const wantsPagination = req.query.cursor !== undefined || req.query.limit !== undefined;
    const { limit } = parsePaginationParams(req.query as Record<string, unknown>);

    const files = await svc.listFiles(companyId, { agentId, runId, search, limit });
    if (wantsPagination) {
      const paginated = buildPaginatedResponse(files, limit, (file) => ({
        capturedAt: file.latestSnapshot.capturedAt,
        filePath: file.filePath,
      }));
      res.json(paginated);
    } else {
      res.json(files);
    }
  });

  // Get file tree for a company
  router.get("/companies/:companyId/files/tree", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { agentId } = req.query as { agentId?: string };
    const tree = await svc.getFileTree(companyId, { agentId });
    res.json(tree);
  });

  // Get file history (all snapshots for a path)
  router.get("/companies/:companyId/files/history", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ error: "path query parameter is required" });
      return;
    }

    const history = await svc.getFileHistory(companyId, filePath);
    res.json(history);
  });

  // Get file content by hash (scoped to company for multi-tenancy safety)
  router.get("/companies/:companyId/files/content/:hash", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const hash = req.params.hash as string;
    const content = await svc.getContent(hash, companyId);
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json(content);
  });

  // Read a file directly from the filesystem (fallback for unindexed files).
  // Scoped to the server's working directory to prevent arbitrary file reads.
  router.get("/companies/:companyId/files/raw", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filePath = req.query.path as string | undefined;
    if (!filePath || !filePath.trim()) {
      res.status(400).json({ error: "path query parameter is required" });
      return;
    }

    // Resolve the path and ensure it stays within allowed roots.
    // Allowed roots: the server's cwd (where agents/ scaffolding lives) and
    // the ~/.paperclip directory (where agent workspaces live).
    const resolved = path.resolve(filePath);
    const serverRoot = process.cwd();
    const paperclipHome = path.join(process.env.HOME ?? process.env.USERPROFILE ?? serverRoot, ".paperclip");
    const allowedRoots = [serverRoot, paperclipHome];

    const isAllowed = allowedRoots.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep),
    );
    if (!isAllowed) {
      res.status(403).json({ error: "File path is outside allowed directories" });
      return;
    }

    try {
      // Resolve symlinks to prevent escaping allowed roots
      const realPath = await fs.realpath(resolved);
      const realAllowed = await Promise.all(
        allowedRoots.map((r) => fs.realpath(r).catch(() => r)),
      );
      if (!realAllowed.some((r) => realPath === r || realPath.startsWith(r + path.sep))) {
        res.status(403).json({ error: "File path resolves outside allowed directories" });
        return;
      }

      const stat = await fs.stat(realPath);
      if (!stat.isFile()) {
        res.status(400).json({ error: "Path is not a file" });
        return;
      }
      // Limit to reasonable file sizes (2MB)
      if (stat.size > 2 * 1024 * 1024) {
        res.status(413).json({ error: "File too large to serve raw" });
        return;
      }
      const content = await fs.readFile(realPath, "utf-8");
      const isMarkdown = /\.(md|mdx|markdown)$/i.test(realPath);
      res.json({ content, isMarkdown, size: stat.size, path: filePath });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        res.status(404).json({ error: "File not found on disk" });
        return;
      }
      logger.warn({ err, filePath: resolved }, "Failed to read raw file");
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  // Get files for a specific run
  router.get("/companies/:companyId/runs/:runId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    const runId = req.params.runId as string;
    assertCompanyAccess(req, companyId);

    const files = await svc.getRunFiles(companyId, runId);
    res.json(files);
  });

  // Create a single file snapshot
  router.post(
    "/companies/:companyId/files/snapshots",
    validate(createFileSnapshotSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const snapshot = await svc.createSnapshot(companyId, req.body);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "file.snapshot_created",
        entityType: "file",
        entityId: snapshot.id,
        details: {
          filePath: snapshot.filePath,
          operation: snapshot.operation,
          runId: snapshot.runId,
        },
      });

      res.status(201).json(snapshot);
    },
  );

  // Bulk-index files from a run
  router.post(
    "/companies/:companyId/files/index",
    validate(indexRunFilesSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const indexed = await svc.indexRunFiles(companyId, req.body);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "file.run_indexed",
        entityType: "file",
        entityId: req.body.runId,
        details: {
          runId: req.body.runId,
          agentId: req.body.agentId,
          fileCount: indexed,
        },
      });

      res.status(201).json({ indexed });
    },
  );

  // Get summary files linked to an issue
  router.get("/companies/:companyId/issues/:issueId/summary-files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const issueId = req.params.issueId as string;
    const summaryFiles = await svc.getIssueSummaryFiles(issueId);
    res.json(summaryFiles);
  });

  // Link a file snapshot as a summary for an issue
  router.post("/companies/:companyId/issues/:issueId/summary-files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const issueId = req.params.issueId as string;
    const { snapshotId } = req.body as { snapshotId: string };
    if (!snapshotId) {
      res.status(400).json({ error: "snapshotId is required" });
      return;
    }

    const result = await svc.addIssueSummaryFile(issueId, snapshotId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "file.summary_linked",
      entityType: "issue",
      entityId: issueId,
      details: { snapshotId, filePath: result.filePath },
    });

    res.status(201).json(result);
  });

  // Remove a summary file link from an issue
  router.delete("/companies/:companyId/issues/:issueId/summary-files/:summaryFileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const issueId = req.params.issueId as string;
    const summaryFileId = req.params.summaryFileId as string;

    await svc.removeIssueSummaryFile(issueId, summaryFileId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "file.summary_unlinked",
      entityType: "issue",
      entityId: issueId,
      details: { summaryFileId },
    });

    res.status(204).end();
  });

  // Backfill: re-index files from all completed runs for a company
  router.post("/companies/:companyId/files/backfill", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const runs = await db
      .select({
        id: heartbeatRuns.id,
        companyId: heartbeatRuns.companyId,
        agentId: heartbeatRuns.agentId,
        logStore: heartbeatRuns.logStore,
        logRef: heartbeatRuns.logRef,
      })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.companyId, companyId));

    let totalIndexed = 0;
    let failed = 0;
    let missingLogs = 0;
    for (const run of runs) {
      try {
        const count = await indexRunFromLog(db, run);
        if (count === 0) missingLogs++;
        totalIndexed += count;
      } catch (err) {
        logger.warn({ err, runId: run.id }, "backfill indexing failed for run");
        failed++;
      }
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "file.backfill",
      entityType: "file",
      entityId: companyId,
      details: { runsProcessed: runs.length, totalIndexed, failed },
    });

    res.json({ runsProcessed: runs.length, totalIndexed, failed, missingLogs });
  });

  // File diff between two snapshots
  router.get("/companies/:companyId/files/diff", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const hashA = req.query.a as string;
    const hashB = req.query.b as string;
    if (!hashA || !hashB) {
      res.status(400).json({ error: "Both 'a' and 'b' content hash params required" });
      return;
    }
    const [contentA, contentB] = await Promise.all([
      svc.getContent(hashA, companyId),
      svc.getContent(hashB, companyId),
    ]);
    if (!contentA || !contentB) {
      res.status(404).json({ error: "One or both content hashes not found" });
      return;
    }
    // Simple line-by-line diff
    const linesA = (contentA.content ?? "").split("\n");
    const linesB = (contentB.content ?? "").split("\n");
    const changes: Array<{ type: "add" | "remove" | "same"; line: string; lineNumber: number }> = [];
    const maxLen = Math.max(linesA.length, linesB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = linesA[i];
      const b = linesB[i];
      if (a === b) {
        changes.push({ type: "same", line: a ?? "", lineNumber: i + 1 });
      } else {
        if (a !== undefined) changes.push({ type: "remove", line: a, lineNumber: i + 1 });
        if (b !== undefined) changes.push({ type: "add", line: b, lineNumber: i + 1 });
      }
    }
    res.json({ hashA, hashB, totalChanges: changes.filter(c => c.type !== "same").length, changes });
  });

  // File locks
  router.post("/companies/:companyId/files/locks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { fileLockingService } = await import("../services/file-locking.js");
    const lockSvc = fileLockingService(db);
    const { agentId, filePath, reason, durationMs } = req.body;
    if (!agentId || !filePath) {
      res.status(400).json({ error: "agentId and filePath required" });
      return;
    }
    const result = await lockSvc.acquire(companyId, agentId, filePath, { reason, durationMs });
    res.json(result);
  });

  router.delete("/companies/:companyId/files/locks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { fileLockingService } = await import("../services/file-locking.js");
    const lockSvc = fileLockingService(db);
    const { agentId, filePath } = req.body;
    const released = await lockSvc.release(companyId, agentId, filePath);
    res.json({ released });
  });

  router.get("/companies/:companyId/files/locks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { fileLockingService } = await import("../services/file-locking.js");
    const lockSvc = fileLockingService(db);
    const locks = await lockSvc.listActive(companyId);
    res.json(locks);
  });

  // File conflicts
  router.get("/companies/:companyId/files/conflicts", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { fileLockingService } = await import("../services/file-locking.js");
    const lockSvc = fileLockingService(db);
    const conflicts = await lockSvc.detectConflicts(companyId);
    res.json(conflicts);
  });

  // Git workspace status
  router.get("/companies/:companyId/agents/:agentId/workspace/git", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);
    const { gitWorkspaceService } = await import("../services/git-workspace.js");
    const git = gitWorkspaceService();
    // Get agent workspace path - use adapter config or default
    const agent = await db.select().from((await import("@paperclipai/db")).agents).where((await import("drizzle-orm")).eq((await import("@paperclipai/db")).agents.id, agentId)).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd as string;
    if (!cwd) { res.json({ initialized: false, error: "No workspace path configured" }); return; }
    const status = await git.status(cwd);
    res.json(status);
  });

  router.get("/companies/:companyId/agents/:agentId/workspace/git/log", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);
    const { gitWorkspaceService } = await import("../services/git-workspace.js");
    const git = gitWorkspaceService();
    const agent = await db.select().from((await import("@paperclipai/db")).agents).where((await import("drizzle-orm")).eq((await import("@paperclipai/db")).agents.id, agentId)).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd as string;
    if (!cwd) { res.json([]); return; }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const commits = await git.log(cwd, limit);
    res.json(commits);
  });

  // File search with ILIKE (pg_trgm can be enabled for better performance)
  router.get("/companies/:companyId/files/search", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 2) {
      res.status(400).json({ error: "Search query must be at least 2 characters" });
      return;
    }
    const { agentFileSnapshots } = await import("@paperclipai/db");
    const { and: andOp, eq: eqOp, sql: sqlOp, desc: descOp } = await import("drizzle-orm");
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const results = await db
      .select({
        filePath: agentFileSnapshots.filePath,
        agentId: agentFileSnapshots.agentId,
        operation: agentFileSnapshots.operation,
        capturedAt: agentFileSnapshots.capturedAt,
        contentHash: agentFileSnapshots.contentHash,
      })
      .from(agentFileSnapshots)
      .where(andOp(
        eqOp(agentFileSnapshots.companyId, companyId),
        sqlOp`${agentFileSnapshots.filePath} ILIKE ${pattern} ESCAPE '\\'`,
      ))
      .orderBy(descOp(agentFileSnapshots.capturedAt))
      .limit(100);
    res.json(results);
  });

  // File analytics - workspace size and stats
  router.get("/companies/:companyId/files/analytics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { agentFileSnapshots, fileContents } = await import("@paperclipai/db");
    const { eq: eqOp, sql: sqlOp } = await import("drizzle-orm");

    const [stats] = await db
      .select({
        totalFiles: sqlOp<number>`count(DISTINCT ${agentFileSnapshots.filePath})::int`,
        totalSnapshots: sqlOp<number>`count(*)::int`,
        totalAgents: sqlOp<number>`count(DISTINCT ${agentFileSnapshots.agentId})::int`,
        latestActivity: sqlOp<Date>`max(${agentFileSnapshots.capturedAt})`,
        oldestActivity: sqlOp<Date>`min(${agentFileSnapshots.capturedAt})`,
      })
      .from(agentFileSnapshots)
      .where(eqOp(agentFileSnapshots.companyId, companyId));

    const [contentStats] = await db
      .select({
        totalContentEntries: sqlOp<number>`count(*)::int`,
        totalSizeBytes: sqlOp<number>`coalesce(sum(length(${fileContents.content})), 0)::int`,
        avgSizeBytes: sqlOp<number>`coalesce(avg(length(${fileContents.content})), 0)::int`,
      })
      .from(fileContents);

    // Top file extensions
    const topExtensions = await db
      .select({
        extension: sqlOp<string>`COALESCE(NULLIF(substring(${agentFileSnapshots.filePath} from '\\.([^.]+)$'), ''), 'no-ext')`,
        count: sqlOp<number>`count(DISTINCT ${agentFileSnapshots.filePath})::int`,
      })
      .from(agentFileSnapshots)
      .where(eqOp(agentFileSnapshots.companyId, companyId))
      .groupBy(sqlOp`substring(${agentFileSnapshots.filePath} from '\\.([^.]+)$')`)
      .orderBy(sqlOp`count(DISTINCT ${agentFileSnapshots.filePath}) DESC`)
      .limit(20);

    res.json({ ...stats, content: contentStats, topExtensions });
  });

  return router;
}
