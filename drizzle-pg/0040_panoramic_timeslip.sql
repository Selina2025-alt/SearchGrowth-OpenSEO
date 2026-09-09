CREATE TABLE "content_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"opportunity_id" text,
	"title" text NOT NULL,
	"locale" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
-- The composite content_packages -> search_growth_opportunities FK below targets
-- search_growth_opportunities(project_id, id); Postgres requires the referenced
-- unique index to exist before the FK constraint is added, so the supporting
-- unique index (search_growth_opportunities_project_id_id_idx adds the T117
-- target to the T109 table) is created ahead of the FK ALTERs. The
-- content_packages -> search_topics composite FK needs no new parent index
-- (search_topics_project_id_id_idx already exists from the T101 migration).
CREATE UNIQUE INDEX "search_growth_opportunities_project_id_id_idx" ON "search_growth_opportunities" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "content_packages_project_idx" ON "content_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "content_packages_topic_idx" ON "content_packages" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "content_packages_opportunity_idx" ON "content_packages" USING btree ("opportunity_id");--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_project_id_topic_id_search_topics_project_id_id_fk" FOREIGN KEY ("project_id","topic_id") REFERENCES "public"."search_topics"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_project_id_opportunity_id_search_growth_opportunities_project_id_id_fk" FOREIGN KEY ("project_id","opportunity_id") REFERENCES "public"."search_growth_opportunities"("project_id","id") ON DELETE cascade ON UPDATE no action;
