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

    const files = await svc.listFiles(companyId, { agentId, runId, search });
    res.json(files);
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

  return router;
}
