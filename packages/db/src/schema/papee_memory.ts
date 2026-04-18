import { pgTable, uuid, text, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Long-term Papee memory store (PAPEE_TOOLS_PLAN.md §M.1).
 *
 * Per (companyId, userId)-keyed semantic facts that Papee retrieves and
 * injects into the Claude system prompt before every chat call.
 *
 *   type:           preference | relationship | event | goal | quirk
 *                   pet-peeve | nickname | shared-event
 *   confidence:     0..1, ages by -0.05 / week unless reconfirmed
 *   createdBy:      observed | stated | inferred | outcome
 *
 * userId is nullable to support shared company-scoped rows
 * (e.g. shared `event` rows that everyone in the company sees — see M.12).
 */
export const papeeMemory = pgTable(
  "papee_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    type: text("type").notNull(),
    content: text("content").notNull(),
    confidence: doublePrecision("confidence").notNull().default(0.6),
    createdBy: text("created_by").notNull().default("observed"),
    sourceMessageId: text("source_message_id"),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserIdx: index("papee_memory_company_user_idx").on(table.companyId, table.userId),
    companyUserTypeIdx: index("papee_memory_company_user_type_idx").on(table.companyId, table.userId, table.type),
    confidenceIdx: index("papee_memory_confidence_idx").on(table.companyId, table.confidence),
  }),
);

export type PapeeMemoryRow = typeof papeeMemory.$inferSelect;
export type NewPapeeMemoryRow = typeof papeeMemory.$inferInsert;
