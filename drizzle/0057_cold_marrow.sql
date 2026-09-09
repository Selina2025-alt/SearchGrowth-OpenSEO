CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`claim_text` text NOT NULL,
	`status` text NOT NULL,
	`verified_by` text,
	`last_verified_at` text,
	`expires_at` text,
	`classification` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "claims_status_valid" CHECK(("claims"."status" IN ('APPROVED','UNVERIFIED','EXPIRED','REJECTED'))),
	CONSTRAINT "claims_classification_valid" CHECK(("claims"."classification" IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED')))
);
--> statement-breakpoint
CREATE TABLE `claim_source_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`source_ref_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`claim_id`) REFERENCES `claims`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`,`source_ref_id`) REFERENCES `source_refs`(`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claims_project_idx` ON `claims` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `claims_project_id_id_idx` ON `claims` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `source_refs_project_id_id_idx` ON `source_refs` (`project_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `claim_source_refs_unique_claim_source_idx` ON `claim_source_refs` (`claim_id`,`source_ref_id`);--> statement-breakpoint
CREATE INDEX `claim_source_refs_source_ref_idx` ON `claim_source_refs` (`source_ref_id`);