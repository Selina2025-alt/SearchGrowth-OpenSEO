CREATE TABLE `published_media_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`platform` text NOT NULL,
	`account_id` text,
	`external_media_id` text,
	`public_url` text,
	`sha256` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`media_asset_id`) REFERENCES `media_assets`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `published_media_refs_project_idx` ON `published_media_refs` (`project_id`);--> statement-breakpoint
CREATE INDEX `published_media_refs_media_asset_idx` ON `published_media_refs` (`media_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_project_id_id_idx` ON `media_assets` (`project_id`,`id`);