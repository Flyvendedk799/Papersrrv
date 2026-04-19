/**
 * GitHub client service (backlog 4.0 A2).
 *
 * Wraps Octokit with:
 *   - Structured error taxonomy (`GithubClientError`).
 *   - ETag-aware in-memory GET cache (Map + soft TTL).
 *   - Retry with exponential backoff for 5xx + network errors.
 *   - Rate-limit metadata surfaced to callers.
 *   - Per-company client factory (cacheKey scopes the ETag cache so a
 *     revoked token can't hit another connection's cached data).
 *
 * Read surface: getRepo, listPullRequests, getPullRequest,
 * listPullRequestFiles, listCommits, listBranches, listReleases,
 * listCheckRuns, listReviews.
 *
 * Mutation surface (B3 / pr_actions flag): createPullComment,
 * createPullReview, mergePullRequest, markPullReady.
 *
 * Webhook ingestion is handled in github-webhooks.ts (A3).
 */

import { Octokit } from "octokit";
import { RequestError } from "@octokit/request-error";
import type {
  GithubApiError,
  GithubPullRequestListResult,
  GithubPullRequestView,
  GithubRateLimitMeta,
  GithubRepoView,
} from "@paperclipai/shared";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  const expo = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  // Add small jitter to avoid thundering-herd.
  return expo + Math.floor(Math.random() * 100);
}

export interface GithubClientOptions {
  /**
   * Personal access token. Required for PAT-based connections; future
   * GitHub App flow will inject an installation token instead.
   */
  token: string;
  /**
   * Stable cache key per (company, connection). Used to scope ETag
   * cache entries so a revoked token can't hit another connection's
   * cached data.
   */
  cacheKey: string;
  /**
   * Optional override for the API base URL (GitHub Enterprise support).
   */
  baseUrl?: string;
  userAgent?: string;
}

interface CacheEntry<T> {
  etag: string;
  data: T;
  rateLimit?: GithubRateLimitMeta;
  storedAt: number;
}

// Module-scoped cache. Keyed by `${cacheKey}::${route}`.
// Soft TTL is applied when serving a cached entry for the first time
// we hit a 304; we do not invalidate entries on TTL because GitHub's
// ETag is the source of truth.
const ETAG_CACHE = new Map<string, CacheEntry<unknown>>();

const CACHE_SOFT_TTL_MS = 15 * 60 * 1000; // 15 min safety net

function cacheKeyFor(scope: string, route: string) {
  return `${scope}::${route}`;
}

function getCache<T>(key: string): CacheEntry<T> | null {
  const entry = ETAG_CACHE.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_SOFT_TTL_MS) {
    ETAG_CACHE.delete(key);
    return null;
  }
  return entry;
}

function setCache<T>(key: string, entry: CacheEntry<T>) {
  ETAG_CACHE.set(key, entry);
}

export function clearGithubCache(cacheKeyPrefix?: string) {
  if (!cacheKeyPrefix) {
    ETAG_CACHE.clear();
    return;
  }
  for (const key of ETAG_CACHE.keys()) {
    if (key.startsWith(`${cacheKeyPrefix}::`)) ETAG_CACHE.delete(key);
  }
}

function extractRateLimit(headers: Record<string, unknown> | undefined): GithubRateLimitMeta | undefined {
  if (!headers) return undefined;
  const get = (k: string): string | undefined => {
    const v = (headers as Record<string, unknown>)[k];
    return typeof v === "string" ? v : undefined;
  };
  const limit = get("x-ratelimit-limit");
  const remaining = get("x-ratelimit-remaining");
  const reset = get("x-ratelimit-reset");
  if (limit == null && remaining == null && reset == null) return undefined;
  const resetMs = reset ? Number(reset) * 1000 : null;
  return {
    limit: limit != null ? Number(limit) : null,
    remaining: remaining != null ? Number(remaining) : null,
    resetAt: resetMs != null && Number.isFinite(resetMs) ? new Date(resetMs).toISOString() : null,
  };
}

function mapStatusToCode(status: number): GithubApiError["code"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422) return "unprocessable";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "validation_error";
}

export class GithubClientError extends Error implements GithubApiError {
  status: number;
  code: GithubApiError["code"];
  rateLimit?: GithubRateLimitMeta;
  details?: unknown;

