import type { CompanySkill } from "@paperclipai/shared";
import { api } from "./client";

export const skillsApi = {
  list: (companyId: string) =>
    api.get<CompanySkill[]>(`/companies/${companyId}/skills`),

  get: (companyId: string, skillId: string) =>
    api.get<CompanySkill>(`/companies/${companyId}/skills/${skillId}`),

  create: (companyId: string, data: { name: string; description?: string; content: string; files?: Record<string, string>; metadata?: Record<string, unknown> }) =>
    api.post<CompanySkill>(`/companies/${companyId}/skills`, data),

  update: (companyId: string, skillId: string, data: Record<string, unknown>) =>
    api.patch<CompanySkill>(`/companies/${companyId}/skills/${skillId}`, data),

  delete: (companyId: string, skillId: string) =>
    api.delete<{ deleted: boolean }>(`/companies/${companyId}/skills/${skillId}`),
};
