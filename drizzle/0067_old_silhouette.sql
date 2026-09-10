CREATE TABLE `content_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_package_version_id` text NOT NULL,
	`platform` text NOT NULL,
	`format` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`metadata_json` text NOT NULL,
	`body_hash` text NOT NULL,
	`renderer_version` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_package_version_id`) REFERENCES `content_package_versions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
