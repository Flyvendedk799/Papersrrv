-- Backlog 4.0 foundation — GitHub Tab (connections + minimal cache)
-- Additive and company-scoped. Only github_* tables. Other tables that
-- appear in the 0035 snapshot diff (comment_file_evidence, issue_links,
-- issue_evidence_*, issue_handoff_checklists, papee_*, backlog_*) are
-- owned by earlier migrations (0031-0034); this migration intentionally
-- does not redeclare them.

CREATE TABLE IF NOT EXISTS "github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"auth_type" text DEFAULT 'pat' NOT NULL,
	"secret_id" uuid,
	"account_login" text,
	"scopes_hint" text,
	"metadata" jsonb,
	"last_verified_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"default_branch" text,
	"visibility" text,
	"permissions" jsonb,
	"etag" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"github_pr_id" bigint NOT NULL,
	"number" bigint NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"merged" boolean DEFAULT false NOT NULL,
	"mergeable" boolean,
	"author_login" text,
	"head_ref" text,
	"base_ref" text,
	"url" text,
	"body" text,
	"labels" jsonb,
	"github_updated_at" timestamp with time zone,
	"github_created_at" timestamp with time zone,
	"etag" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_secret_id_company_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_connections_company_idx" ON "github_connections" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_connections_company_account_uq" ON "github_connections" USING btree ("company_id","auth_type","account_login");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_repos_company_idx" ON "github_repos" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_repos_connection_idx" ON "github_repos" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_repos_company_repo_uq" ON "github_repos" USING btree ("company_id","owner","repo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_prs_company_idx" ON "github_pull_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_prs_repo_idx" ON "github_pull_requests" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_prs_repo_number_uq" ON "github_pull_requests" USING btree ("repo_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_prs_state_idx" ON "github_pull_requests" USING btree ("company_id","state");
