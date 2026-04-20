import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import {
  createProjectSchema,
  createProjectWorkspaceSchema,
  isUuidLike,
  linkGithubSourceSchema,
  updateProjectSchema,
  updateProjectWorkspaceSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { projectService, logActivity, assetService } from "../services/index.js";
import { ingestProjectArchive } from "../services/archive-ingest.js";
import { createGithubClient, GithubClientError } from "../services/github.js";
import { githubConnectionsService } from "../services/github-connections.js";
import { conflict } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import type { StorageService } from "../storage/types.js";

const MAX_ARCHIVE_BYTES = Number(process.env.PAPERCLIP_ARCHIVE_MAX_BYTES) || 100 * 1024 * 1024; // 100 MB

export function projectRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = projectService(db);
  const assetSvc = assetService(db);
  const archiveUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ARCHIVE_BYTES, files: 1 },
  });

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    return resolved.project?.id ?? rawId;
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(project);
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
    };

    const { workspace, ...projectData } = req.body as CreateProjectPayload;
    const project = await svc.create(companyId, projectData);
    let createdWorkspaceId: string | null = null;
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace);
      if (!createdWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }
      createdWorkspaceId = createdWorkspace.id;
    }
    const hydratedProject = workspace ? await svc.getById(project.id) : project;

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
      },
    });
    res.status(201).json(hydratedProject ?? project);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const project = await svc.update(id, req.body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: req.body,
    });

    res.json(project);
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  /* ------------------------ source (codebase) routes ------------------------ */

  // Link a GitHub repo as this project's codebase. Verifies the
  // repo resolves against the connection before saving.
  router.post(
    "/projects/:id/source/github",
    validate(linkGithubSourceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);

      const connSvc = githubConnectionsService(db);
      const conn = await connSvc.getById(req.body.connectionId);
      if (!conn || conn.companyId !== existing.companyId) {
        res.status(404).json({ error: "GitHub connection not found" });
        return;
      }

      let defaultBranch: string | null = null;
      try {
        const token = await connSvc.resolveToken(conn.id, existing.companyId);
        const client = createGithubClient({ token, cacheKey: `${existing.companyId}:${conn.id}` });
        const repoView = await client.getRepo(req.body.owner, req.body.repo);
        defaultBranch = repoView.defaultBranch ?? null;
      } catch (err) {
        if (err instanceof GithubClientError) {
          res.status(err.status === 404 ? 404 : 422).json({
            error: `Unable to verify repo: ${err.message}`,
          });
          return;
        }
        throw err;
      }

      const updated = await svc.linkGithubSource(id, {
        connectionId: conn.id,
        owner: req.body.owner,
        repo: req.body.repo,
        defaultBranch,
      });

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.source_linked",
        entityType: "project",
        entityId: id,
        details: {
          sourceKind: "github",
          connectionId: conn.id,
          repo: `${req.body.owner}/${req.body.repo}`,
        },
      });

      res.json(updated);
    },
  );

  // Upload a zip archive as this project's codebase.
  router.post("/projects/:id/source/archive", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    try {
      await new Promise<void>((resolve, reject) => {
        archiveUpload.single("file")(req, res, (err: unknown) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `Archive exceeds ${MAX_ARCHIVE_BYTES} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    const filename = file.originalname || "archive.zip";
    if (!/\.zip$/i.test(filename)) {
      res.status(422).json({ error: "Only .zip archives are supported" });
      return;
    }

    const actor = getActorInfo(req);
    let ingest;
    try {
      ingest = await ingestProjectArchive(db, storage, {
        companyId: existing.companyId,
        projectId: id,
        filename,
        buffer: file.buffer,
        actor: {
          agentId: actor.agentId,
          userId: actor.actorType === "user" ? actor.actorId : null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Archive ingest failed";
      res.status(422).json({ error: message });
      return;
    }

    const updated = await svc.linkArchiveSource(id, {
      assetId: ingest.assetId,
      filename: ingest.filename,
      sizeBytes: ingest.sizeBytes,
      entryCount: ingest.entryCount,
    });

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.source_linked",
      entityType: "project",
      entityId: id,
      details: {
        sourceKind: "local_archive",
        filename: ingest.filename,
        sizeBytes: ingest.sizeBytes,
        entryCount: ingest.entryCount,
      },
    });

    res.status(201).json(updated);
  });

  // Unlink any source from the project.
  router.delete("/projects/:id/source", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const updated = await svc.unlinkSource(id);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.source_unlinked",
      entityType: "project",
      entityId: id,
    });

    res.json(updated);
  });

  // List archive entries (file browser) for a local_archive project.
  router.get("/projects/:id/source/files", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    if (existing.sourceKind !== "local_archive") {
      res.status(422).json({ error: "Project has no local_archive source" });
      return;
    }
    const pathPrefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
    const limit = Math.min(Number(req.query.limit ?? 2000), 5000);
    const rows = await svc.listArchiveEntries(id, { pathPrefix, limit });
    res.json(
      rows.map((row) => ({
        id: row.id,
        path: row.path,
        sizeBytes: row.sizeBytes,
        sha1: row.sha1,
        contentType: row.contentType,
        isDirectory: row.isDirectory,
        assetId: row.assetId,
      })),
    );
  });

  // List pull requests for a github-backed project (proxies to GitHub).
  router.get("/projects/:id/source/pulls", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    if (
      existing.sourceKind !== "github" ||
      !existing.githubConnectionId ||
      !existing.githubRepoOwner ||
      !existing.githubRepoName
    ) {
      res.status(422).json({ error: "Project has no github source" });
      return;
    }

    const connSvc = githubConnectionsService(db);
    const conn = await connSvc.getById(existing.githubConnectionId);
    if (!conn) {
      res.status(422).json({ error: "Linked GitHub connection missing" });
      return;
    }
    try {
      const token = await connSvc.resolveToken(conn.id, existing.companyId);
      const client = createGithubClient({ token, cacheKey: `${existing.companyId}:${conn.id}` });
      const state = (req.query.state as "open" | "closed" | "all" | undefined) ?? "open";
      const result = await client.listPullRequests(
        existing.githubRepoOwner,
        existing.githubRepoName,
        { state },
      );
      res.json(result);
    } catch (err) {
      if (err instanceof GithubClientError) {
        res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // Get a single PR detail for a github-backed project.
  router.get("/projects/:id/source/pulls/:number", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    if (
      existing.sourceKind !== "github" ||
      !existing.githubConnectionId ||
      !existing.githubRepoOwner ||
      !existing.githubRepoName
    ) {
      res.status(422).json({ error: "Project has no github source" });
      return;
    }
    const number = Number(req.params.number);
    if (!Number.isFinite(number) || number <= 0) {
      res.status(400).json({ error: "Invalid PR number" });
      return;
    }

    const connSvc = githubConnectionsService(db);
    const conn = await connSvc.getById(existing.githubConnectionId);
    if (!conn) {
      res.status(422).json({ error: "Linked GitHub connection missing" });
      return;
    }
    try {
      const token = await connSvc.resolveToken(conn.id, existing.companyId);
      const client = createGithubClient({ token, cacheKey: `${existing.companyId}:${conn.id}` });
      const result = await client.getPullRequest(
        existing.githubRepoOwner,
        existing.githubRepoName,
        number,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof GithubClientError) {
        res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  /* -------------------- end source routes -------------------- */

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  return router;
}
