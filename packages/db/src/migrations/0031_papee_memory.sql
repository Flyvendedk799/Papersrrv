CREATE TABLE IF NOT EXISTS "papee_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"confidence" double precision DEFAULT 0.6 NOT NULL,
	"created_by" text DEFAULT 'observed' NOT NULL,
	"source_message_id" text,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "papee_memory" ADD CONSTRAINT "papee_memory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papee_memory_company_user_idx" ON "papee_memory" USING btree ("company_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papee_memory_company_user_type_idx" ON "papee_memory" USING btree ("company_id","user_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papee_memory_confidence_idx" ON "papee_memory" USING btree ("company_id","confidence");
