CREATE TABLE "search_growth_targets" (
	"project_id" text PRIMARY KEY NOT NULL,
	"config_json" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "search_growth_targets_config_valid" CHECK ((("search_growth_targets"."config_json")::jsonb) IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "search_growth_targets" ADD CONSTRAINT "search_growth_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;