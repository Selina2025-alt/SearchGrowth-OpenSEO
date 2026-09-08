CREATE TABLE `geo_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parse_id` text NOT NULL,
	`raw_url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`domain` text NOT NULL,
	`title` text,
	`position` integer,
	`source_ownership` text NOT NULL,
	`matched_publication_receipt_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`parse_id`) REFERENCES `geo_observation_parses`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `geo_citations_parse_idx` ON `geo_citations` (`parse_id`);