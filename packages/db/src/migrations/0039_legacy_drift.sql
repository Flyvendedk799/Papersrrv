-- Legacy drift migration. drizzle-kit generate originally proposed
-- these alongside the Dossier causal columns but they predate this
-- work — they're older GitHub-integration + backlog-comments tables
-- that were added to the schema without a migration at the time.
--
-- This migration fills the gap idempotently: `CREATE TABLE IF NOT
-- EXISTS` so dev DBs that already have these tables (manually
-- created at some point) are a no-op, and fresh DBs land in a valid
-- state. FK constraints and indexes are likewise guarded via
-- `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$` so
-- a partial pre-existing state still applies cleanly.

-- ── backlog_item_comments ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "backlog_item_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "backlog_item_id" uuid NOT NULL,
  "author_agent_id" uuid,
  "author_user_id" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "backlog_item_comments" ADD CONSTRAINT "backlog_item_comments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "backlog_item_comments" ADD CONSTRAINT "backlog_item_comments_backlog_item_id_backlog_items_id_fk" FOREIGN KEY ("backlog_item_id") REFERENCES "public"."backlog_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "backlog_item_comments" ADD CONSTRAINT "backlog_item_comments_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "backlog_item_comments_item_idx" ON "backlog_item_comments" USING btree ("backlog_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_company_idx" ON "backlog_item_comments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_company_item_created_at_idx" ON "backlog_item_comments" USING btree ("company_id","backlog_item_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_author_agent_idx" ON "backlog_item_comments" USING btree ("author_agent_id");--> statement-breakpoint

-- ── github_branches ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "github_branches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "repo_id" uuid NOT NULL,
  "name" text NOT NULL,
  "last_commit_sha" text,
  "protected" boolean DEFAULT false NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_branches" ADD CONSTRAINT "github_branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_branches" ADD CONSTRAINT "github_branches_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "github_branches_company_idx" ON "github_branches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_branches_repo_idx" ON "github_branches" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_branches_repo_name_uq" ON "github_branches" USING btree ("repo_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_branches_repo_updated_idx" ON "github_branches" USING btree ("repo_id","updated_at");--> statement-breakpoint

-- ── github_checks ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "github_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "repo_id" uuid NOT NULL,
  "github_check_id" bigint NOT NULL,
  "name" text NOT NULL,
  "head_sha" text NOT NULL,
  "status" text,
  "conclusion" text,
  "html_url" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_checks" ADD CONSTRAINT "github_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_checks" ADD CONSTRAINT "github_checks_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "github_checks_company_idx" ON "github_checks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_checks_repo_idx" ON "github_checks" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_checks_repo_check_uq" ON "github_checks" USING btree ("repo_id","github_check_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_checks_repo_head_sha_idx" ON "github_checks" USING btree ("repo_id","head_sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_checks_repo_updated_idx" ON "github_checks" USING btree ("repo_id","updated_at");--> statement-breakpoint

-- ── github_commits ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "github_commits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "repo_id" uuid NOT NULL,
  "sha" text NOT NULL,
  "branch" text,
  "message" text,
  "author_login" text,
  "author_name" text,
  "authored_at" timestamp with time zone,
  "html_url" text,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "github_commits_company_idx" ON "github_commits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_commits_repo_idx" ON "github_commits" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_commits_repo_sha_uq" ON "github_commits" USING btree ("repo_id","sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_commits_repo_updated_idx" ON "github_commits" USING btree ("repo_id","updated_at");--> statement-breakpoint

-- ── github_releases ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "github_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "repo_id" uuid NOT NULL,
  "github_release_id" bigint NOT NULL,
  "tag_name" text NOT NULL,
  "name" text,
  "draft" boolean DEFAULT false NOT NULL,
  "prerelease" boolean DEFAULT false NOT NULL,
  "body" text,
  "html_url" text,
  "published_at" timestamp with time zone,
  "github_created_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "github_releases_company_idx" ON "github_releases" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_releases_repo_idx" ON "github_releases" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_releases_repo_release_uq" ON "github_releases" USING btree ("repo_id","github_release_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_releases_repo_tag_uq" ON "github_releases" USING btree ("repo_id","tag_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_releases_repo_updated_idx" ON "github_releases" USING btree ("repo_id","updated_at");--> statement-breakpoint

-- ── github_reviews ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "github_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "repo_id" uuid NOT NULL,
  "pull_request_id" uuid NOT NULL,
  "github_review_id" bigint NOT NULL,
  "reviewer_login" text,
  "state" text NOT NULL,
  "body" text,
  "html_url" text,
  "submitted_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_pull_request_id_github_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."github_pull_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "github_reviews_company_idx" ON "github_reviews" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_reviews_repo_idx" ON "github_reviews" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_reviews_pr_idx" ON "github_reviews" USING btree ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_reviews_pr_review_uq" ON "github_reviews" USING btree ("pull_request_id","github_review_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_reviews_pr_updated_idx" ON "github_reviews" USING btree ("pull_request_id","updated_at");
