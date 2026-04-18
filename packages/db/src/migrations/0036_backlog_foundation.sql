CREATE TABLE IF NOT EXISTS "backlog_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'custom' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"project_id" uuid,
	"goal_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"rank" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"created_by_agent_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_plans_company_title_uq" UNIQUE("company_id","title")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backlog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"priority" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_ref" jsonb,
	"author_user_id" text,
	"author_agent_id" uuid,
	"owner_user_id" text,
	"owner_agent_id" uuid,
	"project_id" uuid,
	"goal_id" uuid,
	"plan_id" uuid,
	"promoted_issue_id" uuid,
	"rank" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backlog_item_labels" (
	"backlog_item_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_item_labels_pk" PRIMARY KEY("backlog_item_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "backlog_plans" ADD CONSTRAINT "backlog_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_plans" ADD CONSTRAINT "backlog_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_plans" ADD CONSTRAINT "backlog_plans_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_plan_id_backlog_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."backlog_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_promoted_issue_id_issues_id_fk" FOREIGN KEY ("promoted_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item_labels" ADD CONSTRAINT "backlog_item_labels_backlog_item_id_backlog_items_id_fk" FOREIGN KEY ("backlog_item_id") REFERENCES "public"."backlog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item_labels" ADD CONSTRAINT "backlog_item_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item_labels" ADD CONSTRAINT "backlog_item_labels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_plans_company_idx" ON "backlog_plans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_plans_company_status_idx" ON "backlog_plans" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_items_company_idx" ON "backlog_items" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_items_company_status_idx" ON "backlog_items" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_items_company_source_idx" ON "backlog_items" USING btree ("company_id","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_items_company_plan_idx" ON "backlog_items" USING btree ("company_id","plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_items_company_project_idx" ON "backlog_items" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_items_company_rank_idx" ON "backlog_items" USING btree ("company_id","rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_labels_item_idx" ON "backlog_item_labels" USING btree ("backlog_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_labels_label_idx" ON "backlog_item_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_labels_company_idx" ON "backlog_item_labels" USING btree ("company_id");
