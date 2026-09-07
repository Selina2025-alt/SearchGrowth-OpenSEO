import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects, savedKeywords } from "./app.schema";

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

// ============================================================================
// Search Growth V1.0 — normalized, project-scoped topics.
//
// A topic is the stable cross-domain reference (ADR-004) that keyword refs,
// prompts, pages, opportunities, content packages and experiments bind to. Only
// the topic record is defined here; keyword refs and the downstream relations
// arrive in later M1 tasks. A topic id is never replaced when canonical_name,
// description or status changes — lifecycle transitions mutate this row in
// place rather than creating a replacement row, so existing relations keep
// pointing at the same identity.
//
// Lifecycle invariants enforced on the merge pointer (the only field beyond
// 05_DOMAIN_DATA_MODEL.md §3 and the reference type's own optional
// `mergedIntoTopicId`):
//   - A merge target belongs to the SAME project (composite FK
//     (project_id, merged_into_topic_id) -> (project_id, id)).
//   - status = MERGED <=> merged_into_topic_id IS NOT NULL (checks below), so
//     a MERGED topic always names its successor and an ACTIVE/ARCHIVED topic
//     never carries one.
//   - A topic cannot be its own merge target.
//   - Deleting a referenced target is blocked (no action) rather than silently
//     nulling the pointer (ON DELETE SET NULL), which would leave a MERGED row
//     with no successor and break the stable-identity chain.
// The composite target unique index below exists only to support the composite
// FK; no canonical-name or other business uniqueness rule is added.
// ============================================================================

export const searchTopics = sqliteTable(
  "search_topics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The canonical, human-facing topic title. Renaming updates this column in
    // place; the row id (the stable cross-domain reference) is preserved.
    canonicalName: text("canonical_name").notNull(),
    // IETF language tag (e.g. "en", "zh-CN") of the topic. Explicit per the
    // V1.0 domain model — a topic is never locale-less/global.
    locale: text("locale").notNull(),
    description: text("description"),
    // Lifecycle state (05_DOMAIN_DATA_MODEL.md §3, schemas/domain-types.ts).
    // ACTIVE | ARCHIVED | MERGED are the DB text-enum columns; Zod validates
    // them at the domain boundary. There is no implicit/unknown fallback.
    status: text("status", {
      enum: ["ACTIVE", "ARCHIVED", "MERGED"],
    }).notNull(),
    // When status = MERGED this names the topic that absorbed this one, so the
    // merged row keeps its stable id and project while still pointing at its
    // successor (no replacement identity is created). Nullable; the composite
    // FK + checks below keep it coherent with status and the row's project.
    mergedIntoTopicId: text("merged_into_topic_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Every topic read is project-scoped, so project_id leads list/active
    // lookups. No business-rule unique index: no V1.0 artifact constrains
    // canonical_name/locale uniqueness per project, and merge history must not
    // be hidden behind a uniqueness rule.
    index("search_topics_project_idx").on(table.projectId),
    // Supporting unique target for the composite self-reference FK: the FK
    // references (project_id, id), so that pair must be unique. This is the
    // ONLY index the composite FK requires.
    uniqueIndex("search_topics_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // Composite self-reference: project_id is the FK's leading column, so a
    // topic on project A can never point at a topic on project B. Deleting a
    // target a merged topic still points at is blocked (no action — restrictive
    // on both dialects) rather than SET NULL.
    foreignKey({
      columns: [table.projectId, table.mergedIntoTopicId],
      foreignColumns: [table.projectId, table.id],
    }).onDelete("no action"),
    // A MERGED topic must name its successor (no dangling MERGED row).
    check(
      "search_topics_merged_requires_target",
      sql`(${table.status} <> 'MERGED' OR ${table.mergedIntoTopicId} IS NOT NULL)`,
    ),
    // Only a MERGED topic carries a successor (ACTIVE/ARCHIVED never do).
    check(
      "search_topics_only_merged_has_target",
      sql`(${table.mergedIntoTopicId} IS NULL OR ${table.status} = 'MERGED')`,
    ),
    // A topic cannot be merged into itself.
    check(
      "search_topics_merge_target_not_self",
      sql`(${table.mergedIntoTopicId} IS NULL OR ${table.mergedIntoTopicId} <> ${table.id})`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized Topic -> saved-keyword reference.
//
// A topic maps to existing OpenSEO saved keywords WITHOUT copying keyword text,
// market fields, ranks, tags or any other keyword entity: each row stores only
// the canonical saved_keywords.id reference (04_OPENSEO_REUSE_CODE_MAP.md §1,
// "Keyword research | existing | Topic mapping，不复制关键词库"). This table is
// what the V1.0 Topic稳定 traceability row's `mapping` gate tests against.
//
// Same-project integrity is enforced by two composite foreign keys that carry
// the mapping row's own project_id as their leading column:
//   - (project_id, topic_id)            -> search_topics(project_id, id)
//   - (project_id, open_seo_keyword_ref)-> saved_keywords(project_id, id)
// so the DB (not application convention) rejects a topic and a saved keyword
// that belong to different projects.
//
// One mapping per (topic_id, open_seo_keyword_ref) is the V1.0 uniqueness rule
// (schemas/migrations-reference.sql); topic ids and saved-keyword ids are both
// globally unique primary keys, so once the same-project FKs hold the pair is
// project-isolated without listing project_id in the unique index.
//
// Delete behavior mirrors the established OpenSEO cascade convention: deleting
// a topic, a saved keyword, or a whole project cascades to the mapping, so no
// mapping row can ever dangle.
// ============================================================================

export const searchTopicKeywordRefs = sqliteTable(
  "search_topic_keyword_refs",
  {
    id: text("id").primaryKey(),
    // The mapping's own project. Every topic/keyword/mapping read is
    // project-scoped, so project_id stays an explicit typed column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The mapped SearchTopic id (search_topics.id, the stable ADR-004 identity).
    topicId: text("topic_id").notNull(),
    // The canonical OpenSEO saved-keyword id (saved_keywords.id). No keyword
    // text / market / rank / tag data is stored here.
    openSeoKeywordRef: text("open_seo_keyword_ref").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-project composite FK to the topic: the mapping's project_id must
    // equal the topic's project_id. Deleting a topic removes its mappings.
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-project composite FK to the canonical saved keyword: the mapping's
    // project_id must equal the saved keyword's project_id. Deleting a saved
    // keyword removes its mappings. The referenced (project_id, id) pair is
    // unique via the supporting `saved_keywords_project_id_id_idx` index this
    // FK requires (added to app.schema.ts; no business uniqueness changes).
    foreignKey({
      columns: [table.projectId, table.openSeoKeywordRef],
      foreignColumns: [savedKeywords.projectId, savedKeywords.id],
    }).onDelete("cascade"),
    // V1.0 uniqueness: one mapping per (topic_id, open_seo_keyword_ref).
    uniqueIndex("search_topic_keyword_refs_unique_topic_keyword_idx").on(
      table.topicId,
      table.openSeoKeywordRef,
    ),
    // topic -> keyword reads and keyword -> topic reads are the two directions
    // the mapping serves; the unique index above already leads with topic_id.
    index("search_topic_keyword_refs_keyword_idx").on(table.openSeoKeywordRef),
  ],
);
