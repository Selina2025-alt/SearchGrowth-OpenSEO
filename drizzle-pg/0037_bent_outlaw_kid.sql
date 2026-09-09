CREATE TABLE "claim_allowed_languages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"language" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_allowed_languages" ADD CONSTRAINT "claim_allowed_languages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_allowed_languages" ADD CONSTRAINT "claim_allowed_languages_project_id_claim_id_claims_project_id_id_fk" FOREIGN KEY ("project_id","claim_id") REFERENCES "public"."claims"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_allowed_languages_unique_claim_language_idx" ON "claim_allowed_languages" USING btree ("claim_id","language");--> statement-breakpoint
CREATE INDEX "claim_allowed_languages_language_idx" ON "claim_allowed_languages" USING btree ("language");