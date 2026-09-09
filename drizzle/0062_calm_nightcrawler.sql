CREATE TABLE `content_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`opportunity_id` text,
	`title` text NOT NULL,
	`locale` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`topic_id`) REFERENCES `search_topics`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`opportunity_id`) REFERENCES `search_growth_opportunities`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_packages_project_idx` ON `content_packages` (`project_id`);--> statement-breakpoint
CREATE INDEX `content_packages_topic_idx` ON `content_packages` (`topic_id`);--> statement-breakpoint
CREATE INDEX `content_packages_opportunity_idx` ON `content_packages` (`opportunity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_growth_opportunities_project_id_id_idx` ON `search_growth_opportunities` (`project_id`,`id`);