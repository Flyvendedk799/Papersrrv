-- Causal linkage columns for the Dossier DAG. All nullable +
-- additive; existing rows keep NULL and the graph falls back to the
-- comments-as-parents heuristic. Writers populate these fields going
-- forward so the visible DAG increasingly reflects real causation.
--
-- drizzle-kit generate also proposed unrelated schema drift
-- (backlog_item_comments, github_*). Those are intentionally stripped
-- from this migration — they belong to separate features and should
-- get their own migrations if the current state is really pending.

ALTER TABLE "issue_comments" ADD COLUMN "reply_to_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "created_from_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "created_from_run_id" uuid;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "triggered_by_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "triggered_by_activity_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "triggered_by_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "requested_by_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "requested_by_run_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_reply_to_comment_id_issue_comments_id_fk" FOREIGN KEY ("reply_to_comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_from_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("created_from_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_triggered_by_comment_id_issue_comments_id_fk" FOREIGN KEY ("triggered_by_comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_comment_id_issue_comments_id_fk" FOREIGN KEY ("requested_by_comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("requested_by_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;
