import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { githubRepos } from "./github_repos.js";

/**
 * Cached GitHub commit metadata (backlog 4.0 A4).
 *
 * Holds the minimum needed for the repo dashboard's "recent commits"
 * panel and the branches view. Full commit detail (tree, diff, parents)
 * is not mirrored; Octokit is used for demand-driven reads.
 */
export const githubCommits = pgTable(
  "github_commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    branch: text("branch"),
    message: text("message"),
    authorLogin: text("author_login"),
    authorName: text("author_name"),
    authoredAt: timestamp("authored_at", { withTimezone: true }),
    htmlUrl: text("html_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("github_commits_company_idx").on(table.companyId),
    repoIdx: index("github_commits_repo_idx").on(table.repoId),
    repoShaUq: uniqueIndex("github_commits_repo_sha_uq").on(
      table.repoId,
      table.sha,
    ),
    repoUpdatedIdx: index("github_commits_repo_updated_idx").on(
      table.repoId,
      table.updatedAt,
    ),
  }),
);

export type GithubCommitRow = typeof githubCommits.$inferSelect;
export type NewGithubCommitRow = typeof githubCommits.$inferInsert;
