CREATE TABLE "runtime_controls" (
	"control_key" text PRIMARY KEY NOT NULL,
	"value_json" text NOT NULL,
	"reason" text,
	"updated_by" text NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "runtime_controls_value_valid" CHECK (jsonb_typeof(("runtime_controls"."value_json")::jsonb) IN ('boolean','number','string'))
);
