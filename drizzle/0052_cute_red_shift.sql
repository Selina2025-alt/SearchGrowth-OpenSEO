CREATE TABLE `geo_entity_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`parse_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`mentioned` integer NOT NULL,
	`recommended` integer,
	`mention_position` integer,
	`sentiment` text,
	`evidence_text` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`parse_id`) REFERENCES `geo_observation_parses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `tracked_entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `geo_entity_mentions_parse_idx` ON `geo_entity_mentions` (`parse_id`);--> statement-breakpoint
CREATE INDEX `geo_entity_mentions_entity_idx` ON `geo_entity_mentions` (`entity_id`);