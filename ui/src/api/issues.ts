import type {
  Approval,
  BulkIssueUpdate,
  CreateIssueLink,
  CreateIssueTemplate,
  CreateSavedView,
  Issue,
  IssueAttachment,
  IssueComment,
  IssueLabel,
  IssueLinkApi,
  IssueSavedView,
  IssueTemplate,
  IssueWatcher,
  ReorderIssue,
  UpdateSavedView,
} from "@paperclipai/shared";
import { api } from "./client";

/* Mirror of server SynthesisPayload — kept narrow so the UI never
 * needs to import from the server package. */
export interface CaseSynthesisArtifact {
  kind: "files" | "pr" | "run-output" | "sub-issue" | "approval";
  label: string;
  detail?: string;
  link?: string;
  meta?: Record<string, unknown>;
}

export interface CaseSynthesisGraphNode {
  id: string;
  kind:
    | "issue"
    | "run"
    | "comment"
    | "approval"
    | "sub-issue"
    | "ancestor"
    | "delegation";
  label: string;
  sublabel?: string;
  ts?: number;
  status?: string;
  authorName?: string;
  lane?: string;
}

export interface CaseSynthesisGraphEdge {
  source: string;
  target: string;
  kind: "spawned" | "replied-to" | "produced" | "approved" | "parent" | "resolved-into";
}

export interface CaseSynthesisPayload {
  abstract: string;
  artifacts: CaseSynthesisArtifact[];
  graph: {
    nodes: CaseSynthesisGraphNode[];
    edges: CaseSynthesisGraphEdge[];
  };
  generator: "template" | "llm";
  schemaVersion: number;
  generatedAt: string;
}

