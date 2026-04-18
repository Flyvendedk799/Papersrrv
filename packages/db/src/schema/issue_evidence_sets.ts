import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agentFileSnapshots } from "./agent_file_snapshots.js";

/**
 * Evidence sets for issues (backlog 2.0 B4 / 1.5 A2).
 *
 * Design decision (recorded in backlog): add a dedicated pair of tables
 * rather than extending issue_summary_files with a nullable set_name.
 * This keeps default "summary" pinning isolated from named sets, avoids
 * a multi-tenancy trap on unique constraints, and allows future
 * set-level metadata (description, order, owner) without reshaping
 * the summary table.
 *
 * Content immutability invariant (backlog 2.0): items reference
 * snapshotId (which carries a content hash). The snapshot content is
 * retained for as long as any evidence set item references it.
 */
export const issueEvidenceSets = pgTable(
  "issue_evidence_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    name: text("name").notNull(),
    description: text("description"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("issue_evidence_sets_issue_idx").on(table.issueId),
    companyIdx: index("issue_evidence_sets_company_idx").on(table.companyId),
    issueNameUq: unique("issue_evidence_sets_issue_name_uq").on(table.issueId, table.name),
  }),
);

export const issueEvidenceSetItems = pgTable(
  "issue_evidence_set_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id").notNull().references(() => issueEvidenceSets.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id").notNull().references(() => agentFileSnapshots.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    setIdx: index("issue_evidence_set_items_set_idx").on(table.setId),
    snapIdx: index("issue_evidence_set_items_snap_idx").on(table.snapshotId),
    setSnapUq: unique("issue_evidence_set_items_set_snap_uq").on(table.setId, table.snapshotId),
  }),
);
