CREATE TABLE "search_growth_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"before_ref" text,
	"after_ref" text,
	"metadata_json" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "search_growth_audit_events_metadata_valid" CHECK (("search_growth_audit_events"."metadata_json")::jsonb IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "search_growth_audit_events" ADD CONSTRAINT "search_growth_audit_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_growth_audit_events_project_idx" ON "search_growth_audit_events" USING btree ("project_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "search_growth_audit_events_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'search_growth_audit_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "search_growth_audit_events_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "search_growth_audit_events"
FOR EACH ROW EXECUTE FUNCTION "search_growth_audit_events_append_only"();