import type {
  BacklogItem,
  BacklogItemFilters,
  BacklogPlan,
  BulkBacklogItemInput,
  BulkBacklogItemResult,
  CreateBacklogItemInput,
  CreateBacklogPlanInput,
  ReorderBacklogItemInput,
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
