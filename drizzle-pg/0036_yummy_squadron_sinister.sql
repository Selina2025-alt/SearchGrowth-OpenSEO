CREATE TABLE "claim_allowed_market_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"market_profile_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_allowed_market_profiles" ADD CONSTRAINT "claim_allowed_market_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_allowed_market_profiles" ADD CONSTRAINT "claim_allowed_market_profiles_project_id_claim_id_claims_project_id_id_fk" FOREIGN KEY ("project_id","claim_id") REFERENCES "public"."claims"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_allowed_market_profiles" ADD CONSTRAINT "claim_allowed_market_profiles_project_id_market_profile_id_search_market_profiles_project_id_id_fk" FOREIGN KEY ("project_id","market_profile_id") REFERENCES "public"."search_market_profiles"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_allowed_market_profiles_unique_claim_market_idx" ON "claim_allowed_market_profiles" USING btree ("claim_id","market_profile_id");--> statement-breakpoint
CREATE INDEX "claim_allowed_market_profiles_market_profile_idx" ON "claim_allowed_market_profiles" USING btree ("market_profile_id");