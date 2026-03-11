CREATE TABLE IF NOT EXISTS "company_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_skills" ADD CONSTRAINT "company_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_skills_company_idx" ON "company_skills" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_skills_company_name_idx" ON "company_skills" USING btree ("company_id","name");
