import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { labels } from "./labels.js";
import { backlogItems } from "./backlog_items.js";

/**
 * Backlog item ↔ label M:N (backlog3.0 A1).
 *
 * Follows the existing `issue_labels` convention so that label primitives
 * remain shared between Issues and Backlog items.
 */
export const backlogItemLabels = pgTable(
  "backlog_item_labels",
  {
    backlogItemId: uuid("backlog_item_id").notNull().references(() => backlogItems.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.backlogItemId, table.labelId], name: "backlog_item_labels_pk" }),
    itemIdx: index("backlog_item_labels_item_idx").on(table.backlogItemId),
    labelIdx: index("backlog_item_labels_label_idx").on(table.labelId),
    companyIdx: index("backlog_item_labels_company_idx").on(table.companyId),
  }),
);

export type BacklogItemLabelRow = typeof backlogItemLabels.$inferSelect;
export type NewBacklogItemLabelRow = typeof backlogItemLabels.$inferInsert;
