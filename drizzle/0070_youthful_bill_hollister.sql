CREATE TABLE `release_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`release_bundle_id` text NOT NULL,
	`content_variant_id` text NOT NULL,
	`platform` text NOT NULL,
	`target_intent` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`scheduled_at` text,
	`dependency_target_id` text,
	`utm_url` text,
	`target_hash` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`release_bundle_id`) REFERENCES `release_bundles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`content_variant_id`) REFERENCES `content_variants`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`dependency_target_id`) REFERENCES `release_targets`(`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "release_targets_target_intent_valid" CHECK(("release_targets"."target_intent" IN ('DRAFT','PUBLIC','SUBMIT_FOR_REVIEW','PAID_SUBMIT')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_targets_project_id_id_idx` ON `release_targets` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_bundles_project_id_id_idx` ON `release_bundles` (`project_id`,`id`);