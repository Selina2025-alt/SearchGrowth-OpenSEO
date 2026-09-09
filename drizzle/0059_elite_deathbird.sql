CREATE TABLE `claim_allowed_languages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`claim_id`) REFERENCES `claims`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_allowed_languages_unique_claim_language_idx` ON `claim_allowed_languages` (`claim_id`,`language`);--> statement-breakpoint
CREATE INDEX `claim_allowed_languages_language_idx` ON `claim_allowed_languages` (`language`);