import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const knowledgeBaseEntries = pgTable(
  "knowledge_base_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("general"), // general, code_pattern, debugging, architecture, tool_usage
    tags: jsonb("tags").$type<string[]>().default([]),
    visibility: text("visibility").notNull().default("company"), // company, team, private
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCategoryIdx: index("kb_company_category_idx").on(table.companyId, table.category),
    companySearchIdx: index("kb_company_search_idx").on(table.companyId, table.createdAt),
  }),
);
