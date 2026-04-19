/**
 * GitHub webhook ingestion (backlog 4.0 A3).
 *
 * POST /api/webhooks/github
 *
 * Mounted BEFORE the global JSON body parser so we can compute the
 * X-Hub-Signature-256 HMAC over the raw bytes. We parse the JSON once
 * ourselves after verification succeeds.
 *
 * Delivery model:
 *   - One GitHub App (or many per-repo webhooks) sends here.
 *   - The handler finds ALL company-scoped github_repos rows for the
 *     event's owner/repo and fans out upserts into each.
 *   - Each company gets its own activity-log entry and a live event.
 *
 * Idempotency:
 *   - Every row uses a stable natural key (pr number, commit sha,
 *     release id, review id, check run id) — repeated deliveries are
 *     last-write-wins by `updatedAt` column (we always set
 *     `updated_at = now()` on upsert).
 *
 * Secret source:
 *   - `process.env.GITHUB_WEBHOOK_SECRET` (single instance secret).
 *     Gated behind the `github_webhooks` server feature flag.
 *
 * Handlers implemented: pull_request, push, check_run, release,
 * issues, issue_comment, workflow_run, ping.
 */

import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { verify } from "@octokit/webhooks-methods";
import express from "express";
import type { Db } from "@paperclipai/db";
import {
  githubRepos,
  githubPullRequests,
  githubCommits,
  githubReleases,
  githubChecks,
  githubReviews,
  githubBranches,
} from "@paperclipai/db";
import type { GithubWebhookIngestResult } from "@paperclipai/shared";
import { isServerFeatureEnabled } from "../lib/feature-flags.js";
import { logActivity } from "../services/index.js";

function getWebhookSecret(): string | null {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || secret.length < 8) return null;
  return secret;
}

async function timingSafeVerify(
  secret: string,
  body: string,
  signature: string | undefined,
): Promise<boolean> {
  if (!signature) return false;
  try {
    return await verify(secret, body, signature);
  } catch {
    return false;
  }
}

type ReposByCompany = Array<{
  id: string;
  companyId: string;
  owner: string;
  repo: string;
  connectionId: string;
}>;

