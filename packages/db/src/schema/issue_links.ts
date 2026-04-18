import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

/**
 * Issue link table — backs the `linkIssues` Papee tool
 * (PAPEE_TOOLS_PLAN.md §11).
 *
 * Models a directed relation between two issues. The `relation` field
 * is a closed enum: blocks | blocked-by | relates-to | duplicates.
 *
 * The (sourceIssueId, targetIssueId, relation) triple is unique so the
 * same relation can't be inserted twice.
 */
export const issueLinks = pgTable(
  "issue_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceIssueId: uuid("source_issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    targetIssueId: uuid("target_issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueLink: unique("issue_links_unique").on(table.sourceIssueId, table.targetIssueId, table.relation),
    sourceIdx: index("issue_links_source_idx").on(table.sourceIssueId),
    targetIdx: index("issue_links_target_idx").on(table.targetIssueId),
    companyIdx: index("issue_links_company_idx").on(table.companyId),
  }),
);

export type IssueLinkRow = typeof issueLinks.$inferSelect;
export type NewIssueLinkRow = typeof issueLinks.$inferInsert;
