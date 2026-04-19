import type {
  GithubCheckRunView,
  GithubConnection,
  GithubPullRequestDetailView,
  GithubPullRequestFileView,
  GithubPullRequestListResult,
  GithubRateLimitMeta,
  GithubRepoView,
  GithubReviewView,
} from "@paperclipai/shared";
import { api } from "./client";

export interface GithubRepoResponse {
  data: GithubRepoView;
  connectionId: string;
}

export interface GithubPullRequestListResponse extends GithubPullRequestListResult {
  connectionId: string;
}

export interface GithubPullRequestDetailResponse {
  data: GithubPullRequestDetailView;
  files: GithubPullRequestFileView[];
  reviews: GithubReviewView[];
  checks: GithubCheckRunView[];
  rateLimit?: GithubRateLimitMeta;
  connectionId: string;
}

export const githubApi = {
  listConnections: (companyId: string) =>
    api.get<GithubConnection[]>(`/companies/${companyId}/github/connections`),

  createConnection: (
    companyId: string,
    data: { token: string; accountLogin?: string; description?: string | null },
  ) => api.post<GithubConnection>(`/companies/${companyId}/github/connections`, data),

  deleteConnection: (companyId: string, id: string) =>
    api.delete<{ ok: true; removed: GithubConnection | null }>(
      `/companies/${companyId}/github/connections/${id}`,
    ),

  getRepo: (companyId: string, owner: string, repo: string, connectionId?: string) =>
    api.get<GithubRepoResponse>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${connectionId ? `?connectionId=${connectionId}` : ""}`,
    ),

  listPulls: (
    companyId: string,
    owner: string,
    repo: string,
    opts?: { state?: "open" | "closed" | "all"; connectionId?: string },
  ) => {
    const params = new URLSearchParams();
    if (opts?.state) params.set("state", opts.state);
    if (opts?.connectionId) params.set("connectionId", opts.connectionId);
    const qs = params.toString();
    return api.get<GithubPullRequestListResponse>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls${qs ? `?${qs}` : ""}`,
    );
  },

  getPullRequest: (
    companyId: string,
    owner: string,
    repo: string,
    number: number,
    connectionId?: string,
  ) =>
    api.get<GithubPullRequestDetailResponse>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}${connectionId ? `?connectionId=${connectionId}` : ""}`,
    ),

  createPullComment: (
    companyId: string,
    owner: string,
    repo: string,
    number: number,
    body: { body: string; connectionId?: string },
  ) =>
    api.post<{ id: number; htmlUrl: string }>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/comments`,
      body,
    ),

  createPullReview: (
    companyId: string,
    owner: string,
    repo: string,
    number: number,
    body: {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body?: string;
      connectionId?: string;
    },
  ) =>
    api.post<{ id: number; state: string }>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/reviews`,
      body,
    ),

  mergePullRequest: (
    companyId: string,
    owner: string,
    repo: string,
    number: number,
    body: {
      method?: "merge" | "squash" | "rebase";
      commitTitle?: string;
      commitMessage?: string;
      connectionId?: string;
    },
  ) =>
    api.post<{ merged: boolean; sha: string | null; message: string }>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/merge`,
      body,
    ),

  markPullReady: (
    companyId: string,
    owner: string,
    repo: string,
    number: number,
  ) =>
    api.post<{ draft: boolean }>(
      `/companies/${companyId}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/ready`,
      {},
    ),
};
