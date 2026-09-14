-- The nullable relation column must exist before the rebuild's data copy reads
-- it (drizzle-kit emits the recreate without a preceding ADD COLUMN when a new
-- column and a new FK land together; existing rows get NULL = "no controlled
-- publication receipt associated").
ALTER TABLE `indexing_observations` ADD COLUMN `publication_receipt_id` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_indexing_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`publication_receipt_id` text,
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
	FOREIGN KEY (`project_id`,`publication_receipt_id`) REFERENCES `publication_receipts`(`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "indexing_observations_search_engine_valid" CHECK(("__new_indexing_observations"."search_engine" IN ('GOOGLE','BAIDU','BING','OTHER'))),
	CONSTRAINT "indexing_observations_details_valid" CHECK(json_valid("__new_indexing_observations"."details_json"))
);
--> statement-breakpoint
INSERT INTO `__new_indexing_observations`("id", "project_id", "publication_receipt_id", "url", "search_engine", "market_profile_id", "observation_type", "status", "details_json", "observed_at", "created_at") SELECT "id", "project_id", "publication_receipt_id", "url", "search_engine", "market_profile_id", "observation_type", "status", "details_json", "observed_at", "created_at" FROM `indexing_observations`;--> statement-breakpoint
DROP TABLE `indexing_observations`;--> statement-breakpoint
ALTER TABLE `__new_indexing_observations` RENAME TO `indexing_observations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `indexing_observations_project_idx` ON `indexing_observations` (`project_id`);--> statement-breakpoint
CREATE INDEX `indexing_observations_market_profile_idx` ON `indexing_observations` (`market_profile_id`);