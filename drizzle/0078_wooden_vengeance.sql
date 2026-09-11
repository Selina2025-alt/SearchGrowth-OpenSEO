CREATE TABLE `publication_execution_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`release_target_id` text NOT NULL,
	`route` text NOT NULL,
	`draft_stager_id` text,
	`finalizer_id` text,
	`finalizer_strategy` text,
	`executor_version` text NOT NULL,
	`required_fields_json` text NOT NULL,
	`constraints_snapshot_json` text NOT NULL,
	`verification_policy_json` text NOT NULL,
	`fallback_route` text,
	`plan_hash` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`release_target_id`) REFERENCES `release_targets`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "publication_execution_plans_route_valid" CHECK(("publication_execution_plans"."route" IN ('OWNED_SITE','WECHATSYNC_STAGED_FINALIZE','YXER_NATIVE','SOCIAL_AUTO_UPLOAD_NATIVE','POSTIZ_NATIVE','PAID_MEDIA_SERVICE'))),
	CONSTRAINT "publication_execution_plans_finalizer_strategy_valid" CHECK(("publication_execution_plans"."finalizer_strategy" IS NULL OR "publication_execution_plans"."finalizer_strategy" IN ('OFFICIAL_API','IN_PAGE_WEB_API','SERVICE_CLI','FIXED_DOM'))),
	CONSTRAINT "publication_execution_plans_fallback_route_valid" CHECK(("publication_execution_plans"."fallback_route" IS NULL OR "publication_execution_plans"."fallback_route" IN ('OWNED_SITE','WECHATSYNC_STAGED_FINALIZE','YXER_NATIVE','SOCIAL_AUTO_UPLOAD_NATIVE','POSTIZ_NATIVE','PAID_MEDIA_SERVICE'))),
	CONSTRAINT "publication_execution_plans_required_fields_valid" CHECK(json_valid("publication_execution_plans"."required_fields_json")),
	CONSTRAINT "publication_execution_plans_constraints_snapshot_valid" CHECK(json_valid("publication_execution_plans"."constraints_snapshot_json")),
	CONSTRAINT "publication_execution_plans_verification_policy_valid" CHECK(json_valid("publication_execution_plans"."verification_policy_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_execution_plans_release_target_id_idx` ON `publication_execution_plans` (`release_target_id`);