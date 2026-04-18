import type {
  BacklogItem,
  BacklogItemComment,
  BacklogItemFilters,
  BacklogOverview,
  BacklogPlan,
  BulkBacklogItemInput,
  BulkBacklogItemResult,
  BulkPromoteBacklogItemInput,
  BulkPromoteBacklogItemResult,
  CreateBacklogItemCommentInput,
  CreateBacklogItemInput,
  CreateBacklogPlanInput,
  PromoteBacklogItemInput,
  PromoteBacklogItemResult,
  ReorderBacklogItemInput,
  UpdateBacklogItemCommentInput,
  UpdateBacklogItemInput,
  UpdateBacklogPlanInput,
} from "@paperclipai/shared";
import { api } from "./client";

function buildItemQuery(filters?: BacklogItemFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.goalId) params.set("goalId", filters.goalId);
  if (filters.planId === null) params.set("planId", "none");
  else if (filters.planId) params.set("planId", filters.planId);
  if (filters.q) params.set("q", filters.q);
  if (filters.includeArchived) params.set("includeArchived", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const backlogApi = {
  listItems: (companyId: string, filters?: BacklogItemFilters) =>
    api.get<BacklogItem[]>(`/companies/${companyId}/backlog/items${buildItemQuery(filters)}`),
  findBySource: (
    companyId: string,
    params: { source?: string; sourceRefId?: string; sourceRefType?: string; includeArchived?: boolean },
  ) => {
    const qs = new URLSearchParams();
    if (params.source) qs.set("source", params.source);
    if (params.sourceRefId) qs.set("sourceRefId", params.sourceRefId);
    if (params.sourceRefType) qs.set("sourceRefType", params.sourceRefType);
    if (params.includeArchived) qs.set("includeArchived", "1");
    return api.get<BacklogItem[]>(
      `/companies/${companyId}/backlog/items/by-source?${qs.toString()}`,
    );
  },
  getItem: (companyId: string, id: string) =>
    api.get<BacklogItem>(`/companies/${companyId}/backlog/items/${id}`),
  createItem: (companyId: string, input: CreateBacklogItemInput) =>
    api.post<BacklogItem>(`/companies/${companyId}/backlog/items`, input),
  updateItem: (companyId: string, id: string, input: UpdateBacklogItemInput) =>
    api.patch<BacklogItem>(`/companies/${companyId}/backlog/items/${id}`, input),
  archiveItem: (companyId: string, id: string) =>
    api.post<BacklogItem>(`/companies/${companyId}/backlog/items/${id}/archive`, {}),
  reorderItem: (companyId: string, id: string, input: ReorderBacklogItemInput) =>
    api.post<BacklogItem>(
      `/companies/${companyId}/backlog/items/${id}/reorder`,
      input,
    ),
  bulkApply: (companyId: string, input: BulkBacklogItemInput) =>
    api.post<BulkBacklogItemResult>(
      `/companies/${companyId}/backlog/items/bulk`,
      input,
    ),
  promoteItem: (
    companyId: string,
    id: string,
    input: PromoteBacklogItemInput = {},
  ) =>
    api.post<PromoteBacklogItemResult>(
      `/companies/${companyId}/backlog/items/${id}/promote`,
      input,
    ),
  bulkPromote: (companyId: string, input: BulkPromoteBacklogItemInput) =>
    api.post<BulkPromoteBacklogItemResult>(
      `/companies/${companyId}/backlog/items/bulk-promote`,
      input,
    ),
  fromIssue: (companyId: string, issueId: string) =>
    api.post<{
      item: BacklogItem;
      issue: {
        id: string;
        identifier: string | null;
        prevStatus: string;
        status: string;
      };
    }>(`/companies/${companyId}/backlog/items/from-issue/${issueId}`, {}),
  restoreIssue: (companyId: string, backlogItemId: string) =>
    api.post<{ itemId: string; issue: { id: string; status: string } }>(
      `/companies/${companyId}/backlog/items/${backlogItemId}/restore-issue`,
      {},
    ),
  overview: (companyId: string, opts?: { recentDays?: number; staleDays?: number }) => {
    const params = new URLSearchParams();
    if (opts?.recentDays) params.set("recentDays", String(opts.recentDays));
    if (opts?.staleDays) params.set("staleDays", String(opts.staleDays));
    const qs = params.toString();
    return api.get<BacklogOverview>(
      `/companies/${companyId}/backlog/overview${qs ? `?${qs}` : ""}`,
    );
  },

  listComments: (companyId: string, backlogItemId: string) =>
    api.get<BacklogItemComment[]>(
      `/companies/${companyId}/backlog/items/${backlogItemId}/comments`,
    ),
  createComment: (
    companyId: string,
    backlogItemId: string,
    input: CreateBacklogItemCommentInput,
  ) =>
    api.post<BacklogItemComment>(
      `/companies/${companyId}/backlog/items/${backlogItemId}/comments`,
      input,
    ),
  updateComment: (
    companyId: string,
    commentId: string,
    input: UpdateBacklogItemCommentInput,
  ) =>
    api.patch<BacklogItemComment>(
      `/companies/${companyId}/backlog/comments/${commentId}`,
      input,
    ),
  deleteComment: (companyId: string, commentId: string) =>
    api.delete<void>(`/companies/${companyId}/backlog/comments/${commentId}`),

  listPlans: (companyId: string, includeArchived = false) => {
    const qs = includeArchived ? "?includeArchived=1" : "";
    return api.get<BacklogPlan[]>(`/companies/${companyId}/backlog/plans${qs}`);
  },
  getPlan: (companyId: string, id: string) =>
    api.get<BacklogPlan>(`/companies/${companyId}/backlog/plans/${id}`),
  createPlan: (companyId: string, input: CreateBacklogPlanInput) =>
    api.post<BacklogPlan>(`/companies/${companyId}/backlog/plans`, input),
  updatePlan: (companyId: string, id: string, input: UpdateBacklogPlanInput) =>
    api.patch<BacklogPlan>(`/companies/${companyId}/backlog/plans/${id}`, input),
  archivePlan: (companyId: string, id: string) =>
    api.post<BacklogPlan>(`/companies/${companyId}/backlog/plans/${id}/archive`, {}),
};
