CREATE UNIQUE INDEX `publication_receipts_project_id_id_idx` ON `publication_receipts` (`project_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_geo_citations` (
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
	FOREIGN KEY (`project_id`,`parse_id`) REFERENCES `geo_observation_parses`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`matched_publication_receipt_id`) REFERENCES `publication_receipts`(`project_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_geo_citations`("id", "project_id", "parse_id", "raw_url", "normalized_url", "domain", "title", "position", "source_ownership", "matched_publication_receipt_id", "created_at") SELECT "id", "project_id", "parse_id", "raw_url", "normalized_url", "domain", "title", "position", "source_ownership", "matched_publication_receipt_id", "created_at" FROM `geo_citations`;--> statement-breakpoint
DROP TABLE `geo_citations`;--> statement-breakpoint
ALTER TABLE `__new_geo_citations` RENAME TO `geo_citations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `geo_citations_parse_idx` ON `geo_citations` (`parse_id`);