CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"claim_text" text NOT NULL,
	"status" text NOT NULL,
	"verified_by" text,
	"last_verified_at" text,
	"expires_at" text,
	"classification" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "claims_status_valid" CHECK (("claims"."status" IN ('APPROVED','UNVERIFIED','EXPIRED','REJECTED'))),
	CONSTRAINT "claims_classification_valid" CHECK (("claims"."classification" IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED')))
);
--> statement-breakpoint
CREATE TABLE "claim_source_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"source_ref_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
-- The composite claim/source_ref -> parent FKs below target
-- claims(project_id, id) and source_refs(project_id, id); Postgres requires
-- the referenced unique indexes to exist before the FK constraints are added,
-- so the supporting unique indexes (source_refs_project_id_id_idx adds the
-- T111 target to the T110 table) are created ahead of the FK ALTERs.
CREATE UNIQUE INDEX "source_refs_project_id_id_idx" ON "source_refs" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_project_id_id_idx" ON "claims" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_source_refs_unique_claim_source_idx" ON "claim_source_refs" USING btree ("claim_id","source_ref_id");--> statement-breakpoint
CREATE INDEX "claim_source_refs_source_ref_idx" ON "claim_source_refs" USING btree ("source_ref_id");--> statement-breakpoint
CREATE INDEX "claims_project_idx" ON "claims" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "claim_source_refs" ADD CONSTRAINT "claim_source_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_source_refs" ADD CONSTRAINT "claim_source_refs_project_id_claim_id_claims_project_id_id_fk" FOREIGN KEY ("project_id","claim_id") REFERENCES "public"."claims"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_source_refs" ADD CONSTRAINT "claim_source_refs_project_id_source_ref_id_source_refs_project_id_id_fk" FOREIGN KEY ("project_id","source_ref_id") REFERENCES "public"."source_refs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;