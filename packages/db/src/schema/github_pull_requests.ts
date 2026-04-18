import {
  bigint,
  boolean,
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
import { githubRepos } from "./github_repos.js";

/**
 * Cached GitHub pull requests (backlog 4.0 A4 — minimal subset).
 *
 * Foundation slice: enough for a PR list view (state, draft, author,
 * head/base, timestamps). Checks/reviews/mergeability-detail deferred.
 */
export const githubPullRequests = pgTable(
  "github_pull_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => githubConnections.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    githubPrId: bigint("github_pr_id", { mode: "number" }).notNull(),
    number: bigint("number", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    // "open" | "closed"
    state: text("state").notNull(),
    draft: boolean("draft").notNull().default(false),
    merged: boolean("merged").notNull().default(false),
    mergeable: boolean("mergeable"),
    authorLogin: text("author_login"),
    headRef: text("head_ref"),
    baseRef: text("base_ref"),
    url: text("url"),
    body: text("body"),
    labels: jsonb("labels").$type<Record<string, unknown>[]>(),
    githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }),
    githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
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
    companyIdx: index("github_prs_company_idx").on(table.companyId),
    repoIdx: index("github_prs_repo_idx").on(table.repoId),
    repoNumberUq: uniqueIndex("github_prs_repo_number_uq").on(
      table.repoId,
      table.number,
    ),
    stateIdx: index("github_prs_state_idx").on(table.companyId, table.state),
  }),
);

export type GithubPullRequestRow = typeof githubPullRequests.$inferSelect;
export type NewGithubPullRequestRow = typeof githubPullRequests.$inferInsert;
