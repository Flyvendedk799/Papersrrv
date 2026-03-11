import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { agentFileSnapshots } from "./agent_file_snapshots.js";

export const issueSummaryFiles = pgTable(
  "issue_summary_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    snapshotId: uuid("snapshot_id").notNull().references(() => agentFileSnapshots.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("idx_issue_summary_files_issue").on(table.issueId),
    uniqueIssueSnapshot: unique("uq_issue_summary_file").on(table.issueId, table.snapshotId),
  }),
);
