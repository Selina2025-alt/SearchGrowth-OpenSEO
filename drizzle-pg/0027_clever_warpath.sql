CREATE TABLE "search_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"prompt_text" text NOT NULL,
	"normalized_prompt" text NOT NULL,
	"prompt_type" text NOT NULL,
	"persona" text,
	"buying_stage" text,
	"market_profile_id" text,
	"language" text NOT NULL,
	"business_fit" real NOT NULL,
	"priority" real NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "search_prompts_business_fit_range" CHECK ("search_prompts"."business_fit" >= 0 AND "search_prompts"."business_fit" <= 100),
	CONSTRAINT "search_prompts_priority_range" CHECK ("search_prompts"."priority" >= 0 AND "search_prompts"."priority" <= 100)
);
--> statement-breakpoint
-- The composite market-profile FK below targets search_market_profiles(project_id,
-- id); Postgres requires the referenced unique index to exist before the FK
-- constraint is added, so the supporting unique index is created ahead of the
-- FK ALTERs.
CREATE UNIQUE INDEX "search_market_profiles_project_id_id_idx" ON "search_market_profiles" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "search_prompts" ADD CONSTRAINT "search_prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_prompts" ADD CONSTRAINT "search_prompts_project_id_topic_id_search_topics_project_id_id_fk" FOREIGN KEY ("project_id","topic_id") REFERENCES "public"."search_topics"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_prompts" ADD CONSTRAINT "search_prompts_project_id_market_profile_id_search_market_profiles_project_id_id_fk" FOREIGN KEY ("project_id","market_profile_id") REFERENCES "public"."search_market_profiles"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_prompts_unique_project_normalized_market_version_idx" ON "search_prompts" USING btree ("project_id","normalized_prompt","market_profile_id","version");--> statement-breakpoint
CREATE INDEX "search_prompts_project_idx" ON "search_prompts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "search_prompts_topic_idx" ON "search_prompts" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "search_prompts_market_profile_idx" ON "search_prompts" USING btree ("market_profile_id");