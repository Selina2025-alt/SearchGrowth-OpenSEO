CREATE TABLE `source_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`ref` text NOT NULL,
	`captured_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "source_refs_type_valid" CHECK(("source_refs"."type" IN ('URL','INTERNAL_DOC','PRODUCT_FACT','RESEARCH')))
);
--> statement-breakpoint
CREATE INDEX `source_refs_project_idx` ON `source_refs` (`project_id`);