export const issuesApi = {
  list: (
    companyId: string,
    filters?: {
      status?: string;
      priority?: string;
      projectId?: string;
      assigneeAgentId?: string;
      assigneeUserId?: string;
      touchedByUserId?: string;
      unreadForUserId?: string;
      labelId?: string;
      q?: string;
      includeArchived?: boolean;
      overdueOnly?: boolean;
      dueWithinDays?: number;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.priority) params.set("priority", filters.priority);
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.assigneeAgentId) params.set("assigneeAgentId", filters.assigneeAgentId);
    if (filters?.assigneeUserId) params.set("assigneeUserId", filters.assigneeUserId);
    if (filters?.touchedByUserId) params.set("touchedByUserId", filters.touchedByUserId);
    if (filters?.unreadForUserId) params.set("unreadForUserId", filters.unreadForUserId);
    if (filters?.labelId) params.set("labelId", filters.labelId);
    if (filters?.q) params.set("q", filters.q);
    if (filters?.includeArchived) params.set("includeArchived", "1");
    if (filters?.overdueOnly) params.set("overdueOnly", "1");
    if (filters?.dueWithinDays !== undefined) {
      params.set("dueWithinDays", String(filters.dueWithinDays));
    }
    const qs = params.toString();
    return api.get<Issue[]>(`/companies/${companyId}/issues${qs ? `?${qs}` : ""}`);
  },
  listLabels: (companyId: string) => api.get<IssueLabel[]>(`/companies/${companyId}/labels`),
  createLabel: (companyId: string, data: { name: string; color: string }) =>
    api.post<IssueLabel>(`/companies/${companyId}/labels`, data),
  deleteLabel: (id: string) => api.delete<IssueLabel>(`/labels/${id}`),
  get: (id: string) => api.get<Issue>(`/issues/${id}`),
  synthesis: (id: string, opts?: { force?: boolean }) =>
    api.get<CaseSynthesisPayload>(
      `/issues/${id}/synthesis${opts?.force ? "?force=1" : ""}`,
    ),
  markRead: (id: string) => api.post<{ id: string; lastReadAt: Date }>(`/issues/${id}/read`, {}),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Issue>(`/companies/${companyId}/issues`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Issue>(`/issues/${id}`, data),
  remove: (id: string) => api.delete<Issue>(`/issues/${id}`),
  checkout: (id: string, agentId: string) =>
    api.post<Issue>(`/issues/${id}/checkout`, {
      agentId,
      expectedStatuses: ["todo", "backlog", "blocked"],
    }),
  release: (id: string) => api.post<Issue>(`/issues/${id}/release`, {}),
  listComments: (id: string) => api.get<IssueComment[]>(`/issues/${id}/comments`),
  addComment: (id: string, body: string, reopen?: boolean, interrupt?: boolean) =>
    api.post<IssueComment>(
      `/issues/${id}/comments`,
      {
        body,
        ...(reopen === undefined ? {} : { reopen }),
        ...(interrupt === undefined ? {} : { interrupt }),
      },
    ),
  listAttachments: (id: string) => api.get<IssueAttachment[]>(`/issues/${id}/attachments`),
  uploadAttachment: (
    companyId: string,
    issueId: string,
    file: File,
    issueCommentId?: string | null,
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (issueCommentId) {
      form.append("issueCommentId", issueCommentId);
    }
    return api.postForm<IssueAttachment>(`/companies/${companyId}/issues/${issueId}/attachments`, form);
  },
  deleteAttachment: (id: string) => api.delete<{ ok: true }>(`/attachments/${id}`),
  /** Planning-issue foundation (migration 0041). Transfers a completed
   * planning-kind issue into a backlog plan. Idempotent — a second
   * call returns the existing plan. */
  transferToBacklog: (
    id: string,
    body: {
      title?: string;
      planKind?: "sprint" | "milestone" | "roadmap" | "custom";
      seedItems?: boolean;
      planOutput?: unknown;
    } = {},
  ) =>
    api.post<{
      plan: { id: string; title: string; sourceIssueId: string | null };
      alreadyExisted: boolean;
    }>(`/issues/${id}/transfer-to-backlog`, body),
  listApprovals: (id: string) => api.get<Approval[]>(`/issues/${id}/approvals`),
  linkApproval: (id: string, approvalId: string) =>
    api.post<Approval[]>(`/issues/${id}/approvals`, { approvalId }),
  unlinkApproval: (id: string, approvalId: string) =>
    api.delete<{ ok: true }>(`/issues/${id}/approvals/${approvalId}`),

  /* ─── Issue depth (migration 0045) ─── */

  // F3 — bulk update
  bulkUpdate: (companyId: string, body: BulkIssueUpdate) =>
    api.post<{ updated: number; skipped: string[] }>(
      `/companies/${companyId}/issues/bulk`,
      body,
    ),

  // F9 — reorder within/across status columns
  reorder: (id: string, body: ReorderIssue) =>
    api.post<Issue>(`/issues/${id}/reorder`, body),

  // F6 — links
  listLinks: (id: string) => api.get<IssueLinkApi[]>(`/issues/${id}/links`),
  addLink: (id: string, body: CreateIssueLink) =>
    api.post<IssueLinkApi[]>(`/issues/${id}/links`, body),
  removeLink: (id: string, linkId: string) =>
    api.delete<void>(`/issues/${id}/links/${linkId}`),

  // F7 — watchers
  listWatchers: (id: string) => api.get<IssueWatcher[]>(`/issues/${id}/watchers`),
  addWatcher: (id: string, body: { userId?: string | null; agentId?: string | null }) =>
    api.post<IssueWatcher[]>(`/issues/${id}/watchers`, body),
  removeWatcher: (id: string, body: { userId?: string | null; agentId?: string | null }) =>
    api.delete<IssueWatcher[]>(`/issues/${id}/watchers`),

  // F4 — saved views
  listViews: (companyId: string) =>
    api.get<IssueSavedView[]>(`/companies/${companyId}/issue-views`),
  createView: (companyId: string, body: CreateSavedView) =>
    api.post<IssueSavedView>(`/companies/${companyId}/issue-views`, body),
  updateView: (companyId: string, id: string, body: UpdateSavedView) =>
    api.patch<IssueSavedView>(`/companies/${companyId}/issue-views/${id}`, body),
  deleteView: (companyId: string, id: string) =>
    api.delete<void>(`/companies/${companyId}/issue-views/${id}`),

  // F5 — templates
  listTemplates: (companyId: string) =>
    api.get<IssueTemplate[]>(`/companies/${companyId}/issue-templates`),
  createTemplate: (companyId: string, body: CreateIssueTemplate) =>
    api.post<IssueTemplate>(`/companies/${companyId}/issue-templates`, body),
  deleteTemplate: (companyId: string, id: string) =>
    api.delete<void>(`/companies/${companyId}/issue-templates/${id}`),
  instantiateTemplate: (
    companyId: string,
    body: {
      templateId: string;
      values?: Record<string, string>;
      overrides?: Record<string, unknown>;
    },
  ) =>
    api.post<Issue>(`/companies/${companyId}/issue-templates/instantiate`, body),
};
