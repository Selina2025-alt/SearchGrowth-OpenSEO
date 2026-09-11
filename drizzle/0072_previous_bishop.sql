CREATE TABLE `runtime_controls` (
	`control_key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`reason` text,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "runtime_controls_value_valid" CHECK(json_valid("runtime_controls"."value_json") AND json_type("runtime_controls"."value_json") IN ('true','false','integer','real','text'))
);
