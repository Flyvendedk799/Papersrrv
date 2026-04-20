import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { backlogPlans } from "./backlog_plans.js";
import { agents } from "./agents.js";

/**
 * Comments on backlog plans (migration 0043_plan_depth / F5).
 *
 * A parallel surface to `backlog_item_comments` — keeping these
 * tables separate (rather than a generalised comments table) because
 * each domain evolves its own retention, indexing and mutation
 * rules. Shape intentionally mirrors `backlog_item_comments` so the
 * existing CommentThread renderer works unchanged.
 */
export const backlogPlanComments = pgTable(
  "backlog_plan_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    backlogPlanId: uuid("backlog_plan_id")
      .notNull()
      .references(() => backlogPlans.id, { onDelete: "cascade" }),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    planIdx: index("backlog_plan_comments_plan_idx").on(table.backlogPlanId),
    companyIdx: index("backlog_plan_comments_company_idx").on(table.companyId),
    companyPlanCreatedAtIdx: index(
      "backlog_plan_comments_company_plan_created_idx",
    ).on(table.companyId, table.backlogPlanId, table.createdAt),
  }),
);

export type BacklogPlanCommentRow = typeof backlogPlanComments.$inferSelect;
export type NewBacklogPlanCommentRow = typeof backlogPlanComments.$inferInsert;
