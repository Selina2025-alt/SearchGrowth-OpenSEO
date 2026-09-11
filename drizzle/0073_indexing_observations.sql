CREATE TABLE `indexing_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`search_engine` text NOT NULL,
	`market_profile_id` text,
	`observation_type` text NOT NULL,
	`status` text NOT NULL,
	`details_json` text NOT NULL,
	`observed_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`market_profile_id`) REFERENCES `search_market_profiles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "indexing_observations_search_engine_valid" CHECK(("indexing_observations"."search_engine" IN ('GOOGLE','BAIDU','BING','OTHER'))),
	CONSTRAINT "indexing_observations_details_valid" CHECK(json_valid("indexing_observations"."details_json"))
);
--> statement-breakpoint
CREATE INDEX `indexing_observations_project_idx` ON `indexing_observations` (`project_id`);--> statement-breakpoint
CREATE INDEX `indexing_observations_market_profile_idx` ON `indexing_observations` (`market_profile_id`);
