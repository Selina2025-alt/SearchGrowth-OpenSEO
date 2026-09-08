CREATE TABLE `geo_observation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`project_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`prompt_version` integer NOT NULL,
	`surface_type` text NOT NULL,
	`surface_name` text NOT NULL,
	`fidelity` text NOT NULL,
	`provider` text,
	`engine` text,
	`model` text,
	`model_version` text,
	`web_search` integer,
	`search_mode` text,
	`market_profile_id` text,
	`repeat_index` integer NOT NULL,
	`application_cache_bypassed` integer NOT NULL,
	`raw_answer` text,
	`raw_response` text,
	`provider_request_id` text,
	`usage_json` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`prompt_id`) REFERENCES `search_prompts`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`market_profile_id`) REFERENCES `search_market_profiles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "geo_observation_runs_repeat_index_nonnegative" CHECK("geo_observation_runs"."repeat_index" >= 0)
);
--> statement-breakpoint
CREATE INDEX `geo_observation_runs_project_idx` ON `geo_observation_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `geo_observation_runs_batch_idx` ON `geo_observation_runs` (`batch_id`);--> statement-breakpoint
CREATE INDEX `geo_observation_runs_prompt_idx` ON `geo_observation_runs` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `geo_observation_runs_market_profile_idx` ON `geo_observation_runs` (`market_profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_prompts_project_id_id_idx` ON `search_prompts` (`project_id`,`id`);