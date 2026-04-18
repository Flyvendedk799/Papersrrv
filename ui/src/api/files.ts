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

  /**
   * Boared-rebrand: list workflow artifact files across the company.
   * Route is a server-side alias for the standard list with a
   * `source=workflow_run` filter applied.
   */
  listWorkflowArtifacts: (companyId: string, limit = 200) =>
    api.get<
      Array<{
        snapshotId: string;
        filePath: string;
        contentHash: string | null;
        runId: string | null;
        agentId: string | null;
        agentName: string | null;
        capturedAt: string;
      }>
    >(
      `/companies/${companyId}/files/workflow-artifacts?limit=${encodeURIComponent(limit)}`,
    ),

  /** Boared: list files judged relevant to an issue (evidence layer). */
  issueRelevant: (companyId: string, issueId: string, opts?: { limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return api.get<import("@paperclipai/shared").IssueRelevantFile[]>(
      `/companies/${companyId}/issues/${issueId}/files/relevant${qs ? `?${qs}` : ""}`,
    );
  },

  /**
   * Boared recovery stubs: indexing status, presence, and handoff
   * checklist endpoints used by the Files Overview/Reader shells. The
   * server implementations are still in flight; the client resolves to
   * safe empty shapes so the UI can render and wire interactions.
   */
  indexingStatus: (_companyId: string) =>
    Promise.resolve({
      pendingRuns: 0,
      indexedRuns: 0,
      totalCompletedRuns: 0,
      lastBackfillAt: null as string | null,
      autoBackfillEnabled: false,
    }),

  presence: (_companyId: string) =>
    Promise.resolve(
      [] as Array<{
        filePath: string;
        agents: string[];
        reason?: "lock" | "recent" | "both" | "touched";
        lockedBy?: string | null;
        lastCapturedAt?: string | null;
        since?: string | null;
      }>,
    ),

  listLocks: (
    _companyId: string,
    _opts?: { filePath?: string },
  ) =>
    Promise.resolve(
      [] as Array<{
        id: string;
        filePath: string;
        agentId: string;
        agentName?: string | null;
        acquiredAt: string;
        reason?: string | null;
        ttlMs?: number | null;
      }>,
    ),

  listConflicts: (_companyId: string, _opts?: { filePath?: string }) =>
    Promise.resolve(
      [] as Array<{
        id: string;
        filePath: string;
        agentA: string;
        agentB: string;
        detectedAt: string;
        severity?: "low" | "medium" | "high" | null;
        recentEditors: string[];
      }>,
    ),

  releaseLock: (
    _companyId: string,
    _agentIdOrLockId: string,
    _filePath?: string,
  ) => Promise.resolve({ released: true } as { released: boolean }),

  churn: (
    _companyId: string,
    _filePath: string,
    _windowDaysOrOpts?: number | { windowDays?: number },
  ) =>
    Promise.resolve(
      [] as Array<{
        date: string;
        count: number;
        agentCount?: number;
      }>,
    ),

  /** Evidence / comment-evidence / analytics stubs (Boared recovery). */
  listCommentEvidence: (_companyId: string, _issueId: string) =>
    Promise.resolve([] as import("@paperclipai/shared").CommentFileEvidence[]),

  addCommentEvidence: (
    _companyId: string,
    _issueId: string,
    _commentId: string,
    _input: { filePath: string; snapshotId?: string | null; contentHash?: string | null; excerpt?: string | null },
  ) =>
    Promise.resolve({
      id: "",
      companyId: "",
      issueId: "",
      commentId: "",
      filePath: "",
      contentHash: null,
      snapshotId: null,
      excerpt: null,
      createdAt: new Date().toISOString(),
    } as import("@paperclipai/shared").CommentFileEvidence),

  deleteCommentEvidence: (_companyId: string, _evidenceId: string) =>
    Promise.resolve({ deleted: true }),

  listEvidenceSets: (_companyId: string, _issueId: string) =>
    Promise.resolve([] as import("@paperclipai/shared").IssueEvidenceSet[]),

  getEvidenceSet: (_companyId: string, _setId: string) =>
    Promise.resolve(
      null as null | import("@paperclipai/shared").IssueEvidenceSetDetail,
    ),

  createEvidenceSet: (
    _companyId: string,
    _issueId: string,
    input: string | { name: string; description?: string | null },
  ) => {
    const name = typeof input === "string" ? input : input.name;
    const description = typeof input === "string" ? null : input.description ?? null;
    return Promise.resolve({
      id: "",
      companyId: "",
      issueId: "",
      name,
      description,
      createdByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      itemCount: 0,
    } as import("@paperclipai/shared").IssueEvidenceSet);
  },

  deleteEvidenceSet: (_companyId: string, _setId: string) =>
    Promise.resolve({ deleted: true }),

  addItemToSet: (
    _companyId: string,
    _setId: string,
    _input: { filePath: string; contentHash?: string | null; snapshotId?: string | null; note?: string | null },
  ) => Promise.resolve({ added: true }),

  removeItemFromSet: (_companyId: string, _setId: string, _itemId: string) =>
    Promise.resolve({ removed: true }),

  analytics: (_companyId: string, _opts?: { windowDays?: number }) =>
    Promise.resolve({
      totalFiles: 0,
      totalSnapshots: 0,
      totalEdits: 0,
      totalAgents: 0,
      latestActivity: null as string | null,
      content: {
        byExtension: [] as Array<{ extension: string; count: number }>,
        totalSizeBytes: 0,
      },
      topExtensions: [] as Array<{ extension: string; count: number }>,
      topAgents: [] as Array<{ agentId: string; name?: string | null; edits: number }>,
      busiestPaths: [] as Array<{ filePath: string; edits: number }>,
    }),

  getHandoffChecklist: (_companyId: string, _issueId: string) =>
    Promise.resolve(
      null as null | {
        issueId: string;
        items: import("@paperclipai/shared").HandoffChecklistItem[];
        enforcement: import("@paperclipai/shared").HandoffEnforcement;
        updatedAt: string;
      },
    ),

  updateHandoffChecklist: (
    _companyId: string,
    _issueId: string,
    _input: {
      enforcement?: import("@paperclipai/shared").HandoffEnforcement;
      items?: import("@paperclipai/shared").HandoffChecklistItem[];
    },
  ) =>
    Promise.resolve(
      null as null | {
        issueId: string;
        items: import("@paperclipai/shared").HandoffChecklistItem[];
        enforcement: import("@paperclipai/shared").HandoffEnforcement;
        updatedAt: string;
      },
    ),

  /** Boared overview stubs — safe empty defaults until server lands. */
  hot: (_companyId: string, _opts?: { windowDays?: number; limit?: number }) =>
    Promise.resolve([] as import("@paperclipai/shared").HotFile[]),

  reviewQueue: (_companyId: string) =>
    Promise.resolve([] as import("@paperclipai/shared").ReviewQueueItem[]),

  projectFileSummaries: (_companyId: string) =>
    Promise.resolve(
      [] as Array<{
        projectId: string;
        name?: string | null;
        color?: string | null;
        fileCount: number;
        recentEditCount: number;
        lastCapturedAt?: string | null;
      }>,
    ),

  search: (companyId: string, q: string, limit = 30) =>
    api.get<
      Array<{
        filePath: string;
        snapshotId: string;
        contentHash: string | null;
        capturedAt: string | null;
        agentId?: string | null;
        agentName?: string | null;
      }>
    >(
      `/companies/${companyId}/files/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
};
