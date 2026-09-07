CREATE TABLE "search_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"canonical_name" text NOT NULL,
	"locale" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"merged_into_topic_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "search_topics_merged_requires_target" CHECK (("search_topics"."status" <> 'MERGED' OR "search_topics"."merged_into_topic_id" IS NOT NULL)),
	CONSTRAINT "search_topics_only_merged_has_target" CHECK (("search_topics"."merged_into_topic_id" IS NULL OR "search_topics"."status" = 'MERGED')),
	CONSTRAINT "search_topics_merge_target_not_self" CHECK (("search_topics"."merged_into_topic_id" IS NULL OR "search_topics"."merged_into_topic_id" <> "search_topics"."id"))
);
--> statement-breakpoint
-- The composite self-reference FK targets (project_id, id); Postgres requires
-- the referenced unique index to exist before the FK constraint is added, so
-- the supporting unique index is created ahead of the FK ALTERs below.
CREATE UNIQUE INDEX "search_topics_project_id_id_idx" ON "search_topics" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "search_topics" ADD CONSTRAINT "search_topics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_topics" ADD CONSTRAINT "search_topics_project_id_merged_into_topic_id_search_topics_project_id_id_fk" FOREIGN KEY ("project_id","merged_into_topic_id") REFERENCES "public"."search_topics"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_topics_project_idx" ON "search_topics" USING btree ("project_id");
