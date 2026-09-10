CREATE TABLE `content_package_version_source_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_package_version_id` text NOT NULL,
	`source_ref_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_package_version_id`) REFERENCES `content_package_versions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`source_ref_id`) REFERENCES `source_refs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_version_source_refs_unique_content_package_version_source_ref_idx` ON `content_package_version_source_refs` (`content_package_version_id`,`source_ref_id`);--> statement-breakpoint
CREATE INDEX `content_package_version_source_refs_source_ref_idx` ON `content_package_version_source_refs` (`source_ref_id`);