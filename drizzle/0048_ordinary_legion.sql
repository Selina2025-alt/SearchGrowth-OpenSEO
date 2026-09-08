CREATE TABLE `tracked_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`canonical_name` text NOT NULL,
	`canonical_domain` text,
	`product_url` text,
	`owning_entity_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`owning_entity_id`) REFERENCES `tracked_entities`(`project_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `entity_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`alias_text` text NOT NULL,
	`locale` text,
	`match_mode` text NOT NULL,
	`case_sensitive` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`entity_id`) REFERENCES `tracked_entities`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracked_entities_project_idx` ON `tracked_entities` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_entities_project_id_id_idx` ON `tracked_entities` (`project_id`,`id`);--> statement-breakpoint
CREATE INDEX `entity_aliases_project_idx` ON `entity_aliases` (`project_id`);--> statement-breakpoint
CREATE INDEX `entity_aliases_entity_idx` ON `entity_aliases` (`entity_id`);
