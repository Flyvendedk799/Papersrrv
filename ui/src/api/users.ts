import { api } from "./client";

export interface CompanyUser {
  id: string;
  displayName: string;
  email: string;
}

export const usersApi = {
  /** List all user teammates in a company (lightweight, for pickers). */
  listCompanyUsers: (companyId: string) =>
    api.get<CompanyUser[]>(`/companies/${companyId}/users`),
};
