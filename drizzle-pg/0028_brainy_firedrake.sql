CREATE TABLE "geo_observation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"project_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"surface_type" text NOT NULL,
	"surface_name" text NOT NULL,
	"fidelity" text NOT NULL,
	"provider" text,
	"engine" text,
	"model" text,
	"model_version" text,
	"web_search" boolean,
	"search_mode" text,
	"market_profile_id" text,
	"repeat_index" integer NOT NULL,
	"application_cache_bypassed" boolean NOT NULL,
	"raw_answer" text,
	"raw_response" text,
	"provider_request_id" text,
	"usage_json" text,
	"started_at" text NOT NULL,
	"finished_at" text,
	"status" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "geo_observation_runs_repeat_index_nonnegative" CHECK ("geo_observation_runs"."repeat_index" >= 0)
);
--> statement-breakpoint
-- The composite prompt/market-profile FKs below target search_prompts(project_id,
-- id) and search_market_profiles(project_id, id); Postgres requires each
-- referenced unique index to exist before the FK constraint is added, so the
-- supporting search_prompts_project_id_id_idx unique index is created ahead of
-- the FK ALTERs (search_market_profiles_project_id_id_idx already exists from
-- 0027). It carries no business uniqueness — id is already the PK.
CREATE UNIQUE INDEX "search_prompts_project_id_id_idx" ON "search_prompts" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "geo_observation_runs" ADD CONSTRAINT "geo_observation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observation_runs" ADD CONSTRAINT "geo_observation_runs_project_id_prompt_id_search_prompts_project_id_id_fk" FOREIGN KEY ("project_id","prompt_id") REFERENCES "public"."search_prompts"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observation_runs" ADD CONSTRAINT "geo_observation_runs_project_id_market_profile_id_search_market_profiles_project_id_id_fk" FOREIGN KEY ("project_id","market_profile_id") REFERENCES "public"."search_market_profiles"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_observation_runs_project_idx" ON "geo_observation_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "geo_observation_runs_batch_idx" ON "geo_observation_runs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "geo_observation_runs_prompt_idx" ON "geo_observation_runs" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "geo_observation_runs_market_profile_idx" ON "geo_observation_runs" USING btree ("market_profile_id");