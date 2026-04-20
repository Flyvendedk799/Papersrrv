import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";

/**
 * Issue watchers (F7 / migration 0045_issue_depth).
 *
 * A watcher is either a user (`userId`) or an agent (`agentId`);
 * exactly one is set per row. Creator + assignee are auto-watched
 * by the server on issue mutation. Watchers receive notifications
 * when the issue is updated.
 *
 * Partial unique indexes on (issueId, userId) and (issueId, agentId)
 * prevent duplicate watcher rows.
 */
export const issueWatchers = pgTable(
  "issue_watchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("issue_watchers_issue_idx").on(table.issueId),
    companyUserIdx: index("issue_watchers_company_user_idx").on(table.companyId, table.userId),
    companyAgentIdx: index("issue_watchers_company_agent_idx").on(table.companyId, table.agentId),
  }),
);

export type IssueWatcherRow = typeof issueWatchers.$inferSelect;
export type NewIssueWatcherRow = typeof issueWatchers.$inferInsert;
