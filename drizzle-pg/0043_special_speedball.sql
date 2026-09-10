CREATE TABLE "content_package_version_source_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content_package_version_id" text NOT NULL,
	"source_ref_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_package_version_source_refs" ADD CONSTRAINT "content_package_version_source_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_version_source_refs" ADD CONSTRAINT "content_package_version_source_refs_project_id_content_package_version_id_content_package_versions_project_id_id_fk" FOREIGN KEY ("project_id","content_package_version_id") REFERENCES "public"."content_package_versions"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_version_source_refs" ADD CONSTRAINT "content_package_version_source_refs_project_id_source_ref_id_source_refs_project_id_id_fk" FOREIGN KEY ("project_id","source_ref_id") REFERENCES "public"."source_refs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_package_version_source_refs_unique_content_package_version_source_ref_idx" ON "content_package_version_source_refs" USING btree ("content_package_version_id","source_ref_id");--> statement-breakpoint
CREATE INDEX "content_package_version_source_refs_source_ref_idx" ON "content_package_version_source_refs" USING btree ("source_ref_id");