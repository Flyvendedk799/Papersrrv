CREATE TABLE IF NOT EXISTS "backlog_item_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"backlog_item_id" uuid NOT NULL,
	"author_agent_id" uuid,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlog_item_comments" ADD CONSTRAINT "backlog_item_comments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item_comments" ADD CONSTRAINT "backlog_item_comments_backlog_item_id_backlog_items_id_fk" FOREIGN KEY ("backlog_item_id") REFERENCES "public"."backlog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item_comments" ADD CONSTRAINT "backlog_item_comments_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_item_idx" ON "backlog_item_comments" USING btree ("backlog_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_company_idx" ON "backlog_item_comments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_company_item_created_at_idx" ON "backlog_item_comments" USING btree ("company_id","backlog_item_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlog_item_comments_author_agent_idx" ON "backlog_item_comments" USING btree ("author_agent_id");
