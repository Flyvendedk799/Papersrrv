import type {
  GithubConnection,
  GithubPullRequestListResult,
  GithubRepoView,
} from "@paperclipai/shared";
import { api } from "./client";

export interface GithubRepoResponse {
  data: GithubRepoView;
  connectionId: string;
}

export interface GithubPullRequestListResponse extends GithubPullRequestListResult {
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
};
