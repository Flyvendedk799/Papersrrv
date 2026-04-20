import type { ProjectStatus } from "../constants.js";
import type { ProjectSource } from "../validators/project.js";

export interface ProjectGoalRef {
  id: string;
  title: string;
}

export interface ProjectWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  metadata: Record<string, unknown> | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  companyId: string;
  urlKey: string;
  /** @deprecated Use goalIds / goals instead */
  goalId: string | null;
  goalIds: string[];
  goals: ProjectGoalRef[];
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
  /**
   * Codebase source linked to this project, if any. `source.kind` is
   * always present; when `none`, `github` and `archive` are absent.
   * Populated by GET /projects/:id and GET /projects/:id/source.
   */
  source: ProjectSource;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
