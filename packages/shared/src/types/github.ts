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

// ── Extended views for dashboard / detail (backlog 4.0 A4 + B2/B3) ──

export interface GithubCommitView {
  sha: string;
  message: string;
  authorLogin: string | null;
  authorName: string | null;
  authoredAt: string | null;
  htmlUrl: string;
}

export interface GithubBranchView {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GithubReleaseView {
  id: number;
  tagName: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  createdAt: string | null;
  htmlUrl: string;
  body: string | null;
}

export type GithubCheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale"
  | null;

export type GithubCheckStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "pending"
  | null;

export interface GithubCheckRunView {
  id: number;
  name: string;
  status: GithubCheckStatus;
  conclusion: GithubCheckConclusion;
  htmlUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  headSha: string;
}

export interface GithubReviewView {
  id: number;
  reviewerLogin: string | null;
  state:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "DISMISSED"
    | "PENDING"
    | string;
  submittedAt: string | null;
  htmlUrl: string;
  body: string | null;
}

export interface GithubPullRequestFileView {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blobUrl: string | null;
}

export interface GithubPullRequestDetailView extends GithubPullRequestView {
  body: string | null;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  assignees: string[];
  requestedReviewers: string[];
  closedAt: string | null;
  mergedAt: string | null;
}

// ── Webhook event envelope (A3) ────────────────────────────────────
export type GithubWebhookEventType =
  | "pull_request"
  | "push"
  | "check_run"
  | "release"
  | "issues"
  | "issue_comment"
  | "workflow_run"
  | "ping";

export interface GithubWebhookIngestResult {
  ok: true;
  event: GithubWebhookEventType | string;
  deliveryId: string | null;
  handled: boolean;
  reason?: string;
}
