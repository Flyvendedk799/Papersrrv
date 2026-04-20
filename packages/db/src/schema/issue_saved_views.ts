import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Saved issue views (F4 / migration 0045_issue_depth).
 *
 * A named preset of filters + sort + group + view kind. Per-user
 * when `ownerUserId` is set; shared across the company when null.
 *
 * Filters are stored as a JSON object matching the issue-list
 * filter shape (status, priority, assignee, label, project, etc.).
 */
export const issueSavedViews = pgTable(
  "issue_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id"),
    name: text("name").notNull(),
    description: text("description"),
    filtersJson: jsonb("filters_json").$type<unknown>(),
    sortKey: text("sort_key"),
    groupBy: text("group_by"),
    viewKind: text("view_kind").notNull().default("list"),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("issue_saved_views_company_idx").on(table.companyId),
    ownerIdx: index("issue_saved_views_owner_idx").on(table.companyId, table.ownerUserId),
  }),
);

export type IssueSavedViewRow = typeof issueSavedViews.$inferSelect;
export type NewIssueSavedViewRow = typeof issueSavedViews.$inferInsert;
