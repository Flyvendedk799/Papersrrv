-- Planning ↔ backlog depth foundation.
--
-- Deepens the integration between planning-kind issues and the
-- resulting backlog_plan. Batched migration covering:
--
-- Wave 1:
--   F1  issues.source_plan_id + source_plan_step_idx
--       (a non-planning work issue can be spawned from a specific
--       step of a plan; enables progress rollup and bidirectional
--       nav between plans and their executing issues)
--
--   F3  backlog_plans.plan_output_json
--       (copy the structured PlanOutput onto the plan row at
--       transfer time so BacklogPlanDetail renders the full
--       document without chasing the source issue)
--
-- Wave 2:
--   F5  backlog_plan_comments table
--       (discussion thread on plans — parallels
--       backlog_item_comments; shape is identical so the existing
--       CommentThread renderer just works)
--
--   F6  backlog_plans.approval_status (+ approval_link optional)
--       ('none' | 'pending' | 'approved' | 'rejected' — when a
--       company requires approval, transfer lands a plan in
--       'pending' state and the existing Approvals infra gates
--       seeding backlog_items)
--
--   F7  backlog_plan_revisions table
--       (versioned snapshots of plan_output_json; every edit
--       writes a new row, UI renders a diff tab)
--
-- Wave 3 bridge:
--   F8  issues.source_backlog_item_id
--       (reverse funnel — a stuck backlog item spawns a planning
--       investigation, bidirectionally linked)
--
-- All changes are idempotent.

-- ── F1 / F8 — issues lineage columns ─────────────────────────────

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "source_plan_id" uuid;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "source_plan_step_idx" integer;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "source_backlog_item_id" uuid;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_source_plan_id_fkey"
    FOREIGN KEY ("source_plan_id") REFERENCES "public"."backlog_plans"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_source_backlog_item_id_fkey"
    FOREIGN KEY ("source_backlog_item_id") REFERENCES "public"."backlog_items"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issues_source_plan_idx" ON "issues" USING btree ("source_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_source_backlog_item_idx" ON "issues" USING btree ("source_backlog_item_id");--> statement-breakpoint

-- ── F3 / F6 — backlog_plans enrichment ───────────────────────────

DO $$ BEGIN
  ALTER TABLE "backlog_plans" ADD COLUMN "plan_output_json" jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "backlog_plans" ADD COLUMN "approval_status" text NOT NULL DEFAULT 'none';
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "backlog_plans_approval_status_idx" ON "backlog_plans" USING btree ("company_id", "approval_status");--> statement-breakpoint

-- ── F5 — backlog_plan_comments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS "backlog_plan_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "backlog_plan_id" uuid NOT NULL REFERENCES "public"."backlog_plans"("id") ON DELETE CASCADE,
  "author_agent_id" uuid REFERENCES "public"."agents"("id"),
  "author_user_id" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "backlog_plan_comments_plan_idx" ON "backlog_plan_comments" USING btree ("backlog_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_plan_comments_company_idx" ON "backlog_plan_comments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_plan_comments_company_plan_created_idx" ON "backlog_plan_comments" USING btree ("company_id", "backlog_plan_id", "created_at");--> statement-breakpoint

-- ── F7 — backlog_plan_revisions ──────────────────────────────────

CREATE TABLE IF NOT EXISTS "backlog_plan_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "backlog_plan_id" uuid NOT NULL REFERENCES "public"."backlog_plans"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "plan_output_json" jsonb,
  "title" text,
  "description" text,
  "summary_of_change" text,
  "edited_by_agent_id" uuid REFERENCES "public"."agents"("id"),
  "edited_by_user_id" text,
  "edited_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "backlog_plan_revisions_plan_version_uq" ON "backlog_plan_revisions" USING btree ("backlog_plan_id", "version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_plan_revisions_company_idx" ON "backlog_plan_revisions" USING btree ("company_id");
