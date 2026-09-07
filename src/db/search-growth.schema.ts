import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// ============================================================================
// Search Growth V1.0 — normalized, project-scoped market profiles.
//
// A market profile is the explicit engine/location/language/device lens every
// Keyword/Rank/GEO observation binds to. The V1.0 domain model forbids an
// implicit GLOBAL market: each row names one concrete engine + market, and
// consumers must select one (05_DOMAIN_DATA_MODEL.md §2). All relational
// fields are typed columns — nothing here is JSON-encoded to avoid a join.
//
// The enum lists below are the DB text-enum columns (no implicit GLOBAL /
// TABLET); the mirror in `./pg/search-growth.schema` must stay identical and
// `schema-parity.test.ts` fails on drift.
// ============================================================================

export const searchMarketProfiles = sqliteTable(
  "search_market_profiles",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    searchEngine: text("search_engine", {
      enum: ["GOOGLE", "BAIDU", "BING", "OTHER"],
    }).notNull(),
    // Provider-specific location identifier, kept as text because engines do
    // not share a numeric space (Google DataForSEO codes, Baidu/Bing codes,
    // OTHER free-form ids). Every profile names a concrete market — V1.0 has no
    // engine-wide/global profile, so the code is always present.
    locationCode: text("location_code").notNull(),
    locationName: text("location_name").notNull(),
    languageCode: text("language_code").notNull(),
    device: text("device", { enum: ["DESKTOP", "MOBILE"] }).notNull(),
    // ISO country of the market; required because there is no global fallback.
    country: text("country").notNull(),
    // Storage column is is_primary; the mapped property is `isPrimary`.
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Every market read is project-scoped, so project_id leads the list/active
    // lookups. No business-rule unique index: several profiles per project
    // (different engines/locations/devices) are legal and no V1.0 document
    // constrains name or primary uniqueness.
    index("search_market_profiles_project_idx").on(table.projectId),
  ],
);
