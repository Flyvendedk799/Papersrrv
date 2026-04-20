import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";

/**
 * Issue templates (F5 / migration 0045_issue_depth).
 *
 * Reusable skeleton for creating issues. Parallels plan_templates
 * from 0044. Title + body support {variable} placeholders that are
 * substituted at instantiation time; defaults (priority, kind,
 * assignees, project, labels) pre-fill the New Issue Dialog.
 */
export const issueTemplates = pgTable(
  "issue_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    titleTemplate: text("title_template").notNull(),
    bodyTemplate: text("body_template"),
    defaultPriority: text("default_priority"),
    defaultKind: text("default_kind").notNull().default("issue"),
    defaultAssigneeAgentId: uuid("default_assignee_agent_id").references(() => agents.id),
    defaultAssigneeUserId: text("default_assignee_user_id"),
    defaultProjectId: uuid("default_project_id").references(() => projects.id, { onDelete: "set null" }),
    defaultLabelIds: jsonb("default_label_ids").$type<string[] | null>(),
    variables: jsonb("variables").$type<unknown>(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("issue_templates_company_idx").on(table.companyId),
    companyNameUq: uniqueIndex("issue_templates_company_name_uq").on(table.companyId, table.name),
  }),
);

export type IssueTemplateRow = typeof issueTemplates.$inferSelect;
export type NewIssueTemplateRow = typeof issueTemplates.$inferInsert;
