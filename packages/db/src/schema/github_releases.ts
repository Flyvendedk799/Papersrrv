import {
  bigint,
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
 * Cached GitHub releases (backlog 4.0 A4).
 *
 * Holds the minimal fields needed for a releases list and a "what's in
 * this version" view. Notes are stored as the raw markdown body; the
 * UI renders them through the sanitized markdown reader.
 */
export const githubReleases = pgTable(
  "github_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    githubReleaseId: bigint("github_release_id", { mode: "number" }).notNull(),
    tagName: text("tag_name").notNull(),
    name: text("name"),
    draft: boolean("draft").notNull().default(false),
    prerelease: boolean("prerelease").notNull().default(false),
    body: text("body"),
    htmlUrl: text("html_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("github_releases_company_idx").on(table.companyId),
    repoIdx: index("github_releases_repo_idx").on(table.repoId),
    repoReleaseUq: uniqueIndex("github_releases_repo_release_uq").on(
      table.repoId,
      table.githubReleaseId,
    ),
    repoTagUq: uniqueIndex("github_releases_repo_tag_uq").on(
      table.repoId,
      table.tagName,
    ),
    repoUpdatedIdx: index("github_releases_repo_updated_idx").on(
      table.repoId,
      table.updatedAt,
    ),
  }),
);

export type GithubReleaseRow = typeof githubReleases.$inferSelect;
export type NewGithubReleaseRow = typeof githubReleases.$inferInsert;
