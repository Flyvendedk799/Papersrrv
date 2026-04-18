import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { issueComments } from "./issue_comments.js";

/**
 * File evidence attached to comments (backlog 2.0 B3 / 1.5 B2).
 *
 * Design decision: separate table rather than structured column on
 * issue_comments. Keeps comment body fully free-form, allows multiple
 * evidence rows per comment without JSON parsing, and preserves the
 * Content Immutability Invariant via contentHash (we do NOT rely on
 * snapshotId because snapshots may eventually be pruned; the content
 * hash is the durable identifier for the version shown).
 */
export const commentFileEvidence = pgTable(
  "comment_file_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    commentId: uuid("comment_id").notNull().references(() => issueComments.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    contentHash: text("content_hash"),
    snapshotId: uuid("snapshot_id"),
    excerpt: text("excerpt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    commentIdx: index("comment_file_evidence_comment_idx").on(table.commentId),
    issueIdx: index("comment_file_evidence_issue_idx").on(table.issueId),
    companyIdx: index("comment_file_evidence_company_idx").on(table.companyId),
    pathIdx: index("comment_file_evidence_path_idx").on(table.companyId, table.filePath),
  }),
);
