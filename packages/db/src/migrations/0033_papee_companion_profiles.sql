CREATE TABLE IF NOT EXISTS "papee_companion_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"bond_points" integer DEFAULT 0 NOT NULL,
	"check_in_streak" integer DEFAULT 1 NOT NULL,
	"energy_level" integer DEFAULT 72 NOT NULL,
	"companion_mode" text DEFAULT 'balanced' NOT NULL,
	"active_ritual_id" text,
	"ritual_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_check_in_at" timestamp with time zone,
	"last_mission_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "papee_companion_profiles" ADD CONSTRAINT "papee_companion_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "papee_companion_profiles_company_user_uq" ON "papee_companion_profiles" USING btree ("company_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papee_companion_profiles_company_idx" ON "papee_companion_profiles" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papee_companion_profiles_company_mode_idx" ON "papee_companion_profiles" USING btree ("company_id","companion_mode");

