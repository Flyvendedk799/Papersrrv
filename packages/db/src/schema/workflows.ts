import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

// ── workflow_templates ──────────────────────────────────────────────────────────

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    stepsJson: jsonb("steps_json").$type<Record<string, unknown>[]>().notNull().default([]),
    edgesJson: jsonb("edges_json").$type<Record<string, unknown>[]>().notNull().default([]),
    isBuiltIn: boolean("is_built_in").notNull().default(false),
    usageCount: integer("usage_count").notNull().default(0),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCategoryIdx: index("workflow_templates_company_category_idx").on(table.companyId, table.category),
  }),
);

// ── workflows ───────────────────────────────────────────────────────────────────

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    triggerType: text("trigger_type").notNull().default("manual"),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    templateId: uuid("template_id").references(() => workflowTemplates.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("workflows_company_status_idx").on(table.companyId, table.status),
    companyTriggerTypeIdx: index("workflows_company_trigger_type_idx").on(table.companyId, table.triggerType),
  }),
);

// ── workflow_steps ──────────────────────────────────────────────────────────────

export const workflowSteps = pgTable(
  "workflow_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    stepOrder: integer("step_order").notNull().default(0),
    stepType: text("step_type").notNull(),
    agentId: uuid("agent_id").references(() => agents.id),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    position: jsonb("position").$type<{ x: number; y: number }>().notNull().default({ x: 0, y: 0 }),
    inputMapping: jsonb("input_mapping").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workflowStepOrderIdx: index("workflow_steps_workflow_step_order_idx").on(table.workflowId, table.stepOrder),
  }),
);

// ── workflow_edges ──────────────────────────────────────────────────────────────

export const workflowEdges = pgTable(
  "workflow_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceStepId: uuid("source_step_id").notNull().references(() => workflowSteps.id, { onDelete: "cascade" }),
    targetStepId: uuid("target_step_id").notNull().references(() => workflowSteps.id, { onDelete: "cascade" }),
    edgeType: text("edge_type").notNull().default("default"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueEdgeIdx: uniqueIndex("workflow_edges_unique_idx").on(
      table.workflowId,
      table.sourceStepId,
      table.targetStepId,
      table.edgeType,
    ),
    sourceStepIdx: index("workflow_edges_source_step_idx").on(table.sourceStepId),
    targetStepIdx: index("workflow_edges_target_step_idx").on(table.targetStepId),
  }),
);

// ── workflow_runs ───────────────────────────────────────────────────────────────

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    triggerType: text("trigger_type").notNull(),
    triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>().notNull().default({}),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    issueId: uuid("issue_id").references(() => issues.id),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => workflowRuns.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("workflow_runs_company_status_idx").on(table.companyId, table.status),
    workflowCreatedAtIdx: index("workflow_runs_workflow_created_at_idx").on(table.workflowId, table.createdAt),
    issueIdx: index("workflow_runs_issue_idx").on(table.issueId),
  }),
);

// ── workflow_step_runs ──────────────────────────────────────────────────────────

export const workflowStepRuns = pgTable(
  "workflow_step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").notNull().references(() => workflowSteps.id),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    heartbeatRunId: uuid("heartbeat_run_id").references(() => heartbeatRuns.id),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueRunStepIdx: uniqueIndex("workflow_step_runs_run_step_idx").on(table.workflowRunId, table.stepId),
    heartbeatRunIdx: index("workflow_step_runs_heartbeat_run_idx").on(table.heartbeatRunId),
  }),
);
