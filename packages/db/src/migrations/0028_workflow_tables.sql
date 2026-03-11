-- Workflow tables
CREATE TABLE IF NOT EXISTS "workflow_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "steps_json" jsonb NOT NULL DEFAULT '[]',
  "edges_json" jsonb NOT NULL DEFAULT '[]',
  "is_built_in" boolean NOT NULL DEFAULT false,
  "usage_count" integer NOT NULL DEFAULT 0,
  "created_by_user_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'draft',
  "trigger_type" text NOT NULL DEFAULT 'manual',
  "trigger_config" jsonb NOT NULL DEFAULT '{}',
  "template_id" uuid REFERENCES "workflow_templates"("id") ON DELETE SET NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_by_user_id" text,
  "created_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "step_order" integer NOT NULL DEFAULT 0,
  "step_type" text NOT NULL,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "config" jsonb NOT NULL DEFAULT '{}',
  "position" jsonb NOT NULL DEFAULT '{"x":0,"y":0}',
  "input_mapping" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "source_step_id" uuid NOT NULL REFERENCES "workflow_steps"("id") ON DELETE CASCADE,
  "target_step_id" uuid NOT NULL REFERENCES "workflow_steps"("id") ON DELETE CASCADE,
  "edge_type" text NOT NULL DEFAULT 'default',
  "label" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'queued',
  "trigger_type" text NOT NULL,
  "trigger_payload" jsonb NOT NULL DEFAULT '{}',
  "context" jsonb NOT NULL DEFAULT '{}',
  "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
  "parent_run_id" uuid REFERENCES "workflow_runs"("id") ON DELETE SET NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "error" text,
  "created_by_user_id" text,
  "created_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_step_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "step_id" uuid NOT NULL REFERENCES "workflow_steps"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "heartbeat_run_id" uuid REFERENCES "heartbeat_runs"("id") ON DELETE SET NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "retry_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Workflow table indexes
CREATE INDEX IF NOT EXISTS "workflows_company_status_idx" ON "workflows" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_company_trigger_idx" ON "workflows" ("company_id", "trigger_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_steps_workflow_order_idx" ON "workflow_steps" ("workflow_id", "step_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_edges_source_idx" ON "workflow_edges" ("source_step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_edges_target_idx" ON "workflow_edges" ("target_step_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_edges_unique_idx" ON "workflow_edges" ("workflow_id", "source_step_id", "target_step_id", "edge_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_company_status_idx" ON "workflow_runs" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_created_idx" ON "workflow_runs" ("workflow_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_issue_idx" ON "workflow_runs" ("issue_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_step_runs_unique_idx" ON "workflow_step_runs" ("workflow_run_id", "step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_runs_heartbeat_idx" ON "workflow_step_runs" ("heartbeat_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_runs_status_idx" ON "workflow_step_runs" ("workflow_run_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_templates_company_category_idx" ON "workflow_templates" ("company_id", "category");
--> statement-breakpoint
-- Performance indexes for existing tables
CREATE INDEX IF NOT EXISTS "issue_comments_company_issue_created_idx" ON "issue_comments" ("company_id", "issue_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_run_events_company_agent_created_idx" ON "heartbeat_run_events" ("company_id", "agent_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_events_company_agent_occurred_idx" ON "cost_events" ("company_id", "agent_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_entity_idx" ON "activity_log" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_file_snapshots_company_path_idx" ON "agent_file_snapshots" ("company_id", "file_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_file_snapshots_run_idx" ON "agent_file_snapshots" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_runs_agent_status_idx" ON "heartbeat_runs" ("agent_id", "status");
