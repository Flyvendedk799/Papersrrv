import {
  bigint,
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
 * Cached GitHub check runs (backlog 4.0 A4).
 *
 * One row per check run. The webhook `check_run` handler upserts by
 * `(repoId, githubCheckId)`. Stored against a head sha so the dashboard
 * can summarize CI status for a commit or PR.
 */
export const githubChecks = pgTable(
  "github_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    githubCheckId: bigint("github_check_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    headSha: text("head_sha").notNull(),
    status: text("status"),
    conclusion: text("conclusion"),
    htmlUrl: text("html_url"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("github_checks_company_idx").on(table.companyId),
    repoIdx: index("github_checks_repo_idx").on(table.repoId),
    repoCheckUq: uniqueIndex("github_checks_repo_check_uq").on(
      table.repoId,
      table.githubCheckId,
    ),
    repoHeadShaIdx: index("github_checks_repo_head_sha_idx").on(
      table.repoId,
      table.headSha,
    ),
    repoUpdatedIdx: index("github_checks_repo_updated_idx").on(
      table.repoId,
      table.updatedAt,
    ),
  }),
);

export type GithubCheckRow = typeof githubChecks.$inferSelect;
export type NewGithubCheckRow = typeof githubChecks.$inferInsert;
