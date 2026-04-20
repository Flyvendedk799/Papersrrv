-- Issue depth foundation.
--
-- Adds PM primitives that were missing from the issue surface:
--
--   F2  issues.due_date + estimate + rank
--       (due_date: optional target ts; estimate: xs/s/m/l/xl tier
--        hint; rank: fractional string for kanban reorder-within-
--        column persistence — parallels backlog_items.rank)
--
--   F6  issue_links table
--       (blocks / blocked_by / duplicates / duplicated_by /
--        relates_to. Inverse kinds are maintained server-side via
--        a single insert plus mirror insert.)
--
--   F7  issue_watchers table
--       (user or agent can watch an issue; creator+assignee auto-
--        watched; watchers receive notifications.)
--
--   F4  issue_saved_views table
--       (named filter/sort/group preset, per-user or shared.)
--
--   F5  issue_templates table
--       (reusable skeleton for creating issues; parallels
--        plan_templates from 0044.)
--
-- issue_comments.replyToCommentId already exists from an earlier
-- migration — F8 (comment threading) is UI-only.
--
-- All changes are idempotent.

-- ── F2 — issues depth columns ────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "due_date" timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "estimate" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "rank" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issues_company_due_idx" ON "issues" USING btree ("company_id", "due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_company_status_rank_idx" ON "issues" USING btree ("company_id", "status", "rank");--> statement-breakpoint

-- ── F6 — issue_links ─────────────────────────────────────────────
-- Already exists from migration 0032_issue_links. The existing
-- column is named `relation` (not `kind`); this pass reuses the
-- table and just documents the accepted values:
--   'blocks' | 'blocked_by' | 'duplicates' | 'duplicated_by' | 'relates_to'
-- The server service maintains the inverse row (blocks ↔ blocked_by,
-- duplicates ↔ duplicated_by) on create/delete.
--

-- ── F7 — issue_watchers ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "issue_watchers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "issue_id" uuid NOT NULL REFERENCES "public"."issues"("id") ON DELETE CASCADE,
  "user_id" text,
  "agent_id" uuid REFERENCES "public"."agents"("id") ON DELETE CASCADE,
  "added_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_watchers_issue_idx" ON "issue_watchers" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_watchers_company_user_idx" ON "issue_watchers" USING btree ("company_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_watchers_company_agent_idx" ON "issue_watchers" USING btree ("company_id", "agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_watchers_issue_user_uq" ON "issue_watchers" USING btree ("issue_id", "user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_watchers_issue_agent_uq" ON "issue_watchers" USING btree ("issue_id", "agent_id") WHERE "agent_id" IS NOT NULL;--> statement-breakpoint

-- ── F4 — issue_saved_views ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "issue_saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "owner_user_id" text,
  "name" text NOT NULL,
  "description" text,
  "filters_json" jsonb,
  "sort_key" text,
  "group_by" text,
  "view_kind" text NOT NULL DEFAULT 'list',
  "is_pinned" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_saved_views_company_idx" ON "issue_saved_views" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_saved_views_owner_idx" ON "issue_saved_views" USING btree ("company_id", "owner_user_id");--> statement-breakpoint

-- ── F5 — issue_templates ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "issue_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "title_template" text NOT NULL,
  "body_template" text,
  "default_priority" text,
  "default_kind" text NOT NULL DEFAULT 'issue',
  "default_assignee_agent_id" uuid REFERENCES "public"."agents"("id"),
  "default_assignee_user_id" text,
  "default_project_id" uuid REFERENCES "public"."projects"("id") ON DELETE SET NULL,
  "default_label_ids" jsonb,
  "variables" jsonb,
  "created_by_agent_id" uuid REFERENCES "public"."agents"("id"),
  "created_by_user_id" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_templates_company_idx" ON "issue_templates" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_templates_company_name_uq" ON "issue_templates" USING btree ("company_id", "name");