  constructor(init: GithubApiError) {
    super(init.message);
    this.name = "GithubClientError";
    this.status = init.status;
    this.code = init.code;
    this.rateLimit = init.rateLimit;
    this.details = init.details;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof RequestError) {
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status <= 599) return true;
    // Secondary rate limits from GitHub manifest as 403 with a
    // non-zero remaining count; retrying immediately is unsafe,
    // but backoff is the accepted pattern. We only retry 403 when
    // it's a documented abuse limit signal.
    return false;
  }
  if (err instanceof Error && /fetch|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(err.message)) {
    return true;
  }
  return false;
}

function translateError(err: unknown): GithubClientError {
  if (err instanceof RequestError) {
    const rateLimit = extractRateLimit(err.response?.headers as Record<string, unknown> | undefined);
    const isRateLimit =
      err.status === 403 && rateLimit?.remaining === 0
        ? true
        : err.status === 429;
    return new GithubClientError({
      status: err.status,
      code: isRateLimit ? "rate_limited" : mapStatusToCode(err.status),
      message:
        isRateLimit
          ? "GitHub API rate limit exceeded"
          : err.message || `GitHub request failed (${err.status})`,
      rateLimit,
      details: { response: err.response?.data, documentationUrl: err.response?.url },
    });
  }
  if (err instanceof Error && /fetch|ECONN|ENOTFOUND|ETIMEDOUT/i.test(err.message)) {
    return new GithubClientError({
      status: 0,
      code: "network_error",
      message: err.message,
    });
  }
  return new GithubClientError({
    status: 0,
    code: "server_error",
    message: err instanceof Error ? err.message : "GitHub client error",
  });
}

