CREATE TABLE `search_market_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`search_engine` text NOT NULL,
	`location_code` text NOT NULL,
	`location_name` text NOT NULL,
	`language_code` text NOT NULL,
	`device` text NOT NULL,
	`country` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_market_profiles_project_idx` ON `search_market_profiles` (`project_id`);
