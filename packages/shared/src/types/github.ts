/**
 * GitHub Tab (backlog 4.0) — shared types.
 *
 * Foundational slice: connections (PAT-first) + minimal repo/PR cache.
 * Webhooks, reviews, checks, commits, branches, releases deferred.
 */

export type GithubConnectionAuthType = "pat" | "github_app";

export interface GithubConnection {
  id: string;
  companyId: string;
  authType: GithubConnectionAuthType;
  secretId: string | null;
  accountLogin: string | null;
  scopesHint: string | null;
  metadata: Record<string, unknown> | null;
  lastVerifiedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface GithubRepoCache {
  id: string;
  companyId: string;
  connectionId: string;
  owner: string;
  repo: string;
  defaultBranch: string | null;
  visibility: string | null;
  permissions: Record<string, unknown> | null;
  etag: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type GithubPullRequestState = "open" | "closed";

export interface GithubPullRequestCache {
  id: string;
  companyId: string;
  connectionId: string;
  repoId: string;
  githubPrId: number;
  number: number;
  title: string;
  state: GithubPullRequestState;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  authorLogin: string | null;
  headRef: string | null;
  baseRef: string | null;
  url: string | null;
  body: string | null;
  labelsJson: Record<string, unknown>[] | null;
  githubUpdatedAt: string | null;
  githubCreatedAt: string | null;
  etag: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rate-limit meta returned alongside live GitHub reads.
 * Mirrors GitHub's x-ratelimit-* headers.
 */
export interface GithubRateLimitMeta {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}

/**
 * Structured error returned by the client service for UI mapping.
 */
export interface GithubApiError {
  status: number;
  code:
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "unprocessable"
    | "rate_limited"
    | "server_error"
    | "network_error"
    | "validation_error";
  message: string;
  rateLimit?: GithubRateLimitMeta;
  details?: unknown;
}

export interface GithubRepoView {
  owner: string;
  repo: string;
  defaultBranch: string | null;
  description: string | null;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  htmlUrl: string;
  pushedAt: string | null;
  updatedAt: string | null;
  rateLimit?: GithubRateLimitMeta;
}

export interface GithubPullRequestView {
  number: number;
  title: string;
  state: GithubPullRequestState;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  authorLogin: string | null;
  headRef: string | null;
  baseRef: string | null;
  htmlUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GithubPullRequestListResult {
  items: GithubPullRequestView[];
  rateLimit?: GithubRateLimitMeta;
}
