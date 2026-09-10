CREATE TABLE `content_package_version_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_package_version_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_package_version_id`) REFERENCES `content_package_versions`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`media_asset_id`) REFERENCES `media_assets`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_version_media_assets_unique_content_package_version_media_asset_idx` ON `content_package_version_media_assets` (`content_package_version_id`,`media_asset_id`);--> statement-breakpoint
CREATE INDEX `content_package_version_media_assets_media_asset_idx` ON `content_package_version_media_assets` (`media_asset_id`);