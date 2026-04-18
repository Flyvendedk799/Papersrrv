import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { githubConnections } from "./github_connections.js";

/**
 * Cached GitHub repository metadata (backlog 4.0 A4 — minimal subset).
 *
 * Foundation slice: owner/repo/defaultBranch/visibility/permissions only.
 * Commits/branches/releases/checks/reviews tables are deferred.
 */
export const githubRepos = pgTable(
  "github_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => githubConnections.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    defaultBranch: text("default_branch"),
    visibility: text("visibility"),
    permissions: jsonb("permissions").$type<Record<string, unknown>>(),
    etag: text("etag"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("github_repos_company_idx").on(table.companyId),
    connectionIdx: index("github_repos_connection_idx").on(table.connectionId),
    companyRepoUq: uniqueIndex("github_repos_company_repo_uq").on(
      table.companyId,
      table.owner,
      table.repo,
    ),
  }),
);

export type GithubRepoRow = typeof githubRepos.$inferSelect;
export type NewGithubRepoRow = typeof githubRepos.$inferInsert;
