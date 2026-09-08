CREATE TABLE `search_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`prompt_text` text NOT NULL,
	`normalized_prompt` text NOT NULL,
	`prompt_type` text NOT NULL,
	`persona` text,
	`buying_stage` text,
	`market_profile_id` text,
	`language` text NOT NULL,
	`business_fit` real NOT NULL,
	`priority` real NOT NULL,
	`version` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`topic_id`) REFERENCES `search_topics`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`market_profile_id`) REFERENCES `search_market_profiles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_prompts_business_fit_range" CHECK("search_prompts"."business_fit" >= 0 AND "search_prompts"."business_fit" <= 100),
	CONSTRAINT "search_prompts_priority_range" CHECK("search_prompts"."priority" >= 0 AND "search_prompts"."priority" <= 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_prompts_unique_project_normalized_market_version_idx` ON `search_prompts` (`project_id`,`normalized_prompt`,`market_profile_id`,`version`);--> statement-breakpoint
CREATE INDEX `search_prompts_project_idx` ON `search_prompts` (`project_id`);--> statement-breakpoint
CREATE INDEX `search_prompts_topic_idx` ON `search_prompts` (`topic_id`);--> statement-breakpoint
CREATE INDEX `search_prompts_market_profile_idx` ON `search_prompts` (`market_profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_market_profiles_project_id_id_idx` ON `search_market_profiles` (`project_id`,`id`);