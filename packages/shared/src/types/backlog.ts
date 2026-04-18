/**
 * Shared backlog types + constants (backlog3.0 A1 / A2 / A3).
 *
 * Implementation decisions documented in backlog/backlog3.0-IMPLEMENTATION.md.
 */

export const BACKLOG_ITEM_STATUSES = [
  "idea",
  "draft",
  "ready",
  "promoted",
  "archived",
] as const;
export type BacklogItemStatus = (typeof BACKLOG_ITEM_STATUSES)[number];

export const BACKLOG_ITEM_SOURCES = [
  "chat",
  "issue",
  "run",
  "workflow",
  "manual",
  "agent",
] as const;
export type BacklogItemSource = (typeof BACKLOG_ITEM_SOURCES)[number];

export const BACKLOG_PLAN_KINDS = [
  "sprint",
  "milestone",
  "roadmap",
  "custom",
] as const;
export type BacklogPlanKind = (typeof BACKLOG_PLAN_KINDS)[number];

export const BACKLOG_PLAN_STATUSES = ["active", "archived"] as const;
export type BacklogPlanStatus = (typeof BACKLOG_PLAN_STATUSES)[number];

export interface BacklogItemSourceRef {
  type: string;
  id?: string;
  url?: string;
  [key: string]: unknown;
}

export interface BacklogItem {
  id: string;
  companyId: string;
  title: string;
  body: string | null;
  status: BacklogItemStatus;
  priority: string | null;
  source: BacklogItemSource;
  sourceRef: BacklogItemSourceRef | null;
  authorUserId: string | null;
  authorAgentId: string | null;
  ownerUserId: string | null;
  ownerAgentId: string | null;
  projectId: string | null;
  goalId: string | null;
  planId: string | null;
  promotedIssueId: string | null;
  rank: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BacklogPlan {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  kind: BacklogPlanKind;
  status: BacklogPlanStatus;
  projectId: string | null;
  goalId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  rank: string;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBacklogItemInput {
  title: string;
  body?: string | null;
  status?: BacklogItemStatus;
  priority?: string | null;
  source?: BacklogItemSource;
  sourceRef?: BacklogItemSourceRef | null;
  projectId?: string | null;
  goalId?: string | null;
  planId?: string | null;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
  rank?: string;
}

export interface UpdateBacklogItemInput {
  title?: string;
  body?: string | null;
  status?: BacklogItemStatus;
  priority?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  planId?: string | null;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
  rank?: string;
}

export interface CreateBacklogPlanInput {
  title: string;
  description?: string | null;
  kind?: BacklogPlanKind;
  status?: BacklogPlanStatus;
  projectId?: string | null;
  goalId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  rank?: string;
}

export interface UpdateBacklogPlanInput {
  title?: string;
  description?: string | null;
  kind?: BacklogPlanKind;
  status?: BacklogPlanStatus;
  projectId?: string | null;
  goalId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  rank?: string;
}

export interface BacklogItemFilters {
  status?: BacklogItemStatus;
  source?: BacklogItemSource;
  planId?: string | null;
  projectId?: string;
  goalId?: string;
  includeArchived?: boolean;
  q?: string;
}

/**
 * Reorder payload (backlog3.0 B3). `prevId` and `nextId` identify the
 * neighbour items the target should slot between; omit both to drop
 * at the head of the list. `planId` / `status` optionally retarget the
 * destination container (column / plan bucket).
 */
export interface ReorderBacklogItemInput {
  prevId?: string | null;
  nextId?: string | null;
  planId?: string | null;
  status?: BacklogItemStatus;
}
