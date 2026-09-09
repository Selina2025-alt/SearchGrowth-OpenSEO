CREATE TABLE "published_media_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"media_asset_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text,
	"external_media_id" text,
	"public_url" text,
	"sha256" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
-- The composite published_media_refs -> media_assets FK below targets
-- media_assets(project_id, id); Postgres requires the referenced unique index to
-- exist before the FK constraint is added, so the supporting unique index
-- (media_assets_project_id_id_idx adds the T115 target to the T114 table) is
-- created ahead of the FK ALTERs.
CREATE UNIQUE INDEX "media_assets_project_id_id_idx" ON "media_assets" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "published_media_refs_project_idx" ON "published_media_refs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "published_media_refs_media_asset_idx" ON "published_media_refs" USING btree ("media_asset_id");--> statement-breakpoint
ALTER TABLE "published_media_refs" ADD CONSTRAINT "published_media_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_media_refs" ADD CONSTRAINT "published_media_refs_project_id_media_asset_id_media_assets_project_id_id_fk" FOREIGN KEY ("project_id","media_asset_id") REFERENCES "public"."media_assets"("project_id","id") ON DELETE cascade ON UPDATE no action;
