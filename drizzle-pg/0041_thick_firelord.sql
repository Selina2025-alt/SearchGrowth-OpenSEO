CREATE TABLE "content_package_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content_package_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"canonical_markdown" text NOT NULL,
	"canonical_metadata_json" text NOT NULL,
	"web_page_spec_json" text,
	"content_hash" text NOT NULL,
	"gate_status" text NOT NULL,
	"classification" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "content_package_versions_gate_status_valid" CHECK (("content_package_versions"."gate_status" IN ('DRAFT','BLOCKED','PASSED'))),
	CONSTRAINT "content_package_versions_classification_valid" CHECK (("content_package_versions"."classification" IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED')))
);
--> statement-breakpoint
-- The composite content_package_versions -> content_packages FK below targets
-- content_packages(project_id, id); Postgres requires the referenced unique
-- index to exist before the FK constraint is added, so the supporting unique
-- index (content_packages_project_id_id_idx adds the T118 target to the T117
-- content_packages table) is created ahead of the FK ALTERs.
CREATE UNIQUE INDEX "content_packages_project_id_id_idx" ON "content_packages" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "content_package_versions" ADD CONSTRAINT "content_package_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_versions" ADD CONSTRAINT "content_package_versions_project_id_content_package_id_content_packages_project_id_id_fk" FOREIGN KEY ("project_id","content_package_id") REFERENCES "public"."content_packages"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_package_versions_unique_content_package_version_idx" ON "content_package_versions" USING btree ("content_package_id","version_no");
