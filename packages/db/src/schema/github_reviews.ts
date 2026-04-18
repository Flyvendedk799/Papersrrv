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
import { githubPullRequests } from "./github_pull_requests.js";
import { githubRepos } from "./github_repos.js";

/**
 * Cached GitHub pull request reviews (backlog 4.0 A4).
 *
 * Upserted by `(pullRequestId, githubReviewId)`. Used to render the
 * reviewer column in PR list and the approvals ledger on PR detail
 * without a live GitHub roundtrip.
 */
export const githubReviews = pgTable(
  "github_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => githubPullRequests.id, { onDelete: "cascade" }),
    githubReviewId: bigint("github_review_id", { mode: "number" }).notNull(),
    reviewerLogin: text("reviewer_login"),
    // Raw GitHub state: APPROVED | CHANGES_REQUESTED | COMMENTED |
    // DISMISSED | PENDING.
    state: text("state").notNull(),
    body: text("body"),
    htmlUrl: text("html_url"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("github_reviews_company_idx").on(table.companyId),
    repoIdx: index("github_reviews_repo_idx").on(table.repoId),
    prIdx: index("github_reviews_pr_idx").on(table.pullRequestId),
    prReviewUq: uniqueIndex("github_reviews_pr_review_uq").on(
      table.pullRequestId,
      table.githubReviewId,
    ),
    prUpdatedIdx: index("github_reviews_pr_updated_idx").on(
      table.pullRequestId,
      table.updatedAt,
    ),
  }),
);

export type GithubReviewRow = typeof githubReviews.$inferSelect;
export type NewGithubReviewRow = typeof githubReviews.$inferInsert;
