CREATE TABLE `search_topic_keyword_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`open_seo_keyword_ref` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`topic_id`) REFERENCES `search_topics`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`open_seo_keyword_ref`) REFERENCES `saved_keywords`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_topic_keyword_refs_unique_topic_keyword_idx` ON `search_topic_keyword_refs` (`topic_id`,`open_seo_keyword_ref`);--> statement-breakpoint
CREATE INDEX `search_topic_keyword_refs_keyword_idx` ON `search_topic_keyword_refs` (`open_seo_keyword_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `saved_keywords_project_id_id_idx` ON `saved_keywords` (`project_id`,`id`);