ALTER TABLE "geo_entity_mentions" DROP CONSTRAINT "geo_entity_mentions_parse_id_geo_observation_parses_id_fk";
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" DROP CONSTRAINT "geo_entity_mentions_entity_id_tracked_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "geo_observation_parses" DROP CONSTRAINT "geo_observation_parses_run_id_geo_observation_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "geo_observation_parses" ADD COLUMN "project_id" text;
--> statement-breakpoint
UPDATE "geo_observation_parses" AS "p" SET "project_id" = "r"."project_id" FROM "geo_observation_runs" AS "r" WHERE "r"."id" = "p"."run_id";
--> statement-breakpoint
ALTER TABLE "geo_observation_parses" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ADD COLUMN "project_id" text;
--> statement-breakpoint
UPDATE "geo_entity_mentions" AS "m" SET "project_id" = "p"."project_id" FROM "geo_observation_parses" AS "p" WHERE "p"."id" = "m"."parse_id";
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "geo_observation_runs_project_id_id_idx" ON "geo_observation_runs" USING btree ("project_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "geo_observation_parses_project_id_id_idx" ON "geo_observation_parses" USING btree ("project_id","id");
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ADD CONSTRAINT "geo_entity_mentions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ADD CONSTRAINT "geo_entity_mentions_project_id_parse_id_geo_observation_parses_project_id_id_fk" FOREIGN KEY ("project_id","parse_id") REFERENCES "public"."geo_observation_parses"("project_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ADD CONSTRAINT "geo_entity_mentions_project_id_entity_id_tracked_entities_project_id_id_fk" FOREIGN KEY ("project_id","entity_id") REFERENCES "public"."tracked_entities"("project_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "geo_observation_parses" ADD CONSTRAINT "geo_observation_parses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "geo_observation_parses" ADD CONSTRAINT "geo_observation_parses_project_id_run_id_geo_observation_runs_project_id_id_fk" FOREIGN KEY ("project_id","run_id") REFERENCES "public"."geo_observation_runs"("project_id","id") ON DELETE cascade ON UPDATE no action;
