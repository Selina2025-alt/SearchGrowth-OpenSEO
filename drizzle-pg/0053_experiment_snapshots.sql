CREATE TABLE "experiment_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"experiment_id" text NOT NULL,
	"snapshot_type" text NOT NULL,
	"captured_at" text NOT NULL,
	"window_start" text,
	"window_end" text,
	"timezone" text,
	"seo_metrics_json" text NOT NULL,
	"geo_metrics_json" text NOT NULL,
	"ga4_metrics_json" text NOT NULL,
	"publication_metrics_json" text NOT NULL,
	"indexing_metrics_json" text NOT NULL,
	"data_quality_json" text NOT NULL,
	"notes" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "experiment_snapshots_snapshot_type_valid" CHECK (("experiment_snapshots"."snapshot_type" IN ('BASELINE','D7','D14','D30','MANUAL'))),
	CONSTRAINT "experiment_snapshots_seo_metrics_valid" CHECK ((("experiment_snapshots"."seo_metrics_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiment_snapshots_geo_metrics_valid" CHECK ((("experiment_snapshots"."geo_metrics_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiment_snapshots_ga4_metrics_valid" CHECK ((("experiment_snapshots"."ga4_metrics_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiment_snapshots_publication_metrics_valid" CHECK ((("experiment_snapshots"."publication_metrics_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiment_snapshots_indexing_metrics_valid" CHECK ((("experiment_snapshots"."indexing_metrics_json")::jsonb) IS NOT NULL),
	CONSTRAINT "experiment_snapshots_data_quality_valid" CHECK ((("experiment_snapshots"."data_quality_json")::jsonb) IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_project_id_id_idx" ON "experiments" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "experiment_snapshots" ADD CONSTRAINT "experiment_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_snapshots" ADD CONSTRAINT "experiment_snapshots_project_id_experiment_id_experiments_project_id_id_fk" FOREIGN KEY ("project_id","experiment_id") REFERENCES "public"."experiments"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiment_snapshots_experiment_idx" ON "experiment_snapshots" USING btree ("experiment_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "experiment_snapshots_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'experiment_snapshots is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "experiment_snapshots_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "experiment_snapshots"
FOR EACH ROW EXECUTE FUNCTION "experiment_snapshots_append_only"();