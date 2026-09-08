CREATE TABLE "geo_observation_parses" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"parser_version" text NOT NULL,
	"parse_status" text NOT NULL,
	"accuracy_status" text,
	"parsed_at" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geo_observation_parses" ADD CONSTRAINT "geo_observation_parses_run_id_geo_observation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_observation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geo_observation_parses_run_version_unique_idx" ON "geo_observation_parses" USING btree ("run_id","parser_version");