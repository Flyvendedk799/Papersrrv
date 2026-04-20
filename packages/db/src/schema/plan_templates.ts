import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * Plan templates (F10 / migration 0044_plan_templates).
 *
 * A PlanOutput shell that can be instantiated when creating a new
 * planning-kind issue. Variables (if declared) are substituted at
 * instantiation time — e.g. `{release_version}` in a step detail
 * becomes the string the user provides. Enables reusable workflows
 * like launch readiness, incident postmortem, quarterly planning.
 *
 * `variables` is a JSON array of { name, label, default?, required? }.
 */
export const planTemplates = pgTable(
  "plan_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    planOutputJson: jsonb("plan_output_json").$type<unknown>().notNull(),
    variables: jsonb("variables").$type<unknown>(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("plan_templates_company_idx").on(table.companyId),
    companyNameUq: uniqueIndex("plan_templates_company_name_uq").on(table.companyId, table.name),
  }),
);

export type PlanTemplateRow = typeof planTemplates.$inferSelect;
export type NewPlanTemplateRow = typeof planTemplates.$inferInsert;
