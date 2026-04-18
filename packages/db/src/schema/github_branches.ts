import {
  boolean,
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
 * Cached GitHub branches (backlog 4.0 A4).
 *
 * Stores branch name, tip sha, and whether the branch is protected so the
 * branches view can be rendered without a live GitHub hit. The tip sha is
 * updated on push webhooks; webhooks are idempotent (last-write-wins by
 * `updatedAt`).
 */
export const githubBranches = pgTable(
  "github_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastCommitSha: text("last_commit_sha"),
    protected: boolean("protected").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("github_branches_company_idx").on(table.companyId),
    repoIdx: index("github_branches_repo_idx").on(table.repoId),
    repoNameUq: uniqueIndex("github_branches_repo_name_uq").on(
      table.repoId,
      table.name,
    ),
    repoUpdatedIdx: index("github_branches_repo_updated_idx").on(
      table.repoId,
      table.updatedAt,
    ),
  }),
);

export type GithubBranchRow = typeof githubBranches.$inferSelect;
export type NewGithubBranchRow = typeof githubBranches.$inferInsert;
