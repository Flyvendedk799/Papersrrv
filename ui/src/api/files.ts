import type { FileSnapshot, FileContent, FileTreeNode, FileWithHistory, IssueSummaryFile } from "@paperclipai/shared";
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

  content: (companyId: string, hash: string) =>
    api.get<FileContent>(`/companies/${companyId}/files/content/${encodeURIComponent(hash)}`),

  runFiles: (companyId: string, runId: string) =>
    api.get<FileSnapshot[]>(`/companies/${companyId}/runs/${runId}/files`),

  createSnapshot: (companyId: string, data: Record<string, unknown>) =>
    api.post<FileSnapshot>(`/companies/${companyId}/files/snapshots`, data),

  indexRun: (companyId: string, data: Record<string, unknown>) =>
    api.post<{ indexed: number }>(`/companies/${companyId}/files/index`, data),

  backfill: (companyId: string) =>
    api.post<{ runsProcessed: number; totalIndexed: number; failed: number; missingLogs: number }>(
      `/companies/${companyId}/files/backfill`,
      {},
    ),

  // Issue summary files
  issueSummaryFiles: (companyId: string, issueId: string) =>
    api.get<IssueSummaryFile[]>(`/companies/${companyId}/issues/${issueId}/summary-files`),

  addIssueSummaryFile: (companyId: string, issueId: string, snapshotId: string) =>
    api.post<IssueSummaryFile>(`/companies/${companyId}/issues/${issueId}/summary-files`, { snapshotId }),

  removeIssueSummaryFile: (companyId: string, issueId: string, summaryFileId: string) =>
    api.delete<void>(`/companies/${companyId}/issues/${issueId}/summary-files/${summaryFileId}`),

  /** Read a file directly from the filesystem (fallback for unindexed files). */
  rawContent: (companyId: string, filePath: string) =>
    api.get<{ content: string; isMarkdown: boolean; size: number; path: string }>(
      `/companies/${companyId}/files/raw?path=${encodeURIComponent(filePath)}`,
    ),

  /** Save file content (writes to disk). */
  saveContent: (companyId: string, filePath: string, content: string) =>
    api.put<{ path: string; size: number; isMarkdown: boolean; saved: boolean }>(
      `/companies/${companyId}/files/content`,
      { filePath, content },
    ),
};
