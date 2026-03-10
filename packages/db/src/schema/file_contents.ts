import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const fileContents = pgTable("file_contents", {
  hash: text("hash").primaryKey(),
  content: text("content").notNull(),
  size: integer("size").notNull(),
  isMarkdown: boolean("is_markdown").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
