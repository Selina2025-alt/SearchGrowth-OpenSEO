CREATE TABLE `content_package_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_package_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`canonical_markdown` text NOT NULL,
	`canonical_metadata_json` text NOT NULL,
	`web_page_spec_json` text,
	`content_hash` text NOT NULL,
	`gate_status` text NOT NULL,
	`classification` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_package_id`) REFERENCES `content_packages`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_package_versions_gate_status_valid" CHECK(("content_package_versions"."gate_status" IN ('DRAFT','BLOCKED','PASSED'))),
	CONSTRAINT "content_package_versions_classification_valid" CHECK(("content_package_versions"."classification" IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_versions_unique_content_package_version_idx` ON `content_package_versions` (`content_package_id`,`version_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_packages_project_id_id_idx` ON `content_packages` (`project_id`,`id`);