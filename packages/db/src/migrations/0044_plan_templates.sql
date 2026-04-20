-- Plan templates (F10).
--
-- A saved PlanOutput shell with optional placeholder variables.
-- Users can "Start from template" when creating a planning-kind
-- issue; variables are substituted at instantiation time.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS "plan_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "plan_output_json" jsonb NOT NULL,
  "variables" jsonb,
  "created_by_agent_id" uuid REFERENCES "public"."agents"("id"),
  "created_by_user_id" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plan_templates_company_idx" ON "plan_templates" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_templates_company_name_uq" ON "plan_templates" USING btree ("company_id", "name");
