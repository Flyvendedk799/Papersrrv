CREATE TABLE IF NOT EXISTS "file_contents" (
  "hash" text PRIMARY KEY NOT NULL,
  "content" text NOT NULL,
  "size" integer NOT NULL,
  "is_markdown" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_file_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "agent_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "file_path" text NOT NULL,
  "content_hash" text,
  "operation" text NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_file_snapshots" ADD CONSTRAINT "agent_file_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_file_snapshots" ADD CONSTRAINT "agent_file_snapshots_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_file_snapshots" ADD CONSTRAINT "agent_file_snapshots_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_file_snapshots" ADD CONSTRAINT "agent_file_snapshots_content_hash_file_contents_hash_fk" FOREIGN KEY ("content_hash") REFERENCES "public"."file_contents"("hash") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_path" ON "agent_file_snapshots" USING btree ("company_id","file_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_run" ON "agent_file_snapshots" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_agent" ON "agent_file_snapshots" USING btree ("company_id","agent_id");
