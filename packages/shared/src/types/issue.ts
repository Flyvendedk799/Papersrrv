import type { IssuePriority, IssueStatus } from "../constants.js";
import type { Goal } from "./goal.js";
import type { Project, ProjectWorkspace } from "./project.js";
import type { IssueKind, PlanOutput } from "../validators/planning.js";

export interface IssueAncestorProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  goalId: string | null;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
}

export interface IssueAncestorGoal {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
}

export interface IssueAncestor {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  projectId: string | null;
  goalId: string | null;
  project: IssueAncestorProject | null;
  goal: IssueAncestorGoal | null;
}

export interface IssueLabel {
  id: string;
  companyId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueAssigneeAdapterOverrides {
  adapterConfig?: Record<string, unknown>;
  useProjectWorkspace?: boolean;
}

export interface Issue {
  id: string;
  companyId: string;
  projectId: string | null;
  goalId: string | null;
  parentId: string | null;
  ancestors?: IssueAncestor[];
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  checkoutRunId: string | null;
  executionRunId: string | null;
  executionAgentNameKey: string | null;
  executionLockedAt: Date | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  issueNumber: number | null;
  identifier: string | null;
  requestDepth: number;
  billingCode: string | null;
  assigneeAdapterOverrides: IssueAssigneeAdapterOverrides | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  hiddenAt: Date | null;
  // Planning-issue foundation (migration 0041). `kind="planning"`
  // marks an investigation-produces-a-plan issue; such issues
  // converge to a structured `planOutputJson` payload (validated
  // by the PlanOutput Zod schema) and can be transferred into
  // backlog_plans via POST /issues/:id/transfer-to-backlog — which
  // stamps transferredToBacklogAt so retries are idempotent.
  kind: IssueKind;
  planOutputJson?: PlanOutput | null;
  transferredToBacklogAt?: Date | null;
  // Causal linkage for the Dossier DAG. Set when a sub-issue is
  // spawned from a specific comment or run. Null for issues created
  // through normal flows or pre-dating the column.
  createdFromCommentId?: string | null;
  createdFromRunId?: string | null;
  labelIds?: string[];
  labels?: IssueLabel[];
  project?: Project | null;
  goal?: Goal | null;
  mentionedProjects?: Project[];
  myLastTouchAt?: Date | null;
  lastExternalCommentAt?: Date | null;
  isUnreadForMe?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueComment {
  id: string;
  companyId: string;
  issueId: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  body: string;
  // Explicit reply target for the Dossier causal chain. Null for
  // top-level comments.
  replyToCommentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueAttachment {
  id: string;
  companyId: string;
  issueId: string;
  issueCommentId: string | null;
  assetId: string;
  provider: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contentPath: string;
}
