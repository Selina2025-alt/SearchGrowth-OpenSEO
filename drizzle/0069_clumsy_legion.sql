CREATE TABLE `release_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_package_version_id` text NOT NULL,
	`release_version` integer NOT NULL,
	`status` text NOT NULL,
	`release_strategy` text NOT NULL,
	`utm_policy_json` text NOT NULL,
	`bundle_hash` text NOT NULL,
	`dry_run_report_json` text,
	`approved_by` text,
	`approved_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_package_version_id`) REFERENCES `content_package_versions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "release_bundles_status_valid" CHECK(("release_bundles"."status" IN ('DRAFT','DRY_RUN_READY','READY_FOR_APPROVAL','APPROVED','EXECUTING','COMPLETED','PARTIAL','PAUSED','CANCELLED'))),
	CONSTRAINT "release_bundles_release_strategy_valid" CHECK(("release_bundles"."release_strategy" IN ('WEBSITE_FIRST','PARALLEL','SOCIAL_ONLY')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_bundles_unique_content_package_version_release_version_idx` ON `release_bundles` (`content_package_version_id`,`release_version`);