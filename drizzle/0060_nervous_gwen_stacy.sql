CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`media_type` text NOT NULL,
	`mime_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`rights_status` text NOT NULL,
	`classification` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_assets_media_type_valid" CHECK(("media_assets"."media_type" IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','OTHER'))),
	CONSTRAINT "media_assets_rights_status_valid" CHECK(("media_assets"."rights_status" IN ('OWNED','LICENSED','APPROVED_EXTERNAL','UNKNOWN'))),
	CONSTRAINT "media_assets_classification_valid" CHECK(("media_assets"."classification" IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED')))
);
--> statement-breakpoint
CREATE INDEX `media_assets_project_idx` ON `media_assets` (`project_id`);