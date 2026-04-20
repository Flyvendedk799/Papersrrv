import { pgTable, uuid, text, timestamp, date, index, integer, bigint, jsonb, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { agents } from "./agents.js";
import { githubConnections } from "./github_connections.js";
import { assets } from "./assets.js";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    goalId: uuid("goal_id").references(() => goals.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("backlog"),
    leadAgentId: uuid("lead_agent_id").references(() => agents.id),
    targetDate: date("target_date"),
    color: text("color"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Source of truth for the project's codebase (if any).
    sourceKind: text("source_kind").notNull().default("none"),
    githubConnectionId: uuid("github_connection_id").references(() => githubConnections.id, { onDelete: "set null" }),
    githubRepoOwner: text("github_repo_owner"),
    githubRepoName: text("github_repo_name"),
    githubDefaultBranch: text("github_default_branch"),
    localArchiveAssetId: uuid("local_archive_asset_id").references(() => assets.id, { onDelete: "set null" }),
    localArchiveFilename: text("local_archive_filename"),
    localArchiveSizeBytes: bigint("local_archive_size_bytes", { mode: "number" }),
    localArchiveEntryCount: integer("local_archive_entry_count"),
    sourceIngestedAt: timestamp("source_ingested_at", { withTimezone: true }),
    sourceMetadataJson: jsonb("source_metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("projects_company_idx").on(table.companyId),
    sourceKindIdx: index("projects_source_kind_idx").on(table.sourceKind),
    githubRepoIdx: index("projects_github_repo_idx").on(table.githubConnectionId, table.githubRepoOwner, table.githubRepoName),
  }),
);

export const projectArchiveEntries = pgTable(
  "project_archive_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    sha1: text("sha1"),
    contentType: text("content_type"),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    isDirectory: boolean("is_directory").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("project_archive_entries_project_idx").on(table.projectId),
    projectPathIdx: index("project_archive_entries_project_path_idx").on(table.projectId, table.path),
  }),
);
