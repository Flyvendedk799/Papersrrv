import type {
  Workflow,
  WorkflowStep,
  WorkflowEdge,
  WorkflowRun,
  WorkflowStepRun,
  WorkflowTemplate,
} from "@paperclipai/shared";
import { api } from "./client";

export const workflowsApi = {
  list: (companyId: string, filters?: { status?: string; triggerType?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.triggerType) params.set("triggerType", filters.triggerType);
    const qs = params.toString();
    return api.get<Workflow[]>(`/companies/${companyId}/workflows${qs ? `?${qs}` : ""}`);
  },

  get: (companyId: string, id: string) =>
    api.get<Workflow & { steps: WorkflowStep[]; edges: WorkflowEdge[] }>(
      `/companies/${companyId}/workflows/${id}`,
    ),

  create: (companyId: string, data: { name: string; description?: string; triggerType?: string }) =>
    api.post<Workflow>(`/companies/${companyId}/workflows`, data),

  update: (
    companyId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      status: string;
      triggerType: string;
      triggerConfig: Record<string, unknown>;
    }>,
  ) => api.patch<Workflow>(`/companies/${companyId}/workflows/${id}`, data),

  delete: (companyId: string, id: string) =>
    api.delete<void>(`/companies/${companyId}/workflows/${id}`),

  // Steps
  addStep: (
    companyId: string,
    workflowId: string,
    data: {
      name: string;
      stepType: string;
      agentId?: string;
      config?: Record<string, unknown>;
      position?: { x: number; y: number };
    },
  ) => api.post<WorkflowStep>(`/companies/${companyId}/workflows/${workflowId}/steps`, data),

  updateStep: (
    companyId: string,
    workflowId: string,
    stepId: string,
    data: Partial<{
      name: string;
      description: string;
      stepType: string;
      agentId: string;
      config: Record<string, unknown>;
      position: { x: number; y: number };
      inputMapping: Record<string, unknown>;
    }>,
  ) =>
    api.patch<WorkflowStep>(
      `/companies/${companyId}/workflows/${workflowId}/steps/${stepId}`,
      data,
    ),

  deleteStep: (companyId: string, workflowId: string, stepId: string) =>
    api.delete<void>(`/companies/${companyId}/workflows/${workflowId}/steps/${stepId}`),

  // Edges
  addEdge: (
    companyId: string,
    workflowId: string,
    data: { sourceStepId: string; targetStepId: string; edgeType?: string },
  ) => api.post<WorkflowEdge>(`/companies/${companyId}/workflows/${workflowId}/edges`, data),

  deleteEdge: (companyId: string, workflowId: string, edgeId: string) =>
    api.delete<void>(`/companies/${companyId}/workflows/${workflowId}/edges/${edgeId}`),

  updateLayout: (
    companyId: string,
    workflowId: string,
    positions: Record<string, { x: number; y: number }>,
  ) => api.put<void>(`/companies/${companyId}/workflows/${workflowId}/layout`, { positions }),

  // Runs
  startRun: (
    companyId: string,
    workflowId: string,
    data?: { issueId?: string; triggerPayload?: Record<string, unknown> },
  ) => api.post<WorkflowRun>(`/companies/${companyId}/workflows/${workflowId}/run`, data ?? {}),

  listRuns: (companyId: string, workflowId: string) =>
    api.get<WorkflowRun[]>(`/companies/${companyId}/workflows/${workflowId}/runs`),

  getRun: (companyId: string, runId: string) =>
    api.get<WorkflowRun & { stepRuns: (WorkflowStepRun & { step: WorkflowStep })[] }>(
      `/companies/${companyId}/workflow-runs/${runId}`,
    ),

  cancelRun: (companyId: string, runId: string) =>
    api.post<void>(`/companies/${companyId}/workflow-runs/${runId}/cancel`, {}),

  retryRun: (companyId: string, runId: string) =>
    api.post<WorkflowRun>(`/companies/${companyId}/workflow-runs/${runId}/retry`, {}),

  approveStep: (companyId: string, runId: string, stepRunId: string) =>
    api.post<void>(
      `/companies/${companyId}/workflow-runs/${runId}/steps/${stepRunId}/approve`,
      {},
    ),

  rejectStep: (companyId: string, runId: string, stepRunId: string, reason?: string) =>
    api.post<void>(
      `/companies/${companyId}/workflow-runs/${runId}/steps/${stepRunId}/reject`,
      { reason },
    ),

  // Templates
  listTemplates: (companyId: string, category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return api.get<WorkflowTemplate[]>(`/companies/${companyId}/workflow-templates${qs}`);
  },

  saveAsTemplate: (
    companyId: string,
    data: {
      name: string;
      description?: string;
      category?: string;
      stepsJson: unknown[];
      edgesJson: unknown[];
    },
  ) => api.post<WorkflowTemplate>(`/companies/${companyId}/workflow-templates`, data),

  instantiateTemplate: (companyId: string, templateId: string, data?: { name?: string }) =>
    api.post<Workflow>(
      `/companies/${companyId}/workflow-templates/${templateId}/instantiate`,
      data ?? {},
    ),

  generate: (companyId: string, data: { description: string; issueId?: string }) =>
    api.post<Workflow>(`/companies/${companyId}/workflows/generate`, data),
};
