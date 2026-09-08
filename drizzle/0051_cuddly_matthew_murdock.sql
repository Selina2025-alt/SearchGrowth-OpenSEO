CREATE TABLE `geo_observation_parses` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`parser_version` text NOT NULL,
	`parse_status` text NOT NULL,
	`accuracy_status` text,
	`parsed_at` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `geo_observation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_observation_parses_run_version_unique_idx` ON `geo_observation_parses` (`run_id`,`parser_version`);