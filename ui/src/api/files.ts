import type { FileSnapshot, FileContent, FileTreeNode, FileWithHistory } from "@paperclipai/shared";
import { api } from "./client";

export const filesApi = {
  list: (companyId: string, filters?: { agentId?: string; runId?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.agentId) params.set("agentId", filters.agentId);
    if (filters?.runId) params.set("runId", filters.runId);
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString();
    return api.get<FileWithHistory[]>(`/companies/${companyId}/files${qs ? `?${qs}` : ""}`);
  },

  tree: (companyId: string, agentId?: string) => {
    const params = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
    return api.get<FileTreeNode[]>(`/companies/${companyId}/files/tree${params}`);
  },

  history: (companyId: string, filePath: string) =>
    api.get<FileSnapshot[]>(
      `/companies/${companyId}/files/history?path=${encodeURIComponent(filePath)}`,
    ),

  content: (hash: string) => api.get<FileContent>(`/files/content/${encodeURIComponent(hash)}`),

  runFiles: (companyId: string, runId: string) =>
    api.get<FileSnapshot[]>(`/companies/${companyId}/runs/${runId}/files`),

  createSnapshot: (companyId: string, data: Record<string, unknown>) =>
    api.post<FileSnapshot>(`/companies/${companyId}/files/snapshots`, data),

  indexRun: (companyId: string, data: Record<string, unknown>) =>
    api.post<{ indexed: number }>(`/companies/${companyId}/files/index`, data),

  backfill: (companyId: string) =>
    api.post<{ runsProcessed: number; totalIndexed: number; failed: number }>(
      `/companies/${companyId}/files/backfill`,
      {},
    ),
};
