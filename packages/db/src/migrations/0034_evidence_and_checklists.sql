-- Backlog 2.0 B3 / B4, 1.5 B2 / B3 — evidence + handoff checklist tables

CREATE TABLE IF NOT EXISTS "issue_evidence_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_evidence_sets_issue_name_uq" UNIQUE("issue_id","name")
);
--> statement-breakpoint
ALTER TABLE "issue_evidence_sets" ADD CONSTRAINT "issue_evidence_sets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_evidence_sets" ADD CONSTRAINT "issue_evidence_sets_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_evidence_sets_issue_idx" ON "issue_evidence_sets" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_evidence_sets_company_idx" ON "issue_evidence_sets" USING btree ("company_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "issue_evidence_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_evidence_set_items_set_snap_uq" UNIQUE("set_id","snapshot_id")
);
--> statement-breakpoint
ALTER TABLE "issue_evidence_set_items" ADD CONSTRAINT "issue_evidence_set_items_set_id_sets_fk" FOREIGN KEY ("set_id") REFERENCES "public"."issue_evidence_sets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_evidence_set_items" ADD CONSTRAINT "issue_evidence_set_items_snap_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."agent_file_snapshots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_evidence_set_items_set_idx" ON "issue_evidence_set_items" USING btree ("set_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_evidence_set_items_snap_idx" ON "issue_evidence_set_items" USING btree ("snapshot_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "comment_file_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"content_hash" text,
	"snapshot_id" uuid,
	"excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_file_evidence" ADD CONSTRAINT "comment_file_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_file_evidence" ADD CONSTRAINT "comment_file_evidence_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_file_evidence" ADD CONSTRAINT "comment_file_evidence_comment_id_issue_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_file_evidence_comment_idx" ON "comment_file_evidence" USING btree ("comment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_file_evidence_issue_idx" ON "comment_file_evidence" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_file_evidence_company_idx" ON "comment_file_evidence" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_file_evidence_path_idx" ON "comment_file_evidence" USING btree ("company_id","file_path");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "issue_handoff_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"enforcement" text NOT NULL DEFAULT 'advisory',
	"items" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"last_updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_handoff_checklists_issue_uq" UNIQUE("issue_id")
);
--> statement-breakpoint
ALTER TABLE "issue_handoff_checklists" ADD CONSTRAINT "issue_handoff_checklists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_handoff_checklists" ADD CONSTRAINT "issue_handoff_checklists_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_handoff_checklists_company_idx" ON "issue_handoff_checklists" USING btree ("company_id");
