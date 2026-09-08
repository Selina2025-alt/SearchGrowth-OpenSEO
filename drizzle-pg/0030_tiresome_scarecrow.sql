CREATE TABLE "geo_entity_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"parse_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"mentioned" boolean NOT NULL,
	"recommended" boolean,
	"mention_position" integer,
	"sentiment" text,
	"evidence_text" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ADD CONSTRAINT "geo_entity_mentions_parse_id_geo_observation_parses_id_fk" FOREIGN KEY ("parse_id") REFERENCES "public"."geo_observation_parses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_entity_mentions" ADD CONSTRAINT "geo_entity_mentions_entity_id_tracked_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."tracked_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_entity_mentions_parse_idx" ON "geo_entity_mentions" USING btree ("parse_id");--> statement-breakpoint
CREATE INDEX "geo_entity_mentions_entity_idx" ON "geo_entity_mentions" USING btree ("entity_id");