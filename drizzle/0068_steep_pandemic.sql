CREATE TABLE `content_variant_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_variant_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_variant_id`) REFERENCES `content_variants`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`media_asset_id`) REFERENCES `media_assets`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_variant_media_assets_unique_content_variant_media_asset_idx` ON `content_variant_media_assets` (`content_variant_id`,`media_asset_id`);--> statement-breakpoint
CREATE INDEX `content_variant_media_assets_media_asset_idx` ON `content_variant_media_assets` (`media_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_variants_project_id_id_idx` ON `content_variants` (`project_id`,`id`);