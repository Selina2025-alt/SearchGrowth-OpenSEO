CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"opportunity_id" text,
	"release_bundle_id" text,
	"title" text NOT NULL,
	"hypothesis" text NOT NULL,
	"status" text NOT NULL,
	"activation_policy" text NOT NULL,
	"activation_at" text,
	"target_keyword_refs_json" text NOT NULL,
	"target_prompt_refs_json" text NOT NULL,
	"target_surface_refs_json" text NOT NULL,
	"recheck_policy_json" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "experiments_activation_policy_valid" CHECK (("experiments"."activation_policy" IN ('FIRST_REQUIRED_PUBLIC','ALL_REQUIRED_TERMINAL'))),
	CONSTRAINT "experiments_target_keyword_refs_valid" CHECK ((("experiments"."target_keyword_refs_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiments_target_prompt_refs_valid" CHECK ((("experiments"."target_prompt_refs_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiments_target_surface_refs_valid" CHECK ((("experiments"."target_surface_refs_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiments_recheck_policy_valid" CHECK ((("experiments"."recheck_policy_json")::jsonb) IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_project_id_topic_id_search_topics_project_id_id_fk" FOREIGN KEY ("project_id","topic_id") REFERENCES "public"."search_topics"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_project_id_opportunity_id_search_growth_opportunities_project_id_id_fk" FOREIGN KEY ("project_id","opportunity_id") REFERENCES "public"."search_growth_opportunities"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_project_id_release_bundle_id_release_bundles_project_id_id_fk" FOREIGN KEY ("project_id","release_bundle_id") REFERENCES "public"."release_bundles"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiments_project_idx" ON "experiments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "experiments_topic_idx" ON "experiments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "experiments_opportunity_idx" ON "experiments" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "experiments_release_bundle_idx" ON "experiments" USING btree ("release_bundle_id");