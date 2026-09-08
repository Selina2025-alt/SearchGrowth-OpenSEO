CREATE TABLE "geo_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parse_id" text NOT NULL,
	"raw_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"position" integer,
	"source_ownership" text NOT NULL,
	"matched_publication_receipt_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geo_citations" ADD CONSTRAINT "geo_citations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_citations" ADD CONSTRAINT "geo_citations_project_id_parse_id_geo_observation_parses_project_id_id_fk" FOREIGN KEY ("project_id","parse_id") REFERENCES "public"."geo_observation_parses"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_citations_parse_idx" ON "geo_citations" USING btree ("parse_id");