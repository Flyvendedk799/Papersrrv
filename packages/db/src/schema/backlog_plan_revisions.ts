import { pgTable, uuid, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { backlogPlans } from "./backlog_plans.js";
import { agents } from "./agents.js";

/**
 * Backlog plan revisions (migration 0043_plan_depth / F7).
 *
 * Versioned snapshots of a plan's `plan_output_json`. Every edit of
 * the plan's structured document appends a new row with the *prior*
 * payload and an auto-incremented `version`, forming a linear
 * revision log. The UI renders a Revisions tab with a diff between
 * consecutive versions.
 */
export const backlogPlanRevisions = pgTable(
  "backlog_plan_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    backlogPlanId: uuid("backlog_plan_id")
      .notNull()
      .references(() => backlogPlans.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    planOutputJson: jsonb("plan_output_json").$type<unknown>(),
    title: text("title"),
    description: text("description"),
    summaryOfChange: text("summary_of_change"),
    editedByAgentId: uuid("edited_by_agent_id").references(() => agents.id),
    editedByUserId: text("edited_by_user_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    planVersionUq: uniqueIndex("backlog_plan_revisions_plan_version_uq").on(
      table.backlogPlanId,
      table.version,
    ),
    companyIdx: index("backlog_plan_revisions_company_idx").on(table.companyId),
  }),
);

export type BacklogPlanRevisionRow = typeof backlogPlanRevisions.$inferSelect;
export type NewBacklogPlanRevisionRow = typeof backlogPlanRevisions.$inferInsert;