async function findReposForEvent(
  db: Db,
  owner: string,
  repo: string,
): Promise<ReposByCompany> {
  const rows = await db
    .select({
      id: githubRepos.id,
      companyId: githubRepos.companyId,
      owner: githubRepos.owner,
      repo: githubRepos.repo,
      connectionId: githubRepos.connectionId,
    })
    .from(githubRepos)
    .where(and(eq(githubRepos.owner, owner), eq(githubRepos.repo, repo)));
  return rows;
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

// ── Event handlers ──────────────────────────────────────────────────

async function handlePullRequest(
  db: Db,
  repoRow: ReposByCompany[number],
  payload: Record<string, unknown>,
): Promise<void> {
  const pr = (payload.pull_request as Record<string, unknown> | undefined) ?? {};
  if (!pr.id || !pr.number) return;
  const user = pr.user as Record<string, unknown> | null | undefined;
  const head = pr.head as Record<string, unknown> | null | undefined;
  const base = pr.base as Record<string, unknown> | null | undefined;
  const labels = Array.isArray(pr.labels)
    ? (pr.labels as Record<string, unknown>[])
    : [];
  const state = pr.state === "closed" ? "closed" : "open";

  await db
    .insert(githubPullRequests)
    .values({
      companyId: repoRow.companyId,
      connectionId: repoRow.connectionId,
      repoId: repoRow.id,
      githubPrId: Number(pr.id),
      number: Number(pr.number),
      title: String(pr.title ?? ""),
      state,
      draft: Boolean(pr.draft),
      merged: Boolean(pr.merged),
      mergeable: typeof pr.mergeable === "boolean" ? (pr.mergeable as boolean) : null,
      authorLogin: user ? (user.login as string | null) ?? null : null,
      headRef: head ? (head.ref as string | null) ?? null : null,
      baseRef: base ? (base.ref as string | null) ?? null : null,
      url: (pr.html_url as string | null) ?? null,
      body: (pr.body as string | null) ?? null,
      labels,
      githubUpdatedAt: toDate(pr.updated_at),
      githubCreatedAt: toDate(pr.created_at),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [githubPullRequests.repoId, githubPullRequests.number],
      set: {
        title: String(pr.title ?? ""),
        state,
        draft: Boolean(pr.draft),
        merged: Boolean(pr.merged),
        mergeable: typeof pr.mergeable === "boolean" ? (pr.mergeable as boolean) : null,
        authorLogin: user ? (user.login as string | null) ?? null : null,
        headRef: head ? (head.ref as string | null) ?? null : null,
        baseRef: base ? (base.ref as string | null) ?? null : null,
        url: (pr.html_url as string | null) ?? null,
        body: (pr.body as string | null) ?? null,
        labels,
        githubUpdatedAt: toDate(pr.updated_at),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function handlePush(
  db: Db,
  repoRow: ReposByCompany[number],
  payload: Record<string, unknown>,
): Promise<void> {
  const ref = typeof payload.ref === "string" ? payload.ref : "";
  const branch = ref.replace(/^refs\/heads\//, "") || null;
  const commits = Array.isArray(payload.commits)
    ? (payload.commits as Record<string, unknown>[])
    : [];
  const headCommitSha =
    typeof payload.after === "string" ? (payload.after as string) : null;

  for (const c of commits) {
    if (!c.id) continue;
    const author = (c.author as Record<string, unknown>) ?? {};
    await db
      .insert(githubCommits)
      .values({
        companyId: repoRow.companyId,
        repoId: repoRow.id,
        sha: String(c.id),
        branch,
        message: (c.message as string | null) ?? null,
        authorLogin: (author.username as string | null) ?? null,
        authorName: (author.name as string | null) ?? null,
        authoredAt: toDate(c.timestamp),
        htmlUrl: (c.url as string | null) ?? null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [githubCommits.repoId, githubCommits.sha],
        set: {
          branch,
          message: (c.message as string | null) ?? null,
          authorLogin: (author.username as string | null) ?? null,
          authorName: (author.name as string | null) ?? null,
          authoredAt: toDate(c.timestamp),
          htmlUrl: (c.url as string | null) ?? null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  if (branch && headCommitSha) {
    await db
      .insert(githubBranches)
      .values({
        companyId: repoRow.companyId,
        repoId: repoRow.id,
        name: branch,
        lastCommitSha: headCommitSha,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [githubBranches.repoId, githubBranches.name],
        set: {
          lastCommitSha: headCommitSha,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }
}

async function handleCheckRun(
  db: Db,
  repoRow: ReposByCompany[number],
  payload: Record<string, unknown>,
): Promise<void> {
  const run = (payload.check_run as Record<string, unknown> | undefined) ?? {};
  if (!run.id) return;
  await db
    .insert(githubChecks)
    .values({
      companyId: repoRow.companyId,
      repoId: repoRow.id,
      githubCheckId: Number(run.id),
      name: String(run.name ?? ""),
      headSha: String(run.head_sha ?? ""),
      status: (run.status as string | null) ?? null,
      conclusion: (run.conclusion as string | null) ?? null,
      htmlUrl: (run.html_url as string | null) ?? null,
      startedAt: toDate(run.started_at),
      completedAt: toDate(run.completed_at),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [githubChecks.repoId, githubChecks.githubCheckId],
      set: {
        name: String(run.name ?? ""),
        headSha: String(run.head_sha ?? ""),
        status: (run.status as string | null) ?? null,
        conclusion: (run.conclusion as string | null) ?? null,
        htmlUrl: (run.html_url as string | null) ?? null,
        startedAt: toDate(run.started_at),
        completedAt: toDate(run.completed_at),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function handleRelease(
  db: Db,
  repoRow: ReposByCompany[number],
  payload: Record<string, unknown>,
): Promise<void> {
  const rel = (payload.release as Record<string, unknown> | undefined) ?? {};
  if (!rel.id || !rel.tag_name) return;
  await db
    .insert(githubReleases)
    .values({
      companyId: repoRow.companyId,
      repoId: repoRow.id,
      githubReleaseId: Number(rel.id),
      tagName: String(rel.tag_name),
      name: (rel.name as string | null) ?? null,
      draft: Boolean(rel.draft),
      prerelease: Boolean(rel.prerelease),
      body: (rel.body as string | null) ?? null,
      htmlUrl: (rel.html_url as string | null) ?? null,
      publishedAt: toDate(rel.published_at),
      githubCreatedAt: toDate(rel.created_at),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [githubReleases.repoId, githubReleases.githubReleaseId],
      set: {
        tagName: String(rel.tag_name),
        name: (rel.name as string | null) ?? null,
        draft: Boolean(rel.draft),
        prerelease: Boolean(rel.prerelease),
        body: (rel.body as string | null) ?? null,
        htmlUrl: (rel.html_url as string | null) ?? null,
        publishedAt: toDate(rel.published_at),
        githubCreatedAt: toDate(rel.created_at),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function handlePullRequestReview(
  db: Db,
  repoRow: ReposByCompany[number],
  payload: Record<string, unknown>,
): Promise<void> {
  const review = (payload.review as Record<string, unknown> | undefined) ?? {};
  const pr = (payload.pull_request as Record<string, unknown> | undefined) ?? {};
  if (!review.id || !pr.number) return;
  // Resolve our internal PR row id
  const prRows = await db
    .select({ id: githubPullRequests.id })
    .from(githubPullRequests)
    .where(
      and(
        eq(githubPullRequests.repoId, repoRow.id),
        eq(githubPullRequests.number, Number(pr.number)),
      ),
    );
  const prRow = prRows[0];
  if (!prRow) return;

  const user = review.user as Record<string, unknown> | null | undefined;
  await db
    .insert(githubReviews)
    .values({
      companyId: repoRow.companyId,
      repoId: repoRow.id,
      pullRequestId: prRow.id,
      githubReviewId: Number(review.id),
      reviewerLogin: user ? (user.login as string | null) ?? null : null,
      state: String(review.state ?? ""),
      body: (review.body as string | null) ?? null,
      htmlUrl: (review.html_url as string | null) ?? null,
      submittedAt: toDate(review.submitted_at),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [githubReviews.pullRequestId, githubReviews.githubReviewId],
      set: {
        reviewerLogin: user ? (user.login as string | null) ?? null : null,
        state: String(review.state ?? ""),
        body: (review.body as string | null) ?? null,
        htmlUrl: (review.html_url as string | null) ?? null,
        submittedAt: toDate(review.submitted_at),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function dispatch(
  db: Db,
  event: string,
  payload: Record<string, unknown>,
  deliveryId: string | null,
): Promise<{ handled: boolean; reposTouched: number }> {
  const repository = payload.repository as Record<string, unknown> | undefined;
  const owner =
    (repository?.owner as Record<string, unknown> | undefined)?.login;
  const repoName = repository?.name;
  if (typeof owner !== "string" || typeof repoName !== "string") {
    return { handled: false, reposTouched: 0 };
  }

  const targets = await findReposForEvent(db, owner, repoName);
  if (targets.length === 0) return { handled: false, reposTouched: 0 };

  let handledOne = false;
  for (const target of targets) {
    try {
      switch (event) {
        case "pull_request":
          await handlePullRequest(db, target, payload);
          handledOne = true;
          break;
        case "push":
          await handlePush(db, target, payload);
          handledOne = true;
          break;
        case "check_run":
          await handleCheckRun(db, target, payload);
          handledOne = true;
          break;
        case "release":
          await handleRelease(db, target, payload);
          handledOne = true;
          break;
        case "pull_request_review":
          await handlePullRequestReview(db, target, payload);
          handledOne = true;
          break;
        case "issues":
        case "issue_comment":
        case "workflow_run":
          // Tracked for live-event fanout but not cached locally yet.
          handledOne = true;
          break;
        default:
          break;
      }

      // logActivity publishes an "activity.logged" live event internally —
      // subscribers receive the same fanout without a double-emit.
      await logActivity(db, {
        companyId: target.companyId,
        actorType: "system",
        actorId: "github.webhook",
        action: `github.webhook.${event}`,
        entityType: "github_repo",
        entityId: target.id,
        details: {
          deliveryId,
          owner: target.owner,
          repo: target.repo,
          eventAction:
            typeof payload.action === "string" ? (payload.action as string) : null,
        },
      });
    } catch (err) {
      // Surface the error but do not abort the whole batch; another
      // repo target may still succeed.
      // eslint-disable-next-line no-console
      console.error("[github-webhook] handler failed", {
        event,
        repo: `${target.owner}/${target.repo}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { handled: handledOne, reposTouched: targets.length };
}

export function githubWebhooksRoutes(db: Db) {
  const router = Router();

  // Raw body for HMAC verification. We intentionally bypass the global
  // `express.json()` parser that the rest of /api uses.
  const rawJson = express.raw({ type: "application/json", limit: "5mb" });

  router.post(
    "/api/webhooks/github",
    rawJson,
    async (req: Request, res: Response<GithubWebhookIngestResult>) => {
      if (!isServerFeatureEnabled("github_webhooks")) {
        // Silently accept so GitHub doesn't mark the endpoint dead,
        // but record a reason in the response body.
        res.status(202).json({
          ok: true,
          event: "ping",
          deliveryId: null,
          handled: false,
          reason: "github_webhooks flag disabled",
        });
        return;
      }

      const secret = getWebhookSecret();
      if (!secret) {
        res.status(503).json({
          ok: true,
          event: "ping",
          deliveryId: null,
          handled: false,
          reason: "GITHUB_WEBHOOK_SECRET not configured",
        });
        return;
      }

      const signature = req.header("x-hub-signature-256") ?? undefined;
      const deliveryId = req.header("x-github-delivery") ?? null;
      const event = (req.header("x-github-event") ?? "").toLowerCase();

      const rawBody = Buffer.isBuffer(req.body)
        ? (req.body as Buffer).toString("utf8")
        : typeof req.body === "string"
          ? (req.body as string)
          : "";

      const ok = await timingSafeVerify(secret, rawBody, signature);
      if (!ok) {
        res.status(401).json({
          ok: true,
          event,
          deliveryId,
          handled: false,
          reason: "signature verification failed",
        });
        return;
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
      } catch {
        res.status(400).json({
          ok: true,
          event,
          deliveryId,
          handled: false,
          reason: "invalid JSON payload",
        });
        return;
      }

      if (event === "ping") {
        res.status(200).json({
          ok: true,
          event: "ping",
          deliveryId,
          handled: true,
        });
        return;
      }

      const outcome = await dispatch(db, event, payload, deliveryId);
      res.status(200).json({
        ok: true,
        event,
        deliveryId,
        handled: outcome.handled,
        reason: outcome.handled
          ? undefined
          : `no cached github_repos matched ${((payload.repository as Record<string, unknown> | undefined)?.full_name as string | undefined) ?? "unknown repo"}`,
      });
    },
  );

  return router;
}
