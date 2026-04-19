-- Planning-issue foundation.
--
-- Adds three columns to `issues`:
--
--   kind                      — "issue" (default) or "planning". Planning
--                               issues are meant to produce a structured
--                               plan document instead of doing the work
--                               directly; on completion they get
--                               transferred into backlog_plans.
--
--   plan_output_json          — the final plan artifact, enforced shape
--                               validated client-side + server-side by
--                               the shared PlanOutput Zod schema. Null
--                               until the planning issue converges.
--
--   transferred_to_backlog_at — timestamp the user clicked "Save as
--                               Backlog Plan" on this issue. Idempotent
--                               marker so we don't create duplicate
--                               backlog plans on retry.
--
-- Adds one column to `backlog_plans`:
--
--   source_issue_id           — back-reference to the planning issue that
--                               produced this plan. Powers the "From
--                               plans" section on the Backlog page and
--                               prevents duplicate plan creation.
--
-- All changes are idempotent.

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "kind" text NOT NULL DEFAULT 'issue';
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "plan_output_json" jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "transferred_to_backlog_at" timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "backlog_plans" ADD COLUMN "source_issue_id" uuid;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "backlog_plans"
    ADD CONSTRAINT "backlog_plans_source_issue_id_fkey"
    FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "backlog_plans_source_issue_idx" ON "backlog_plans" USING btree ("source_issue_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issues_company_kind_idx" ON "issues" USING btree ("company_id", "kind");
