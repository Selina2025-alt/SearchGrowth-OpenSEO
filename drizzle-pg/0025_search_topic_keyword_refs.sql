CREATE TABLE "search_topic_keyword_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"open_seo_keyword_ref" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
-- The composite topic->keyword FK below targets saved_keywords(project_id, id);
-- Postgres requires the referenced unique index to exist before the FK
-- constraint is added, so the supporting unique index is created ahead of the
-- FK ALTERs.
CREATE UNIQUE INDEX "saved_keywords_project_id_id_idx" ON "saved_keywords" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "search_topic_keyword_refs" ADD CONSTRAINT "search_topic_keyword_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_topic_keyword_refs" ADD CONSTRAINT "search_topic_keyword_refs_project_id_topic_id_search_topics_project_id_id_fk" FOREIGN KEY ("project_id","topic_id") REFERENCES "public"."search_topics"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_topic_keyword_refs" ADD CONSTRAINT "search_topic_keyword_refs_project_id_open_seo_keyword_ref_saved_keywords_project_id_id_fk" FOREIGN KEY ("project_id","open_seo_keyword_ref") REFERENCES "public"."saved_keywords"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_topic_keyword_refs_unique_topic_keyword_idx" ON "search_topic_keyword_refs" USING btree ("topic_id","open_seo_keyword_ref");--> statement-breakpoint
CREATE INDEX "search_topic_keyword_refs_keyword_idx" ON "search_topic_keyword_refs" USING btree ("open_seo_keyword_ref");
