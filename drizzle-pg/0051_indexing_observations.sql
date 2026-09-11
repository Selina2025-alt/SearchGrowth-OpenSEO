CREATE TABLE "indexing_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"search_engine" text NOT NULL,
	"market_profile_id" text,
	"observation_type" text NOT NULL,
	"status" text NOT NULL,
	"details_json" text NOT NULL,
	"observed_at" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "indexing_observations_search_engine_valid" CHECK (("indexing_observations"."search_engine" IN ('GOOGLE','BAIDU','BING','OTHER'))),
	CONSTRAINT "indexing_observations_details_valid" CHECK ((("indexing_observations"."details_json")::jsonb) IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "indexing_observations" ADD CONSTRAINT "indexing_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexing_observations" ADD CONSTRAINT "indexing_observations_project_id_market_profile_id_search_market_profiles_project_id_id_fk" FOREIGN KEY ("project_id","market_profile_id") REFERENCES "public"."search_market_profiles"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexing_observations_project_idx" ON "indexing_observations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "indexing_observations_market_profile_idx" ON "indexing_observations" USING btree ("market_profile_id");
