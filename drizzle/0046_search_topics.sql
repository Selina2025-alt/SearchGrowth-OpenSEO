CREATE TABLE `search_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`locale` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`merged_into_topic_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`merged_into_topic_id`) REFERENCES `search_topics`(`project_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "search_topics_merged_requires_target" CHECK(("search_topics"."status" <> 'MERGED' OR "search_topics"."merged_into_topic_id" IS NOT NULL)),
	CONSTRAINT "search_topics_only_merged_has_target" CHECK(("search_topics"."merged_into_topic_id" IS NULL OR "search_topics"."status" = 'MERGED')),
	CONSTRAINT "search_topics_merge_target_not_self" CHECK(("search_topics"."merged_into_topic_id" IS NULL OR "search_topics"."merged_into_topic_id" <> "search_topics"."id"))
);
--> statement-breakpoint
CREATE INDEX `search_topics_project_idx` ON `search_topics` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_topics_project_id_id_idx` ON `search_topics` (`project_id`,`id`);