import { pgTable, uuid, text, timestamp, index, unique, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { goals } from "./goals.js";

/**
 * Backlog plans (backlog3.0 A3).
 *
 * Named groups of pre-issue backlog items (sprint, milestone, roadmap, custom).
 * Design decision: plans are a first-class row (rather than a backlog item
 * `type`) so that they can carry their own metadata (kind, date window,
 * status, ordering) and move items between plans without mutating
 * rank ownership semantics.
 *
 * `status`:
 *   - active   – current, displayed in plan nav
 *   - archived – soft-archived, items preserved and re-parentable
 *
 * `kind`:
 *   - sprint | milestone | roadmap | custom
 *
 * Foundation-phase scope only ships reads/creates/updates/archives.
 */
export const backlogPlans = pgTable(
  "backlog_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("custom"),
    status: text("status").notNull().default("active"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    rank: text("rank").notNull().default(""),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id"),
    /* Migration 0041 — planning-issue foundation. When a backlog plan
     * is created via "Save as Backlog Plan" from a completed
     * planning issue, this stores the source issue id. Lets the
     * Backlog page surface plans-from-issues distinctly, and blocks
     * duplicate creation on retry. No-FK on write side because
     * issues may be deleted independently; readers tolerate null. */
    sourceIssueId: uuid("source_issue_id"),
    /* Structured plan output (migration 0043_plan_depth).
     *
     * Copied from issues.plan_output_json on transfer so the plan
     * detail page can render the full document (summary, steps,
     * risks, open questions, delegations) without chasing the
     * source issue. Edits after transfer snapshot the prior value
     * into backlog_plan_revisions. Shape enforced by the shared
     * PlanOutput Zod schema. */
    planOutputJson: jsonb("plan_output_json").$type<unknown>(),
    /* Approval gate status (migration 0043_plan_depth).
     *
     *   'none'     — approval not required (default)
     *   'pending'  — awaiting approval; items not seeded yet
     *   'approved' — ready; items seeded, plan live
     *   'rejected' — rejected; plan archived
     *
     * Wiring lives in the Approvals service; the column here is the
     * source of truth for the plan-side state. */
    approvalStatus: text("approval_status").notNull().default("none"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("backlog_plans_company_idx").on(table.companyId),
    companyStatusIdx: index("backlog_plans_company_status_idx").on(table.companyId, table.status),
    companyTitleUq: unique("backlog_plans_company_title_uq").on(table.companyId, table.title),
    sourceIssueIdx: index("backlog_plans_source_issue_idx").on(table.sourceIssueId),
    approvalStatusIdx: index("backlog_plans_approval_status_idx").on(table.companyId, table.approvalStatus),
  }),
);

export type BacklogPlanRow = typeof backlogPlans.$inferSelect;
export type NewBacklogPlanRow = typeof backlogPlans.$inferInsert;
