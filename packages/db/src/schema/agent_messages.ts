import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    fromAgentId: uuid("from_agent_id").notNull().references(() => agents.id),
    toAgentId: uuid("to_agent_id").notNull().references(() => agents.id),
    channel: text("channel").notNull().default("direct"), // direct, broadcast, team
    subject: text("subject"),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    toAgentIdx: index("agent_messages_to_agent_idx").on(table.toAgentId, table.createdAt),
    fromAgentIdx: index("agent_messages_from_agent_idx").on(table.fromAgentId, table.createdAt),
    companyChannelIdx: index("agent_messages_company_channel_idx").on(table.companyId, table.channel),
  }),
);
