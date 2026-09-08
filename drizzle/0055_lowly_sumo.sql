CREATE TABLE `search_growth_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`market_profile_id` text,
	`profile` text NOT NULL,
	`page_fit_action` text NOT NULL,
	`target_page_url` text,
	`score_json` text NOT NULL,
	`data_quality_json` text NOT NULL,
	`evidence_snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`recommended_action` text NOT NULL,
	`source_snapshot_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`topic_id`) REFERENCES `search_topics`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`market_profile_id`) REFERENCES `search_market_profiles`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_growth_opportunities_profile_valid" CHECK(("search_growth_opportunities"."profile" IN ('EXISTING_GOOGLE_PAGE','EXISTING_SEARCH_PAGE_PARTIAL','NEW_TOPIC','GEO_DISTRIBUTION','EVIDENCE_ONLY','TECHNICAL_BLOCKER'))),
	CONSTRAINT "search_growth_opportunities_page_fit_action_valid" CHECK(("search_growth_opportunities"."page_fit_action" IN ('NEW_PAGE','REFRESH_PAGE','MERGE','DISTRIBUTE_ONLY','EVIDENCE_ONLY','TECHNICAL_FIX')))
);
--> statement-breakpoint
CREATE INDEX `search_growth_opportunities_topic_idx` ON `search_growth_opportunities` (`topic_id`);--> statement-breakpoint
CREATE INDEX `search_growth_opportunities_market_profile_idx` ON `search_growth_opportunities` (`market_profile_id`);