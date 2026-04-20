-- Project source foundation.
--
-- A project can now be tied to a codebase. The source can be either
-- a linked GitHub repo or an uploaded local archive (zip). This lets
-- the `/projects` surface absorb what was previously the standalone
-- `/github` tab — one place for "the thing we're building".
--
-- Columns added to `projects`:
--
--   source_kind              — 'none' | 'github' | 'local_archive'
--                              (default 'none')
--
--   github_connection_id     — FK to github_connections when source_kind='github'
--   github_repo_owner        — repo owner login ("acme-co")
--   github_repo_name         — repo name ("webapp")
--   github_default_branch    — cached default branch (e.g. "main")
--
--   local_archive_asset_id   — FK to assets when source_kind='local_archive';
--                              points at the stored zip blob
--   local_archive_filename   — original upload filename (for display)
--   local_archive_size_bytes — total extracted size, for display
--   local_archive_entry_count — number of file entries in the archive
--
--   source_ingested_at       — when the source was linked/uploaded
--   source_metadata_json     — extra metadata (repo stars, languages,
--                              archive root dir, etc.) as JSONB
--
-- A new helper table `project_archive_entries` indexes the contents of
-- an uploaded archive for file browsing. Each row is one file in the
-- zip with its relative path, size, sha1 and content_path pointing at
-- the stored asset. For github sources this table stays empty (files
-- are fetched live from the GitHub API).
--
-- All changes are idempotent.

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "source_kind" text NOT NULL DEFAULT 'none';
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "github_connection_id" uuid;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "github_repo_owner" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "github_repo_name" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "github_default_branch" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "local_archive_asset_id" uuid;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "local_archive_filename" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "local_archive_size_bytes" bigint;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "local_archive_entry_count" integer;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "source_ingested_at" timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects" ADD COLUMN "source_metadata_json" jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects"
    ADD CONSTRAINT "projects_github_connection_id_fkey"
    FOREIGN KEY ("github_connection_id") REFERENCES "public"."github_connections"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "projects"
    ADD CONSTRAINT "projects_local_archive_asset_id_fkey"
    FOREIGN KEY ("local_archive_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "projects_source_kind_idx" ON "projects" USING btree ("source_kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_github_repo_idx" ON "projects" USING btree ("github_connection_id", "github_repo_owner", "github_repo_name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_archive_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "size_bytes" bigint NOT NULL DEFAULT 0,
  "sha1" text,
  "content_type" text,
  "asset_id" uuid REFERENCES "public"."assets"("id") ON DELETE set null,
  "is_directory" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_archive_entries_project_idx" ON "project_archive_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_archive_entries_project_path_idx" ON "project_archive_entries" USING btree ("project_id", "path");
