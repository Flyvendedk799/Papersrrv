import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const agentTaskOutcomes = pgTable(
  "agent_task_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    issueId: uuid("issue_id").references(() => issues.id),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    taskType: text("task_type").notNull(), // bug_fix, feature, refactor, review, documentation, test
    outcome: text("outcome").notNull(), // succeeded, failed, partial
    durationMs: integer("duration_ms"),
    costCents: integer("cost_cents"),
    labels: jsonb("labels").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentTaskTypeIdx: index("agent_task_outcomes_agent_type_idx").on(table.agentId, table.taskType),
    companyTypeIdx: index("agent_task_outcomes_company_type_idx").on(table.companyId, table.taskType),
    issueIdx: index("agent_task_outcomes_issue_idx").on(table.issueId),
  }),
);
