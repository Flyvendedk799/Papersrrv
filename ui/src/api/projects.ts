import type {
  LinkGithubSource,
  Project,
  ProjectArchiveEntry,
  ProjectWorkspace,
} from "@paperclipai/shared";
import { api } from "./client";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),

  /** Source (codebase) operations */
  linkGithubSource: (projectId: string, data: LinkGithubSource, companyId?: string) =>
    api.post<Project>(projectPath(projectId, companyId, "/source/github"), data),
  uploadArchive: (projectId: string, file: File, companyId?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<Project>(projectPath(projectId, companyId, "/source/archive"), fd);
  },
  unlinkSource: (projectId: string, companyId?: string) =>
    api.delete<Project>(projectPath(projectId, companyId, "/source")),
  listArchiveFiles: (projectId: string, prefix?: string, companyId?: string) => {
    const suffix = prefix ? `/source/files?prefix=${encodeURIComponent(prefix)}` : "/source/files";
    return api.get<ProjectArchiveEntry[]>(projectPath(projectId, companyId, suffix));
  },
  listPullRequests: (projectId: string, state: "open" | "closed" | "all" = "open", companyId?: string) =>
    api.get<unknown>(projectPath(projectId, companyId, `/source/pulls?state=${state}`)),
  getPullRequest: (projectId: string, number: number, companyId?: string) =>
    api.get<unknown>(projectPath(projectId, companyId, `/source/pulls/${number}`)),
};
