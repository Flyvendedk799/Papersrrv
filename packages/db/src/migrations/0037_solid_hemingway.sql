CREATE TABLE "github_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"name" text NOT NULL,
	"last_commit_sha" text,
	"protected" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_checks" (
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
);
--> statement-breakpoint
CREATE TABLE "github_commits" (
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
);
--> statement-breakpoint
CREATE TABLE "github_releases" (
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
);
--> statement-breakpoint
CREATE TABLE "github_reviews" (
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
);
--> statement-breakpoint
ALTER TABLE "github_branches" ADD CONSTRAINT "github_branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_branches" ADD CONSTRAINT "github_branches_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_checks" ADD CONSTRAINT "github_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_checks" ADD CONSTRAINT "github_checks_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_reviews" ADD CONSTRAINT "github_reviews_pull_request_id_github_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."github_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_branches_company_idx" ON "github_branches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "github_branches_repo_idx" ON "github_branches" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_branches_repo_name_uq" ON "github_branches" USING btree ("repo_id","name");--> statement-breakpoint
CREATE INDEX "github_branches_repo_updated_idx" ON "github_branches" USING btree ("repo_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_checks_company_idx" ON "github_checks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "github_checks_repo_idx" ON "github_checks" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_checks_repo_check_uq" ON "github_checks" USING btree ("repo_id","github_check_id");--> statement-breakpoint
CREATE INDEX "github_checks_repo_head_sha_idx" ON "github_checks" USING btree ("repo_id","head_sha");--> statement-breakpoint
CREATE INDEX "github_checks_repo_updated_idx" ON "github_checks" USING btree ("repo_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_commits_company_idx" ON "github_commits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "github_commits_repo_idx" ON "github_commits" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_commits_repo_sha_uq" ON "github_commits" USING btree ("repo_id","sha");--> statement-breakpoint
CREATE INDEX "github_commits_repo_updated_idx" ON "github_commits" USING btree ("repo_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_releases_company_idx" ON "github_releases" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "github_releases_repo_idx" ON "github_releases" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_releases_repo_release_uq" ON "github_releases" USING btree ("repo_id","github_release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_releases_repo_tag_uq" ON "github_releases" USING btree ("repo_id","tag_name");--> statement-breakpoint
CREATE INDEX "github_releases_repo_updated_idx" ON "github_releases" USING btree ("repo_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_reviews_company_idx" ON "github_reviews" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "github_reviews_repo_idx" ON "github_reviews" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "github_reviews_pr_idx" ON "github_reviews" USING btree ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_reviews_pr_review_uq" ON "github_reviews" USING btree ("pull_request_id","github_review_id");--> statement-breakpoint
CREATE INDEX "github_reviews_pr_updated_idx" ON "github_reviews" USING btree ("pull_request_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_prs_repo_updated_idx" ON "github_pull_requests" USING btree ("repo_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_repos_company_updated_idx" ON "github_repos" USING btree ("company_id","updated_at");