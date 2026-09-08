CREATE TABLE "entity_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"alias_text" text NOT NULL,
	"locale" text,
	"match_mode" text NOT NULL,
	"case_sensitive" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"canonical_name" text NOT NULL,
	"canonical_domain" text,
	"product_url" text,
	"owning_entity_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
-- The composite alias FK below targets tracked_entities(project_id, id);
-- Postgres requires the referenced unique index to exist before the FK
-- constraint is added, so the supporting unique index is created ahead of the
-- FK ALTERs.
CREATE UNIQUE INDEX "tracked_entities_project_id_id_idx" ON "tracked_entities" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_project_id_entity_id_tracked_entities_project_id_id_fk" FOREIGN KEY ("project_id","entity_id") REFERENCES "public"."tracked_entities"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_entities" ADD CONSTRAINT "tracked_entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_entities" ADD CONSTRAINT "tracked_entities_project_id_owning_entity_id_tracked_entities_project_id_id_fk" FOREIGN KEY ("project_id","owning_entity_id") REFERENCES "public"."tracked_entities"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_aliases_project_idx" ON "entity_aliases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entity_aliases_entity_idx" ON "entity_aliases" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "tracked_entities_project_idx" ON "tracked_entities" USING btree ("project_id");
