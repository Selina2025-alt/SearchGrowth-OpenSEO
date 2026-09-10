CREATE TABLE `content_package_version_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_package_version_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_package_version_id`) REFERENCES `content_package_versions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`claim_id`) REFERENCES `claims`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_version_claims_unique_content_package_version_claim_idx` ON `content_package_version_claims` (`content_package_version_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `content_package_version_claims_claim_idx` ON `content_package_version_claims` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_versions_project_id_id_idx` ON `content_package_versions` (`project_id`,`id`);