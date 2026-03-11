import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const auditLogEntries = pgTable(
  "audit_log_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    actorType: text("actor_type").notNull(), // user, agent, system, api_key
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(), // e.g. "agent.created", "secret.rotated", "issue.deleted", "auth.login"
    resourceType: text("resource_type").notNull(), // agent, issue, secret, company, workflow, etc.
    resourceId: text("resource_id"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    severity: text("severity").notNull().default("info"), // info, warning, critical
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyActionIdx: index("audit_log_company_action_idx").on(table.companyId, table.action, table.createdAt),
    companyCreatedIdx: index("audit_log_company_created_idx").on(table.companyId, table.createdAt),
    actorIdx: index("audit_log_actor_idx").on(table.actorType, table.actorId),
    resourceIdx: index("audit_log_resource_idx").on(table.resourceType, table.resourceId),
    severityIdx: index("audit_log_severity_idx").on(table.companyId, table.severity),
  }),
);
