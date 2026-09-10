CREATE TABLE "release_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"release_bundle_id" text NOT NULL,
	"content_variant_id" text NOT NULL,
	"platform" text NOT NULL,
	"target_intent" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"scheduled_at" text,
	"dependency_target_id" text,
	"utm_url" text,
	"target_hash" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "release_targets_target_intent_valid" CHECK (("release_targets"."target_intent" IN ('DRAFT','PUBLIC','SUBMIT_FOR_REVIEW','PAID_SUBMIT')))
);
--> statement-breakpoint
ALTER TABLE "release_targets" ADD CONSTRAINT "release_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_targets" ADD CONSTRAINT "release_targets_project_id_release_bundle_id_release_bundles_project_id_id_fk" FOREIGN KEY ("project_id","release_bundle_id") REFERENCES "public"."release_bundles"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_targets" ADD CONSTRAINT "release_targets_project_id_content_variant_id_content_variants_project_id_id_fk" FOREIGN KEY ("project_id","content_variant_id") REFERENCES "public"."content_variants"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_targets" ADD CONSTRAINT "release_targets_project_id_dependency_target_id_release_targets_project_id_id_fk" FOREIGN KEY ("project_id","dependency_target_id") REFERENCES "public"."release_targets"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_targets_project_id_id_idx" ON "release_targets" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_bundles_project_id_id_idx" ON "release_bundles" USING btree ("project_id","id");