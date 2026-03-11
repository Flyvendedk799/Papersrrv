CREATE TABLE IF NOT EXISTS "issue_summary_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "issue_id" uuid NOT NULL REFERENCES "issues"("id"),
  "snapshot_id" uuid NOT NULL REFERENCES "agent_file_snapshots"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_issue_summary_files_issue" ON "issue_summary_files" ("issue_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_issue_summary_file" ON "issue_summary_files" ("issue_id", "snapshot_id");
