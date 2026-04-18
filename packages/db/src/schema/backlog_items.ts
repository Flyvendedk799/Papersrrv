import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { goals } from "./goals.js";
import { issues } from "./issues.js";
import { backlogPlans } from "./backlog_plans.js";

/**
 * Backlog items (backlog3.0 A1).
 *
 * Greenfield pre-issue entity. Items live here until they are promoted
 * to real Issues via existing Issue APIs (see backlog3.0 C3 — deferred
 * from the foundation slice).
 *
 * Decisions recorded in `backlog/backlog3.0-IMPLEMENTATION.md`:
 *   - Status enum: idea | draft | ready | promoted | archived
 *   - Rank: opaque string (lexorank-style lexicographic ordering).
 *   - Plans are a separate row (see backlog_plans).
 *
 * Soft delete: `deletedAt` + `status = 'archived'` for triage history;
 * promoted items keep lineage via `promotedIssueId` and are never hard
 * deleted.
 */
export const backlogItems = pgTable(
  "backlog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    status: text("status").notNull().default("idea"),
    priority: text("priority"),
    source: text("source").notNull().default("manual"),
    sourceRef: jsonb("source_ref").$type<Record<string, unknown>>(),
    authorUserId: text("author_user_id"),
    authorAgentId: uuid("author_agent_id"),
    ownerUserId: text("owner_user_id"),
    ownerAgentId: uuid("owner_agent_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    planId: uuid("plan_id").references(() => backlogPlans.id, { onDelete: "set null" }),
    promotedIssueId: uuid("promoted_issue_id").references(() => issues.id, { onDelete: "set null" }),
    rank: text("rank").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("backlog_items_company_idx").on(table.companyId),
    companyStatusIdx: index("backlog_items_company_status_idx").on(table.companyId, table.status),
    companySourceIdx: index("backlog_items_company_source_idx").on(table.companyId, table.source),
    companyPlanIdx: index("backlog_items_company_plan_idx").on(table.companyId, table.planId),
    companyProjectIdx: index("backlog_items_company_project_idx").on(table.companyId, table.projectId),
    companyRankIdx: index("backlog_items_company_rank_idx").on(table.companyId, table.rank),
  }),
);

export type BacklogItemRow = typeof backlogItems.$inferSelect;
export type NewBacklogItemRow = typeof backlogItems.$inferInsert;
