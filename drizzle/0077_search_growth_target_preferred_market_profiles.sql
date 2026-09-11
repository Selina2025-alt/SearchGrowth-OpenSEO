CREATE TABLE `search_growth_target_preferred_market_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`market_profile_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `search_growth_targets`(`project_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`market_profile_id`) REFERENCES `search_market_profiles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_growth_target_preferred_market_profiles_unique_idx` ON `search_growth_target_preferred_market_profiles` (`project_id`,`market_profile_id`);--> statement-breakpoint
CREATE INDEX `search_growth_target_preferred_market_profiles_market_idx` ON `search_growth_target_preferred_market_profiles` (`market_profile_id`);