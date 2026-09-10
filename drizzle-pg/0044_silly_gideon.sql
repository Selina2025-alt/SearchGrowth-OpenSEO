CREATE TABLE "content_package_version_media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content_package_version_id" text NOT NULL,
	"media_asset_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_package_version_media_assets" ADD CONSTRAINT "content_package_version_media_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_version_media_assets" ADD CONSTRAINT "content_package_version_media_assets_project_id_content_package_version_id_content_package_versions_project_id_id_fk" FOREIGN KEY ("project_id","content_package_version_id") REFERENCES "public"."content_package_versions"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_version_media_assets" ADD CONSTRAINT "content_package_version_media_assets_project_id_media_asset_id_media_assets_project_id_id_fk" FOREIGN KEY ("project_id","media_asset_id") REFERENCES "public"."media_assets"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_package_version_media_assets_unique_content_package_version_media_asset_idx" ON "content_package_version_media_assets" USING btree ("content_package_version_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "content_package_version_media_assets_media_asset_idx" ON "content_package_version_media_assets" USING btree ("media_asset_id");