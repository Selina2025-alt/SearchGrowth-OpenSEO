CREATE TABLE "source_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"ref" text NOT NULL,
	"captured_at" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "source_refs_type_valid" CHECK (("source_refs"."type" IN ('URL','INTERNAL_DOC','PRODUCT_FACT','RESEARCH')))
);
--> statement-breakpoint
ALTER TABLE "source_refs" ADD CONSTRAINT "source_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_refs_project_idx" ON "source_refs" USING btree ("project_id");