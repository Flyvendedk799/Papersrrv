import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { backlogItems } from "./backlog_items.js";
import { agents } from "./agents.js";

/**
 * Comments on backlog items (backlog3.0 D3).
 *
 * A parallel surface to `issue_comments` — we keep these tables
 * separate (rather than generalising into a single comments table)
 * because each domain evolves its own retention, indexing, and
 * mutation rules, and mixing them would require conditional FK
 * wiring that outweighs the DRY win. Shape intentionally mirrors
 * `issue_comments` so UI renderers stay interchangeable.
 *
 * Promotion semantics (decided in this ticket): when a backlog item
 * is promoted to an Issue (C3), existing comments are *copied* into
 * the new Issue as `issue_comments` rows with a marker body prefix.
 * The backlog row itself keeps its comments for lineage; this gives
 * the clearest UX for the user hitting the new Issue and preserves
 * round-trip safety if they later restore from backlog (C4).
 */
export const backlogItemComments = pgTable(
  "backlog_item_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    backlogItemId: uuid("backlog_item_id")
      .notNull()
      .references(() => backlogItems.id, { onDelete: "cascade" }),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    itemIdx: index("backlog_item_comments_item_idx").on(table.backlogItemId),
    companyIdx: index("backlog_item_comments_company_idx").on(table.companyId),
    companyItemCreatedAtIdx: index(
      "backlog_item_comments_company_item_created_at_idx",
    ).on(table.companyId, table.backlogItemId, table.createdAt),
    authorAgentIdx: index("backlog_item_comments_author_agent_idx").on(
      table.authorAgentId,
    ),
  }),
);

export type BacklogItemCommentRow = typeof backlogItemComments.$inferSelect;
export type NewBacklogItemCommentRow =
  typeof backlogItemComments.$inferInsert;
