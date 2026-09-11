CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`opportunity_id` text,
	`release_bundle_id` text,
	`title` text NOT NULL,
	`hypothesis` text NOT NULL,
	`status` text NOT NULL,
	`activation_policy` text NOT NULL,
	`activation_at` text,
	`target_keyword_refs_json` text NOT NULL,
	`target_prompt_refs_json` text NOT NULL,
	`target_surface_refs_json` text NOT NULL,
	`recheck_policy_json` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`topic_id`) REFERENCES `search_topics`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`opportunity_id`) REFERENCES `search_growth_opportunities`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`release_bundle_id`) REFERENCES `release_bundles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "experiments_activation_policy_valid" CHECK(("experiments"."activation_policy" IN ('FIRST_REQUIRED_PUBLIC','ALL_REQUIRED_TERMINAL'))),
	CONSTRAINT "experiments_target_keyword_refs_valid" CHECK(json_valid("experiments"."target_keyword_refs_json")),
	CONSTRAINT "experiments_target_prompt_refs_valid" CHECK(json_valid("experiments"."target_prompt_refs_json")),
	CONSTRAINT "experiments_target_surface_refs_valid" CHECK(json_valid("experiments"."target_surface_refs_json")),
	CONSTRAINT "experiments_recheck_policy_valid" CHECK(json_valid("experiments"."recheck_policy_json"))
);
--> statement-breakpoint
CREATE INDEX `experiments_project_idx` ON `experiments` (`project_id`);--> statement-breakpoint
CREATE INDEX `experiments_topic_idx` ON `experiments` (`topic_id`);--> statement-breakpoint
CREATE INDEX `experiments_opportunity_idx` ON `experiments` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX `experiments_release_bundle_idx` ON `experiments` (`release_bundle_id`);