CREATE TABLE "publication_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"publishing_job_id" text NOT NULL,
	"release_target_id" text NOT NULL,
	"platform" text NOT NULL,
	"executor_id" text NOT NULL,
	"executor_version" text NOT NULL,
	"external_draft_id" text,
	"external_task_id" text,
	"external_content_id" text,
	"public_url" text,
	"content_hash" text NOT NULL,
	"media_hashes_json" text NOT NULL,
	"status" text NOT NULL,
	"submitted_at" text,
	"published_at" text,
	"verified_at" text,
	"verification_json" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "publication_receipts_status_valid" CHECK (("publication_receipts"."status" IN ('PLANNED','PREFLIGHT','EXECUTION_READY','STAGING_DRAFT','DRAFT_CREATED','DRAFT_VERIFIED','FINALIZE_READY','FINALIZING','VALIDATING','DRY_RUN_PASSED','SUBMITTING','ACCEPTED_REMOTE_TASK','PUBLISH_SUBMITTED','PUBLIC_VERIFYING','PUBLIC_VERIFIED','AUTH_REQUIRED','PUBLISH_FIELDS_REQUIRED','RATE_LIMITED','REMOTE_STATE_UNKNOWN','REJECTED','EXECUTION_FAILED','VERIFY_FAILED','CANCELLED'))),
	CONSTRAINT "publication_receipts_media_hashes_valid" CHECK ((("publication_receipts"."media_hashes_json")::jsonb) IS NOT NULL),
	CONSTRAINT "publication_receipts_verification_valid" CHECK ((("publication_receipts"."verification_json")::jsonb) IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "publication_receipts" ADD CONSTRAINT "publication_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_receipts" ADD CONSTRAINT "publication_receipts_project_id_release_target_id_release_targets_project_id_id_fk" FOREIGN KEY ("project_id","release_target_id") REFERENCES "public"."release_targets"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_receipts" ADD CONSTRAINT "publication_receipts_project_id_release_target_id_publishing_job_id_publishing_jobs_project_id_release_target_id_id_fk" FOREIGN KEY ("project_id","release_target_id","publishing_job_id") REFERENCES "public"."publishing_jobs"("project_id","release_target_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publication_receipts_publishing_job_id_idx" ON "publication_receipts" USING btree ("publishing_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_jobs_project_id_release_target_id_id_idx" ON "publishing_jobs" USING btree ("project_id","release_target_id","id");