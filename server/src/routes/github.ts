/**
 * GitHub Tab routes (backlog 4.0 foundation).
 *
 * Read-only subset:
 *   GET    /api/companies/:companyId/github/connections
 *   POST   /api/companies/:companyId/github/connections       (create PAT)
 *   DELETE /api/companies/:companyId/github/connections/:id
 *   GET    /api/companies/:companyId/github/repos/:owner/:repo
 *   GET    /api/companies/:companyId/github/repos/:owner/:repo/pulls
 *
 * Webhook ingestion (A3) and PR mutations (B3/C1-C5) are deferred.
 * All endpoints are gated behind `github_tab_enabled`.
 */

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createGithubConnectionSchema,
  listGithubPullsQuerySchema,
  parseRepoUrl,
  type GithubConnectionAuthType,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { logActivity } from "../services/index.js";
import { githubConnectionsService } from "../services/github-connections.js";
import { createGithubClient, GithubClientError, clearGithubCache } from "../services/github.js";
import { isServerFeatureEnabled } from "../lib/feature-flags.js";
import { forbidden, notFound, unprocessable } from "../errors.js";

function assertGithubTabEnabled() {
  if (!isServerFeatureEnabled("github_tab_enabled")) {
    throw forbidden("GitHub tab is not enabled on this instance");
  }
}

function assertPatAuthEnabled() {
  if (!isServerFeatureEnabled("github_pat_auth")) {
    throw forbidden("GitHub PAT auth is not enabled on this instance");
  }
}

function githubErrorStatus(err: GithubClientError) {
  if (err.status === 401) return 401;
  if (err.status === 403) return 403;
  if (err.status === 404) return 404;
  if (err.status === 422) return 422;
  if (err.code === "rate_limited") return 429;
  if (err.code === "network_error") return 502;
  if (err.status >= 500) return 502;
  return 500;
}

async function clientForConnection(
  db: Db,
  companyId: string,
  connectionId: string,
) {
  const svc = githubConnectionsService(db);
  const conn = await svc.getById(connectionId);
  if (!conn) throw notFound("GitHub connection not found");
  if (conn.companyId !== companyId) throw forbidden("Connection not in this company");
  const token = await svc.resolveToken(conn.id, companyId);
  return {
    conn,
    client: createGithubClient({ token, cacheKey: `${companyId}:${conn.id}` }),
  };
}

async function firstConnectionFor(db: Db, companyId: string) {
  const svc = githubConnectionsService(db);
  const rows = await svc.list(companyId);
  return rows.find((c) => !c.revokedAt) ?? null;
}

function getActorForLog(req: Request) {
  return {
    actorType:
      req.actor.type === "agent"
        ? ("agent" as const)
        : ("user" as const),
    actorId:
      req.actor.type === "agent"
        ? req.actor.agentId ?? "unknown-agent"
        : req.actor.userId ?? "board",
  };
}

export function githubRoutes(db: Db) {
  const router = Router();
  const svc = githubConnectionsService(db);

  // --- Connections CRUD --------------------------------------------------

  router.get("/companies/:companyId/github/connections", async (req, res) => {
    assertGithubTabEnabled();
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/github/connections",
    validate(createGithubConnectionSchema),
    async (req, res) => {
      assertGithubTabEnabled();
      assertPatAuthEnabled();
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const actor = getActorForLog(req);

      const created = await svc.createPatConnection(
        companyId,
        {
          token: req.body.token,
          accountLogin: req.body.accountLogin ?? null,
          description: req.body.description ?? null,
        },
        {
          userId: req.actor.type === "board" ? req.actor.userId ?? "board" : null,
          agentId: req.actor.type === "agent" ? req.actor.agentId ?? null : null,
        },
      );

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        action: "github.connection.created",
        entityType: "github_connection",
        entityId: created.id,
        details: {
          authType: created.authType satisfies GithubConnectionAuthType,
          accountLogin: created.accountLogin,
        },
      });

      res.status(201).json(created);
    },
  );

  router.delete(
    "/companies/:companyId/github/connections/:id",
    async (req, res) => {
      assertGithubTabEnabled();
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);

      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "GitHub connection not found" });
        return;
      }
      if (existing.companyId !== companyId) {
        throw forbidden("Connection not in this company");
      }

      const removed = await svc.remove(id);
      clearGithubCache(`${companyId}:${id}`);

      const actor = getActorForLog(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        action: "github.connection.deleted",
        entityType: "github_connection",
        entityId: id,
        details: { accountLogin: existing.accountLogin },
      });

      res.json({ ok: true, removed });
    },
  );

  // --- Read-only repo + PR endpoints (live GitHub, ETag-cached) ---------

  router.get(
    "/companies/:companyId/github/repos/:owner/:repo",
    async (req, res) => {
      assertGithubTabEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      assertCompanyAccess(req, companyId);

      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const conn = await resolveConnection(db, companyId, req);
      const { client } = await clientForConnection(db, companyId, conn.id);
      try {
        const view = await client.getRepo(parsed.owner, parsed.repo);
        await svc.markVerified(conn.id);
        res.json({ data: view, connectionId: conn.id });
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  router.get(
    "/companies/:companyId/github/repos/:owner/:repo/pulls",
    async (req, res) => {
      assertGithubTabEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      assertCompanyAccess(req, companyId);

      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const query = listGithubPullsQuerySchema.parse(req.query);
      const conn = await resolveConnection(db, companyId, req, query.connectionId);
      const { client } = await clientForConnection(db, companyId, conn.id);
      try {
        const result = await client.listPullRequests(parsed.owner, parsed.repo, {
          state: query.state ?? "open",
        });
        res.json({ ...result, connectionId: conn.id });
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  return router;
}

async function resolveConnection(
  db: Db,
  companyId: string,
  req: Request,
  explicitId?: string,
) {
  const svc = githubConnectionsService(db);
  // Allow explicit override via body/query, otherwise pick first live one.
  const id =
    explicitId ??
    (typeof req.query.connectionId === "string"
      ? (req.query.connectionId as string)
      : undefined);
  if (id) {
    const conn = await svc.getById(id);
    if (!conn) throw notFound("GitHub connection not found");
    if (conn.companyId !== companyId) throw forbidden("Connection not in this company");
    return conn;
  }
  const first = await firstConnectionFor(db, companyId);
  if (!first) {
    throw notFound("No GitHub connection configured for this company");
  }
  return first;
}

function handleGithubError(
  res: import("express").Response,
  err: unknown,
) {
  if (err instanceof GithubClientError) {
    res.status(githubErrorStatus(err)).json({
      error: err.message,
      code: err.code,
      rateLimit: err.rateLimit,
    });
    return;
  }
  throw err;
}
