/**
 * GitHub client service (backlog 4.0 A2 — read-only subset).
 *
 * Foundation phase: wraps Octokit with structured errors + ETag-based
 * in-memory caching. Only exposes `getRepo` and `listPullRequests`.
 *
 * Defers:
 *   - Persistent cache (write-through to github_repos / github_pull_requests).
 *     TODO: persist successful reads to the cache tables; webhooks land later.
 *   - Mutations (comment/approve/merge) — backlog 4.0 B3 / C1-C5.
 *   - Webhook ingestion — backlog 4.0 A3.
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
      // 304 is surfaced as a RequestError by Octokit; serve cache.
      if (err instanceof RequestError && err.status === 304 && cached) {
        const refreshed: CacheEntry<T> = { ...cached, storedAt: Date.now() };
        setCache<T>(key, refreshed);
        return { data: cached.data, rateLimit: cached.rateLimit, etag: cached.etag };
      }
      throw translateError(err);
    }
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
          return arr.map((pr): GithubPullRequestView => {
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
          });
        },
      );
      return { items: data, rateLimit };
    },
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;
