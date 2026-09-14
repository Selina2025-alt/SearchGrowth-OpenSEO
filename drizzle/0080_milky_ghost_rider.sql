CREATE TABLE `publishing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`release_target_id` text NOT NULL,
	`execution_plan_id` text NOT NULL,
	`executor_id` text NOT NULL,
	`executor_version` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`leased_by` text,
	`lease_expires_at` text,
	`external_draft_id` text,
	`external_task_id` text,
	`external_content_id` text,
	`public_url` text,
	`last_error_code` text,
	`last_error_message_safe` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`release_target_id`) REFERENCES `release_targets`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`release_target_id`,`execution_plan_id`) REFERENCES `publication_execution_plans`(`project_id`,`release_target_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "publishing_jobs_status_valid" CHECK(("publishing_jobs"."status" IN ('PLANNED','PREFLIGHT','EXECUTION_READY','STAGING_DRAFT','DRAFT_CREATED','DRAFT_VERIFIED','FINALIZE_READY','FINALIZING','VALIDATING','DRY_RUN_PASSED','SUBMITTING','ACCEPTED_REMOTE_TASK','PUBLISH_SUBMITTED','PUBLIC_VERIFYING','PUBLIC_VERIFIED','AUTH_REQUIRED','PUBLISH_FIELDS_REQUIRED','RATE_LIMITED','REMOTE_STATE_UNKNOWN','REJECTED','EXECUTION_FAILED','VERIFY_FAILED','CANCELLED'))),
	CONSTRAINT "publishing_jobs_attempts_valid" CHECK(("publishing_jobs"."attempts" >= 0 AND "publishing_jobs"."max_attempts" >= 1 AND "publishing_jobs"."attempts" <= "publishing_jobs"."max_attempts"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publishing_jobs_idempotency_key_idx` ON `publishing_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `publication_execution_plans_project_id_release_target_id_id_idx` ON `publication_execution_plans` (`project_id`,`release_target_id`,`id`);