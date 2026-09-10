CREATE TABLE "content_package_version_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"content_package_version_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
-- The composite content_package_version_claims -> content_package_versions FK
-- below targets content_package_versions(project_id, id); Postgres requires the
-- referenced unique index to exist before the FK constraint is added, so the
-- supporting unique index (content_package_versions_project_id_id_idx adds the
-- T119 target to the T118 content_package_versions table) is created ahead of
-- the FK ALTERs.
CREATE UNIQUE INDEX "content_package_versions_project_id_id_idx" ON "content_package_versions" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "content_package_version_claims" ADD CONSTRAINT "content_package_version_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_version_claims" ADD CONSTRAINT "content_package_version_claims_project_id_content_package_version_id_content_package_versions_project_id_id_fk" FOREIGN KEY ("project_id","content_package_version_id") REFERENCES "public"."content_package_versions"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_package_version_claims" ADD CONSTRAINT "content_package_version_claims_project_id_claim_id_claims_project_id_id_fk" FOREIGN KEY ("project_id","claim_id") REFERENCES "public"."claims"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_package_version_claims_unique_content_package_version_claim_idx" ON "content_package_version_claims" USING btree ("content_package_version_id","claim_id");--> statement-breakpoint
CREATE INDEX "content_package_version_claims_claim_idx" ON "content_package_version_claims" USING btree ("claim_id");
