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
  pullCommentSchema,
  pullReviewSchema,
  pullMergeSchema,
  parseRepoUrl,
  type GithubConnectionAuthType,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { logActivity, issueService, projectService } from "../services/index.js";
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

function assertPrActionsEnabled() {
  if (!isServerFeatureEnabled("pr_actions")) {
    throw forbidden(
      "GitHub PR actions are not enabled on this instance (pr_actions flag)",
    );
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

  // --- Pull request detail (live, ETag-cached) --------------------------

  router.get(
    "/companies/:companyId/github/repos/:owner/:repo/pulls/:number",
    async (req, res) => {
      assertGithubTabEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      const number = Number(req.params.number);
      if (!Number.isFinite(number) || number <= 0) {
        throw unprocessable("Invalid pull request number");
      }
      assertCompanyAccess(req, companyId);

      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const conn = await resolveConnection(db, companyId, req);
      const { client } = await clientForConnection(db, companyId, conn.id);

      try {
        const [detail, files, reviews] = await Promise.all([
          client.getPullRequest(parsed.owner, parsed.repo, number),
          client.listPullRequestFiles(parsed.owner, parsed.repo, number),
          client.listReviews(parsed.owner, parsed.repo, number),
        ]);
        let checks: Awaited<ReturnType<typeof client.listCheckRuns>> = { items: [] };
        const headSha = (detail.data as unknown as { headSha?: string; headRef?: string })
          .headSha;
        if (headSha) {
          try {
            checks = await client.listCheckRuns(parsed.owner, parsed.repo, headSha);
          } catch {
            checks = { items: [] };
          }
        }
        res.json({
          data: detail.data,
          files: files.items,
          reviews: reviews.items,
          checks: checks.items,
          rateLimit: detail.rateLimit,
          connectionId: conn.id,
        });
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  // --- Pull request mutations (pr_actions gated) ------------------------

  router.post(
    "/companies/:companyId/github/repos/:owner/:repo/pulls/:number/comments",
    validate(pullCommentSchema),
    async (req, res) => {
      assertGithubTabEnabled();
      assertPrActionsEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      const number = Number(req.params.number);
      if (!Number.isFinite(number) || number <= 0) {
        throw unprocessable("Invalid pull request number");
      }
      assertCompanyAccess(req, companyId);
      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const conn = await resolveConnection(db, companyId, req, req.body.connectionId);
      const { client } = await clientForConnection(db, companyId, conn.id);
      try {
        const out = await client.createPullComment(
          parsed.owner,
          parsed.repo,
          number,
          req.body.body,
        );
        const actor = getActorForLog(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "github.pull.comment_created",
          entityType: "github_pull_request",
          entityId: `${parsed.owner}/${parsed.repo}#${number}`,
          details: { commentId: out.id, htmlUrl: out.htmlUrl },
        });
        res.status(201).json(out);
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  router.post(
    "/companies/:companyId/github/repos/:owner/:repo/pulls/:number/reviews",
    validate(pullReviewSchema),
    async (req, res) => {
      assertGithubTabEnabled();
      assertPrActionsEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      const number = Number(req.params.number);
      if (!Number.isFinite(number) || number <= 0) {
        throw unprocessable("Invalid pull request number");
      }
      assertCompanyAccess(req, companyId);
      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const conn = await resolveConnection(db, companyId, req, req.body.connectionId);
      const { client } = await clientForConnection(db, companyId, conn.id);
      try {
        const out = await client.createPullReview(parsed.owner, parsed.repo, number, {
          event: req.body.event,
          body: req.body.body,
        });
        const actor = getActorForLog(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "github.pull.reviewed",
          entityType: "github_pull_request",
          entityId: `${parsed.owner}/${parsed.repo}#${number}`,
          details: { event: req.body.event, reviewId: out.id, state: out.state },
        });
        res.status(201).json(out);
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  router.post(
    "/companies/:companyId/github/repos/:owner/:repo/pulls/:number/merge",
    validate(pullMergeSchema),
    async (req, res) => {
      assertGithubTabEnabled();
      assertPrActionsEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      const number = Number(req.params.number);
      if (!Number.isFinite(number) || number <= 0) {
        throw unprocessable("Invalid pull request number");
      }
      assertCompanyAccess(req, companyId);
      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const conn = await resolveConnection(db, companyId, req, req.body.connectionId);
      const { client } = await clientForConnection(db, companyId, conn.id);
      try {
        const out = await client.mergePullRequest(parsed.owner, parsed.repo, number, {
          method: req.body.method,
          commitTitle: req.body.commitTitle,
          commitMessage: req.body.commitMessage,
        });
        const actor = getActorForLog(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "github.pull.merged",
          entityType: "github_pull_request",
          entityId: `${parsed.owner}/${parsed.repo}#${number}`,
          details: {
            method: req.body.method ?? "merge",
            sha: out.sha,
            merged: out.merged,
          },
        });
        res.json(out);
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  router.post(
    "/companies/:companyId/github/repos/:owner/:repo/pulls/:number/ready",
    async (req, res) => {
      assertGithubTabEnabled();
      assertPrActionsEnabled();
      const companyId = req.params.companyId as string;
      const { owner, repo } = req.params as { owner: string; repo: string };
      const number = Number(req.params.number);
      if (!Number.isFinite(number) || number <= 0) {
        throw unprocessable("Invalid pull request number");
      }
      assertCompanyAccess(req, companyId);
      const parsed = parseRepoUrl(`${owner}/${repo}`);
      if (!parsed) throw unprocessable("Invalid owner/repo");

      const conn = await resolveConnection(db, companyId, req);
      const { client } = await clientForConnection(db, companyId, conn.id);
      try {
        const out = await client.markPullReady(parsed.owner, parsed.repo, number);
        const actor = getActorForLog(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "github.pull.ready_for_review",
          entityType: "github_pull_request",
          entityId: `${parsed.owner}/${parsed.repo}#${number}`,
          details: { draft: out.draft },
        });
        res.json(out);
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  // --- Open draft PR for an issue (S5 — Boared 2.0 pipeline) -----------
  // Creates a branch from the project repo's default branch and opens a
  // draft PR pre-filled from the issue's title + description. The
  // synthesised body links back to the case so reviewers can trace
  // intent. Branch naming is deterministic per issue so re-running the
  // action re-uses the same branch.

  router.post(
    "/companies/:companyId/issues/:issueId/open-pr",
    async (req, res) => {
      assertGithubTabEnabled();
      assertPrActionsEnabled();
      const companyId = req.params.companyId as string;
      const issueId = req.params.issueId as string;
      assertCompanyAccess(req, companyId);

      const issues = issueService(db);
      const projects = projectService(db);
      const issue = await issues.getById(issueId);
      if (!issue) throw notFound("Issue not found");
      if (issue.companyId !== companyId) {
        throw forbidden("Issue not in this company");
      }
      if (!issue.projectId) {
        throw unprocessable("Issue is not attached to a project");
      }
      const project = await projects.getById(issue.projectId);
      if (!project) throw notFound("Project not found");
      const repoUrl =
        project.workspaces.find((w) => w.repoUrl)?.repoUrl ?? null;
      if (!repoUrl) {
        throw unprocessable(
          "Project workspace has no repoUrl. Set one before opening a PR.",
        );
      }
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) throw unprocessable(`Invalid repoUrl: ${repoUrl}`);

      const conn = await resolveConnection(db, companyId, req, req.body?.connectionId);
      const { client } = await clientForConnection(db, companyId, conn.id);

      // Build a stable branch name from identifier + slug.
      const slug = (issue.title || "draft")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "draft";
      const idPart = (issue.identifier ?? issueId.slice(0, 8))
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
      const branch = `paperclip/${idPart}-${slug}`;

      try {
        // Try to create the branch; if it exists already, GitHub
        // returns 422 — fall through to the PR create which will
        // also surface a clear "already exists" if the PR is open.
        try {
          await client.createBranchFromDefault(parsed.owner, parsed.repo, branch);
        } catch (err) {
          if (!(err instanceof GithubClientError) || err.status !== 422) throw err;
        }

        const body = composePrBody(issue, repoUrl);
        const pr = await client.createPullRequest(parsed.owner, parsed.repo, {
          title: issue.title || `Issue ${issue.identifier ?? issueId}`,
          head: branch,
          body,
          draft: true,
        });

        const actor = getActorForLog(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "github.pull.opened_for_issue",
          entityType: "issue",
          entityId: issueId,
          details: {
            owner: parsed.owner,
            repo: parsed.repo,
            number: pr.number,
            htmlUrl: pr.htmlUrl,
            head: branch,
            base: pr.baseRef,
          },
        });
        res.status(201).json({
          pullRequest: pr,
          branch,
          repo: { owner: parsed.owner, repo: parsed.repo },
        });
      } catch (err) {
        handleGithubError(res, err);
      }
    },
  );

  return router;
}

function composePrBody(
  issue: { identifier: string | null; title: string; description: string | null },
  repoUrl: string,
): string {
  const id = issue.identifier ?? "case";
  const lines: string[] = [
    `> Drafted from Boared case **${id}** — ${issue.title}.`,
    "",
  ];
  if (issue.description) {
    lines.push("## Context");
    lines.push("");
    lines.push(issue.description.trim());
    lines.push("");
  }
  lines.push("## Plan");
  lines.push("");
  lines.push("- [ ] Implement the change");
  lines.push("- [ ] Add tests / update docs");
  lines.push("- [ ] Mark this PR ready for review");
  lines.push("");
  lines.push(`<sub>Repo: ${repoUrl}</sub>`);
  return lines.join("\n");
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
