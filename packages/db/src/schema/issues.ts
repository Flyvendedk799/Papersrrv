import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { goals } from "./goals.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").references(() => projects.id),
    goalId: uuid("goal_id").references(() => goals.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => issues.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("backlog"),
    priority: text("priority").notNull().default("medium"),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id),
    assigneeUserId: text("assignee_user_id"),
    checkoutRunId: uuid("checkout_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    executionRunId: uuid("execution_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    // Causal linkage (Dossier DAG). Set when a sub-issue is spawned
    // from an explicit source. No FK on createdFromCommentId because
    // issue_comments already imports issues (would create a cycle);
    // writer is responsible for integrity.
    createdFromCommentId: uuid("created_from_comment_id"),
    createdFromRunId: uuid("created_from_run_id").references(() => heartbeatRuns.id, {
      onDelete: "set null",
    }),
    executionAgentNameKey: text("execution_agent_name_key"),
    executionLockedAt: timestamp("execution_locked_at", { withTimezone: true }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    issueNumber: integer("issue_number"),
    identifier: text("identifier"),
    requestDepth: integer("request_depth").notNull().default(0),
    billingCode: text("billing_code"),
    assigneeAdapterOverrides: jsonb("assignee_adapter_overrides").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    /* Planning-issue foundation (migration 0041). kind='planning'
     * issues are investigations that produce a structured plan
     * rather than doing work directly. Shape of planOutputJson is
     * enforced by the PlanOutput Zod schema in @paperclipai/shared;
     * kept `unknown` at the db layer to keep shared types decoupled.
     * transferredToBacklogAt is set by the "Save as Backlog Plan"
     * endpoint and also gates duplicate backlog_plan creation. */
    kind: text("kind").notNull().default("issue"),
    planOutputJson: jsonb("plan_output_json").$type<unknown>(),
    transferredToBacklogAt: timestamp("transferred_to_backlog_at", { withTimezone: true }),
    /* Case-file synthesis cache. Populated by the synthesis endpoint
     * on demand and invalidated by a hash mismatch on inputs. Shape
     * is `SynthesisPayload` from server/src/services/case-synthesis
     * but we keep the column `unknown` here to avoid dragging server
     * types into the shared db package. See 0040_case_synthesis_cache.sql. */
    synthesisJson: jsonb("synthesis_json").$type<unknown>(),
    synthesisVersion: text("synthesis_version"),
    synthesisGeneratedAt: timestamp("synthesis_generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("issues_company_status_idx").on(table.companyId, table.status),
    assigneeStatusIdx: index("issues_company_assignee_status_idx").on(
      table.companyId,
      table.assigneeAgentId,
      table.status,
    ),
    assigneeUserStatusIdx: index("issues_company_assignee_user_status_idx").on(
      table.companyId,
      table.assigneeUserId,
      table.status,
    ),
    parentIdx: index("issues_company_parent_idx").on(table.companyId, table.parentId),
    projectIdx: index("issues_company_project_idx").on(table.companyId, table.projectId),
    projectStatusIdx: index("issues_company_project_status_idx").on(table.companyId, table.projectId, table.status),
    identifierIdx: uniqueIndex("issues_identifier_idx").on(table.identifier),
    companyKindIdx: index("issues_company_kind_idx").on(table.companyId, table.kind),
  }),
);
