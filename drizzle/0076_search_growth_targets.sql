CREATE TABLE `search_growth_targets` (
	`project_id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_growth_targets_config_valid" CHECK(json_valid("search_growth_targets"."config_json"))
);
