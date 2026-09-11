CREATE TABLE `experiment_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`snapshot_type` text NOT NULL,
	`captured_at` text NOT NULL,
	`window_start` text,
	`window_end` text,
	`timezone` text,
	`seo_metrics_json` text NOT NULL,
	`geo_metrics_json` text NOT NULL,
	`ga4_metrics_json` text NOT NULL,
	`publication_metrics_json` text NOT NULL,
	`indexing_metrics_json` text NOT NULL,
	`data_quality_json` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`experiment_id`) REFERENCES `experiments`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "experiment_snapshots_snapshot_type_valid" CHECK(("experiment_snapshots"."snapshot_type" IN ('BASELINE','D7','D14','D30','MANUAL'))),
	CONSTRAINT "experiment_snapshots_seo_metrics_valid" CHECK(json_valid("experiment_snapshots"."seo_metrics_json")),
	CONSTRAINT "experiment_snapshots_geo_metrics_valid" CHECK(json_valid("experiment_snapshots"."geo_metrics_json")),
	CONSTRAINT "experiment_snapshots_ga4_metrics_valid" CHECK(json_valid("experiment_snapshots"."ga4_metrics_json")),
	CONSTRAINT "experiment_snapshots_publication_metrics_valid" CHECK(json_valid("experiment_snapshots"."publication_metrics_json")),
	CONSTRAINT "experiment_snapshots_indexing_metrics_valid" CHECK(json_valid("experiment_snapshots"."indexing_metrics_json")),
	CONSTRAINT "experiment_snapshots_data_quality_valid" CHECK(json_valid("experiment_snapshots"."data_quality_json"))
);
--> statement-breakpoint
CREATE INDEX `experiment_snapshots_experiment_idx` ON `experiment_snapshots` (`experiment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `experiments_project_id_id_idx` ON `experiments` (`project_id`,`id`);--> statement-breakpoint
CREATE TRIGGER `experiment_snapshots_no_update`
BEFORE UPDATE ON `experiment_snapshots`
BEGIN
	SELECT RAISE(ABORT, 'experiment_snapshots is append-only: UPDATE is not permitted');
END;--> statement-breakpoint
CREATE TRIGGER `experiment_snapshots_no_delete`
BEFORE DELETE ON `experiment_snapshots`
BEGIN
	SELECT RAISE(ABORT, 'experiment_snapshots is append-only: DELETE is not permitted');
END;