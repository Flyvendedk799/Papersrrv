import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createFileSnapshotSchema, indexRunFilesSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { fileService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

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

  // Get file content by hash
  router.get("/files/content/:hash", async (req, res) => {
    const hash = req.params.hash as string;
    const content = await svc.getContent(hash);
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json(content);
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

  return router;
}
