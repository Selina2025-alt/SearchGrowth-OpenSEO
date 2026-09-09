CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"media_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"rights_status" text NOT NULL,
	"classification" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "media_assets_media_type_valid" CHECK (("media_assets"."media_type" IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','OTHER'))),
	CONSTRAINT "media_assets_rights_status_valid" CHECK (("media_assets"."rights_status" IN ('OWNED','LICENSED','APPROVED_EXTERNAL','UNKNOWN'))),
	CONSTRAINT "media_assets_classification_valid" CHECK (("media_assets"."classification" IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED')))
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_project_idx" ON "media_assets" USING btree ("project_id");