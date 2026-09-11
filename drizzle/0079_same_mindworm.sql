CREATE TABLE `platform_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`release_target_id` text NOT NULL,
	`platform` text NOT NULL,
	`account_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`draft_url` text,
	`content_hash` text NOT NULL,
	`asset_hashes_json` text NOT NULL,
	`stager_id` text NOT NULL,
	`stager_version` text NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`release_target_id`) REFERENCES `release_targets`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "platform_drafts_asset_hashes_valid" CHECK(json_valid("platform_drafts"."asset_hashes_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_drafts_platform_account_id_draft_id_idx` ON `platform_drafts` (`platform`,`account_id`,`draft_id`);