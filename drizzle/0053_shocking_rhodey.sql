CREATE UNIQUE INDEX `geo_observation_runs_project_id_id_idx` ON `geo_observation_runs` (`project_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_geo_observation_parses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`parser_version` text NOT NULL,
	`parse_status` text NOT NULL,
	`accuracy_status` text,
	`parsed_at` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`run_id`) REFERENCES `geo_observation_runs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_geo_observation_parses`("id", "project_id", "run_id", "parser_version", "parse_status", "accuracy_status", "parsed_at", "is_current", "created_at") SELECT "p"."id", "r"."project_id", "p"."run_id", "p"."parser_version", "p"."parse_status", "p"."accuracy_status", "p"."parsed_at", "p"."is_current", "p"."created_at" FROM `geo_observation_parses` AS "p" INNER JOIN `geo_observation_runs` AS "r" ON "r"."id" = "p"."run_id";--> statement-breakpoint
DROP TABLE `geo_observation_parses`;--> statement-breakpoint
ALTER TABLE `__new_geo_observation_parses` RENAME TO `geo_observation_parses`;--> statement-breakpoint
CREATE UNIQUE INDEX `geo_observation_parses_run_version_unique_idx` ON `geo_observation_parses` (`run_id`,`parser_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `geo_observation_parses_project_id_id_idx` ON `geo_observation_parses` (`project_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_geo_entity_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parse_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`mentioned` integer NOT NULL,
	`recommended` integer,
	`mention_position` integer,
	`sentiment` text,
	`evidence_text` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`parse_id`) REFERENCES `geo_observation_parses`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`entity_id`) REFERENCES `tracked_entities`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_geo_entity_mentions`("id", "project_id", "parse_id", "entity_id", "mentioned", "recommended", "mention_position", "sentiment", "evidence_text", "created_at") SELECT "m"."id", "p"."project_id", "m"."parse_id", "m"."entity_id", "m"."mentioned", "m"."recommended", "m"."mention_position", "m"."sentiment", "m"."evidence_text", "m"."created_at" FROM `geo_entity_mentions` AS "m" INNER JOIN `geo_observation_parses` AS "p" ON "p"."id" = "m"."parse_id";--> statement-breakpoint
DROP TABLE `geo_entity_mentions`;--> statement-breakpoint
ALTER TABLE `__new_geo_entity_mentions` RENAME TO `geo_entity_mentions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `geo_entity_mentions_parse_idx` ON `geo_entity_mentions` (`parse_id`);--> statement-breakpoint
CREATE INDEX `geo_entity_mentions_entity_idx` ON `geo_entity_mentions` (`entity_id`);
