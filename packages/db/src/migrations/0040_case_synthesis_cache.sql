-- Case-file synthesis cache. Stores the computed synthesis for an
-- issue (the new /issues/:id Dossier reads from here) alongside a
-- hash of the inputs used to produce it. The hash acts as both the
-- cache key and invalidation signal: when any input (comments,
-- runs, activity, sub-issues, status) changes, the hash changes,
-- and the next read re-synthesises.
--
-- Shape of `synthesis_json`:
--   {
--     abstract: string,             // 1–2 sentence plain-English outcome
--     artifacts: Array<{...}>,      // files changed / PRs / run outputs
--     graph: { nodes: [...], edges: [...] },  // fan-out/fan-in tree
--     generator: "template" | "llm",
--     schemaVersion: number
--   }
--
-- Idempotent via `IF NOT EXISTS`. Safe to re-apply against databases
-- that already have the columns from a previous drift migration.

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "synthesis_json" jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "synthesis_version" text;
EXCEPTION WHEN duplicate_column THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "synthesis_generated_at" timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN null; END $$;
