import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const fileLocks = pgTable(
  "file_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    filePath: text("file_path").notNull(),
    reason: text("reason"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    companyPathIdx: index("file_locks_company_path_idx").on(table.companyId, table.filePath),
    agentIdx: index("file_locks_agent_idx").on(table.agentId),
    expiresIdx: index("file_locks_expires_idx").on(table.expiresAt),
  }),
);
