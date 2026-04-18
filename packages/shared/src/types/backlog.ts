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

/**
 * Bulk operations on backlog items (backlog3.0 B4).
 *
 * Single endpoint surface so triage actions stay atomic per-item but
 * are dispatched in one round-trip. The server returns a per-item
 * result so partial failures are reported clearly (no silent drops).
 */
export const BACKLOG_BULK_ACTIONS = ["patch", "archive"] as const;
export type BacklogBulkAction = (typeof BACKLOG_BULK_ACTIONS)[number];

export interface BacklogBulkPatch {
  status?: BacklogItemStatus;
  priority?: string | null;
  planId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
}

export interface BulkBacklogItemInput {
  ids: string[];
  action: BacklogBulkAction;
  patch?: BacklogBulkPatch;
}

export interface BulkBacklogItemResultEntry {
  id: string;
  status: "ok" | "error";
  item?: BacklogItem;
  error?: string;
}

export interface BulkBacklogItemResult {
  action: BacklogBulkAction;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkBacklogItemResultEntry[];
}

/**
 * Overview / insights snapshot for the Backlog Tab (backlog3.0 B5).
 *
 * All counts are company-scoped. `promotedRecent` is the number of items
 * whose status flipped to `promoted` within the last `recentDays` window
 * (default 14d). `stale` is the count of non-archived, non-promoted items
 * that have not been updated in `staleDays` (default 14d).
 *
 * `perPlan` summarizes plans that currently hold one or more items so the
 * UI can render small progress bars without a follow-up round-trip.
 */
export interface BacklogPlanProgress {
  planId: string;
  title: string;
  total: number;
  ready: number;
  promoted: number;
  archived: number;
}

export interface BacklogOverview {
  counts: Record<BacklogItemStatus, number>;
  total: number;
  unplanned: number;
  promotedRecent: number;
  recentDays: number;
  stale: number;
  staleDays: number;
  perPlan: BacklogPlanProgress[];
}
