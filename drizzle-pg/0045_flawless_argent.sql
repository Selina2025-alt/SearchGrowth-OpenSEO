CREATE TABLE "content_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content_package_version_id" text NOT NULL,
	"platform" text NOT NULL,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"metadata_json" text NOT NULL,
	"body_hash" text NOT NULL,
	"renderer_version" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_project_id_content_package_version_id_content_package_versions_project_id_id_fk" FOREIGN KEY ("project_id","content_package_version_id") REFERENCES "public"."content_package_versions"("project_id","id") ON DELETE cascade ON UPDATE no action;