export function createGithubClient(opts: GithubClientOptions) {
  const octokit = new Octokit({
    auth: opts.token,
    baseUrl: opts.baseUrl,
    userAgent: opts.userAgent ?? "paperclip-github-tab/0.1",
  });

  async function requestWithEtag<T>(
    route: string,
    params: Record<string, unknown>,
    map: (data: unknown) => T,
  ): Promise<{ data: T; rateLimit?: GithubRateLimitMeta; etag: string | null }> {
    const key = cacheKeyFor(opts.cacheKey, `${route}?${JSON.stringify(params)}`);
    const cached = getCache<T>(key);
    const headers: Record<string, string> = {};
    if (cached?.etag) headers["If-None-Match"] = cached.etag;

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const res = await octokit.request(route, { ...params, headers });
        const rateLimit = extractRateLimit(res.headers as Record<string, unknown>);
        const etag = (res.headers as Record<string, unknown>).etag as string | undefined;
        const data = map(res.data);
        if (etag) {
          setCache<T>(key, { etag, data, rateLimit, storedAt: Date.now() });
        }
        return { data, rateLimit, etag: etag ?? null };
      } catch (err) {
        // 304 is surfaced as a RequestError; serve cache.
        if (err instanceof RequestError && err.status === 304 && cached) {
          const refreshed: CacheEntry<T> = { ...cached, storedAt: Date.now() };
          setCache<T>(key, refreshed);
          return { data: cached.data, rateLimit: cached.rateLimit, etag: cached.etag };
        }
        lastError = err;
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw translateError(err);
      }
    }
    throw translateError(lastError);
  }

  async function requestMutation<T>(
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    route: string,
    params: Record<string, unknown>,
    map: (data: unknown) => T,
  ): Promise<{ data: T; rateLimit?: GithubRateLimitMeta }> {
    // Mutations bypass the ETag cache. They still respect retry/backoff
    // but only for retryable classes (5xx / network). Mutation retries
    // are risky, so we cap at 1 retry to keep side effects bounded.
    let lastError: unknown;
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      try {
        const res = await octokit.request(`${method} ${route}`, params);
        const rateLimit = extractRateLimit(res.headers as Record<string, unknown>);
        return { data: map(res.data), rateLimit };
      } catch (err) {
        lastError = err;
        if (attempt === 0 && isRetryable(err)) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw translateError(err);
      }
    }
    throw translateError(lastError);
  }

  function mapPullRequest(pr: Record<string, unknown>): GithubPullRequestView {
    const user = pr.user as Record<string, unknown> | null | undefined;
    const head = pr.head as Record<string, unknown> | null | undefined;
    const base = pr.base as Record<string, unknown> | null | undefined;
    const prState = pr.state === "closed" ? "closed" : "open";
    return {
      number: Number(pr.number),
      title: String(pr.title ?? ""),
      state: prState,
      draft: Boolean(pr.draft),
      merged: Boolean(pr.merged_at),
      mergeable: typeof pr.mergeable === "boolean" ? (pr.mergeable as boolean) : null,
      authorLogin: user ? (user.login as string | null) ?? null : null,
      headRef: head ? (head.ref as string | null) ?? null : null,
      baseRef: base ? (base.ref as string | null) ?? null : null,
      htmlUrl: (pr.html_url as string) ?? "",
      createdAt: (pr.created_at as string | null) ?? null,
      updatedAt: (pr.updated_at as string | null) ?? null,
    };
  }

  return {
    async getRepo(owner: string, repo: string): Promise<GithubRepoView> {
      const { data, rateLimit } = await requestWithEtag<GithubRepoView>(
        "GET /repos/{owner}/{repo}",
        { owner, repo },
        (raw) => {
          const r = raw as Record<string, unknown>;
          return {
            owner,
            repo,
            defaultBranch: (r.default_branch as string | null) ?? null,
            description: (r.description as string | null) ?? null,
            private: Boolean(r.private),
            archived: Boolean(r.archived),
            disabled: Boolean(r.disabled),
            htmlUrl: (r.html_url as string) ?? `https://github.com/${owner}/${repo}`,
            pushedAt: (r.pushed_at as string | null) ?? null,
            updatedAt: (r.updated_at as string | null) ?? null,
          };
        },
      );
      return { ...data, rateLimit };
    },

    async listPullRequests(
      owner: string,
      repo: string,
      options?: { state?: "open" | "closed" | "all"; perPage?: number },
    ): Promise<GithubPullRequestListResult> {
      const state = options?.state ?? "open";
      const perPage = Math.min(Math.max(options?.perPage ?? 30, 1), 100);
      const { data, rateLimit } = await requestWithEtag<GithubPullRequestView[]>(
        "GET /repos/{owner}/{repo}/pulls",
        { owner, repo, state, per_page: perPage, sort: "updated", direction: "desc" },
        (raw) => {
          const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          return arr.map(mapPullRequest);
        },
      );
      return { items: data, rateLimit };
    },

    async getPullRequest(
      owner: string,
      repo: string,
      number: number,
    ): Promise<{ data: import("@paperclipai/shared").GithubPullRequestDetailView; rateLimit?: GithubRateLimitMeta }> {
      return requestWithEtag<import("@paperclipai/shared").GithubPullRequestDetailView>(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        { owner, repo, pull_number: number },
        (raw) => {
          const pr = (raw as Record<string, unknown>) ?? {};
          const base = mapPullRequest(pr);
          const labelArr = Array.isArray(pr.labels)
            ? (pr.labels as Record<string, unknown>[])
            : [];
          const assignees = Array.isArray(pr.assignees)
            ? (pr.assignees as Record<string, unknown>[])
                .map((a) => (a.login as string | null) ?? null)
                .filter((x): x is string => !!x)
            : [];
          const requestedReviewers = Array.isArray(pr.requested_reviewers)
            ? (pr.requested_reviewers as Record<string, unknown>[])
                .map((a) => (a.login as string | null) ?? null)
                .filter((x): x is string => !!x)
            : [];
          return {
            ...base,
            body: (pr.body as string | null) ?? null,
            commits: Number(pr.commits ?? 0),
            additions: Number(pr.additions ?? 0),
            deletions: Number(pr.deletions ?? 0),
            changedFiles: Number(pr.changed_files ?? 0),
            labels: labelArr
              .map((l) => (l.name as string | null) ?? null)
              .filter((x): x is string => !!x),
            assignees,
            requestedReviewers,
            closedAt: (pr.closed_at as string | null) ?? null,
            mergedAt: (pr.merged_at as string | null) ?? null,
          };
        },
      ).then((r) => ({ data: r.data, rateLimit: r.rateLimit }));
    },

    async listPullRequestFiles(
      owner: string,
      repo: string,
      number: number,
      perPage = 100,
    ): Promise<{ items: import("@paperclipai/shared").GithubPullRequestFileView[]; rateLimit?: GithubRateLimitMeta }> {
      const { data, rateLimit } = await requestWithEtag<import("@paperclipai/shared").GithubPullRequestFileView[]>(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
        { owner, repo, pull_number: number, per_page: perPage },
        (raw) => {
          const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          return arr.map((f) => ({
            filename: String(f.filename ?? ""),
            status: String(f.status ?? ""),
            additions: Number(f.additions ?? 0),
            deletions: Number(f.deletions ?? 0),
            changes: Number(f.changes ?? 0),
            blobUrl: (f.blob_url as string | null) ?? null,
          }));
        },
      );
      return { items: data, rateLimit };
    },

    async listCommits(
      owner: string,
      repo: string,
      options?: { sha?: string; perPage?: number },
    ): Promise<{ items: import("@paperclipai/shared").GithubCommitView[]; rateLimit?: GithubRateLimitMeta }> {
      const perPage = Math.min(Math.max(options?.perPage ?? 20, 1), 100);
      const params: Record<string, unknown> = { owner, repo, per_page: perPage };
      if (options?.sha) params.sha = options.sha;
      const { data, rateLimit } = await requestWithEtag<import("@paperclipai/shared").GithubCommitView[]>(
        "GET /repos/{owner}/{repo}/commits",
        params,
        (raw) => {
          const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          return arr.map((c) => {
            const commit = (c.commit as Record<string, unknown>) ?? {};
            const author = (commit.author as Record<string, unknown>) ?? {};
            const userAuthor = c.author as Record<string, unknown> | null | undefined;
            return {
              sha: String(c.sha ?? ""),
              message: String(commit.message ?? ""),
              authorLogin: userAuthor ? (userAuthor.login as string | null) ?? null : null,
              authorName: (author.name as string | null) ?? null,
              authoredAt: (author.date as string | null) ?? null,
              htmlUrl: (c.html_url as string) ?? "",
            };
          });
        },
      );
      return { items: data, rateLimit };
    },

    async listBranches(
      owner: string,
      repo: string,
      perPage = 50,
    ): Promise<{ items: import("@paperclipai/shared").GithubBranchView[]; rateLimit?: GithubRateLimitMeta }> {
      const { data, rateLimit } = await requestWithEtag<import("@paperclipai/shared").GithubBranchView[]>(
        "GET /repos/{owner}/{repo}/branches",
        { owner, repo, per_page: perPage },
        (raw) => {
          const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          return arr.map((b) => {
            const commit = (b.commit as Record<string, unknown>) ?? {};
            return {
              name: String(b.name ?? ""),
              sha: String(commit.sha ?? ""),
              protected: Boolean(b.protected),
            };
          });
        },
      );
      return { items: data, rateLimit };
    },

    async listReleases(
      owner: string,
      repo: string,
      perPage = 20,
    ): Promise<{ items: import("@paperclipai/shared").GithubReleaseView[]; rateLimit?: GithubRateLimitMeta }> {
      const { data, rateLimit } = await requestWithEtag<import("@paperclipai/shared").GithubReleaseView[]>(
        "GET /repos/{owner}/{repo}/releases",
        { owner, repo, per_page: perPage },
        (raw) => {
          const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          return arr.map((r) => ({
            id: Number(r.id),
            tagName: String(r.tag_name ?? ""),
            name: (r.name as string | null) ?? null,
            draft: Boolean(r.draft),
            prerelease: Boolean(r.prerelease),
            publishedAt: (r.published_at as string | null) ?? null,
            createdAt: (r.created_at as string | null) ?? null,
            htmlUrl: (r.html_url as string) ?? "",
            body: (r.body as string | null) ?? null,
          }));
        },
      );
      return { items: data, rateLimit };
    },

    async listCheckRuns(
      owner: string,
      repo: string,
      ref: string,
    ): Promise<{ items: import("@paperclipai/shared").GithubCheckRunView[]; rateLimit?: GithubRateLimitMeta }> {
      const { data, rateLimit } = await requestWithEtag<import("@paperclipai/shared").GithubCheckRunView[]>(
        "GET /repos/{owner}/{repo}/commits/{ref}/check-runs",
        { owner, repo, ref, per_page: 50 },
        (raw) => {
          const body = (raw as Record<string, unknown>) ?? {};
          const arr = Array.isArray(body.check_runs)
            ? (body.check_runs as Record<string, unknown>[])
            : [];
          return arr.map((c) => ({
            id: Number(c.id),
            name: String(c.name ?? ""),
            status: ((c.status as string | null) ?? null) as import("@paperclipai/shared").GithubCheckStatus,
            conclusion: ((c.conclusion as string | null) ?? null) as import("@paperclipai/shared").GithubCheckConclusion,
            htmlUrl: (c.html_url as string | null) ?? null,
            startedAt: (c.started_at as string | null) ?? null,
            completedAt: (c.completed_at as string | null) ?? null,
            headSha: String(c.head_sha ?? ref),
          }));
        },
      );
      return { items: data, rateLimit };
    },

    async listReviews(
      owner: string,
      repo: string,
      number: number,
    ): Promise<{ items: import("@paperclipai/shared").GithubReviewView[]; rateLimit?: GithubRateLimitMeta }> {
      const { data, rateLimit } = await requestWithEtag<import("@paperclipai/shared").GithubReviewView[]>(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        { owner, repo, pull_number: number, per_page: 50 },
        (raw) => {
          const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          return arr.map((r) => {
            const user = r.user as Record<string, unknown> | null | undefined;
            return {
              id: Number(r.id),
              reviewerLogin: user ? (user.login as string | null) ?? null : null,
              state: String(r.state ?? ""),
              submittedAt: (r.submitted_at as string | null) ?? null,
              htmlUrl: (r.html_url as string) ?? "",
              body: (r.body as string | null) ?? null,
            };
          });
        },
      );
      return { items: data, rateLimit };
    },

    // ── Mutations (gated behind pr_actions flag at route level) ──

    async createPullComment(
      owner: string,
      repo: string,
      issueNumber: number,
      body: string,
    ): Promise<{ id: number; htmlUrl: string }> {
      const { data } = await requestMutation(
        "POST",
        "/repos/{owner}/{repo}/issues/{issue_number}/comments",
        { owner, repo, issue_number: issueNumber, body },
        (raw) => {
          const r = (raw as Record<string, unknown>) ?? {};
          return { id: Number(r.id), htmlUrl: (r.html_url as string) ?? "" };
        },
      );
      return data;
    },

    async createPullReview(
      owner: string,
      repo: string,
      number: number,
      review: { event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; body?: string },
    ): Promise<{ id: number; state: string }> {
      const { data } = await requestMutation(
        "POST",
        "/repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        {
          owner,
          repo,
          pull_number: number,
          event: review.event,
          body: review.body,
        },
        (raw) => {
          const r = (raw as Record<string, unknown>) ?? {};
          return { id: Number(r.id), state: String(r.state ?? "") };
        },
      );
      return data;
    },

    async mergePullRequest(
      owner: string,
      repo: string,
      number: number,
      opts?: { method?: "merge" | "squash" | "rebase"; commitTitle?: string; commitMessage?: string },
    ): Promise<{ merged: boolean; sha: string | null; message: string }> {
      const { data } = await requestMutation(
        "PUT",
        "/repos/{owner}/{repo}/pulls/{pull_number}/merge",
        {
          owner,
          repo,
          pull_number: number,
          merge_method: opts?.method ?? "merge",
          commit_title: opts?.commitTitle,
          commit_message: opts?.commitMessage,
        },
        (raw) => {
          const r = (raw as Record<string, unknown>) ?? {};
          return {
            merged: Boolean(r.merged),
            sha: (r.sha as string | null) ?? null,
            message: String(r.message ?? ""),
          };
        },
      );
      return data;
    },

    async markPullReady(
      owner: string,
      repo: string,
      number: number,
    ): Promise<{ draft: boolean }> {
      // Marking a PR ready for review requires the GraphQL mutation
      // `markPullRequestReadyForReview`. We use octokit.graphql via
      // a light wrapper here rather than adding a GraphQL dep surface.
      // Retries are bypassed for graphql mutations — the caller can
      // re-invoke on transient failures.
      try {
        // Fetch node id first (REST) then run graphql mutation.
        const { data: pr } = await requestWithEtag<{ nodeId: string }>(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}",
          { owner, repo, pull_number: number },
          (raw) => {
            const r = (raw as Record<string, unknown>) ?? {};
            return { nodeId: String(r.node_id ?? "") };
          },
        );
        if (!pr.nodeId) {
          throw new GithubClientError({
            status: 422,
            code: "unprocessable",
            message: "PR node id not found",
          });
        }
        await octokit.graphql(
          `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
          { id: pr.nodeId },
        );
        return { draft: false };
      } catch (err) {
        throw translateError(err);
      }
    },
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;
