import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const agentCapabilities = pgTable(
  "agent_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    capability: text("capability").notNull(), // e.g. "code_review", "testing", "documentation", "frontend", "backend"
    proficiency: text("proficiency").notNull().default("moderate"), // beginner, moderate, expert
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentCapIdx: uniqueIndex("agent_capabilities_agent_cap_idx").on(table.agentId, table.capability),
    companyCapIdx: index("agent_capabilities_company_cap_idx").on(table.companyId, table.capability),
  }),
);
