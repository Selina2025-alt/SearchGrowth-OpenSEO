CREATE TABLE `search_growth_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`before_ref` text,
	`after_ref` text,
	`metadata_json` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_growth_audit_events_metadata_valid" CHECK(json_valid("search_growth_audit_events"."metadata_json"))
);
--> statement-breakpoint
CREATE INDEX `search_growth_audit_events_project_idx` ON `search_growth_audit_events` (`project_id`);--> statement-breakpoint
CREATE TRIGGER `search_growth_audit_events_no_update`
BEFORE UPDATE ON `search_growth_audit_events`
BEGIN
	SELECT RAISE(ABORT, 'search_growth_audit_events is append-only: UPDATE is not permitted');
END;--> statement-breakpoint
CREATE TRIGGER `search_growth_audit_events_no_delete`
BEFORE DELETE ON `search_growth_audit_events`
BEGIN
	SELECT RAISE(ABORT, 'search_growth_audit_events is append-only: DELETE is not permitted');
END;