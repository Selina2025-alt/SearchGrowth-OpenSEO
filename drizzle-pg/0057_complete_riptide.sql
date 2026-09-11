CREATE TABLE "platform_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"release_target_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"draft_url" text,
	"content_hash" text NOT NULL,
	"asset_hashes_json" text NOT NULL,
	"stager_id" text NOT NULL,
	"stager_version" text NOT NULL,
	"verified_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "platform_drafts_asset_hashes_valid" CHECK ((("platform_drafts"."asset_hashes_json")::jsonb) IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "platform_drafts" ADD CONSTRAINT "platform_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_drafts" ADD CONSTRAINT "platform_drafts_project_id_release_target_id_release_targets_project_id_id_fk" FOREIGN KEY ("project_id","release_target_id") REFERENCES "public"."release_targets"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_drafts_platform_account_id_draft_id_idx" ON "platform_drafts" USING btree ("platform","account_id","draft_id");