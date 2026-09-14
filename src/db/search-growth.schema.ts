/* eslint-disable max-lines -- the SQLite Search Growth schema barrel holds every V1.0 table (market profiles through the accepted T108 geo_citations, T109 search_growth_opportunities, T110 source_refs, T111 claims/claim_source_refs, T112 claim_allowed_market_profiles, T113 claim_allowed_languages, T114 media_assets, T115 published_media_refs, T117 content_packages, T118 content_package_versions, T119 content_package_version_claims, T120 content_package_version_source_refs, T121 content_package_version_media_assets, T122 content_variants, T123 content_variant_media_assets, T124 release_bundles, T125 release_targets, T126 search_growth_audit_events, T127 runtime_controls, T128 indexing_observations, T129 experiments, T130 experiment_snapshots and T131 search_growth_targets additions, plus the T132 search_growth_target_preferred_market_profiles relation, the T133 publication_execution_plans plan core, the T134 platform_drafts draft-evidence core and the T135 publishing_jobs persistence core); the accepted additions put the counted non-comment lines just past the cap, and splitting the barrel would ripple across the schema-parity/import seam */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
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
    // Supporting unique target for the search_prompts composite FK
    // ((project_id, market_profile_id) -> search_market_profiles(project_id, id),
    // defined below). id is already the PK, so this composite accepts exactly the
    // rows the PK accepts and adds no business uniqueness.
    uniqueIndex("search_market_profiles_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
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

// ============================================================================
// Search Growth V1.0 — normalized, project-scoped tracked entities.
//
// A tracked entity is the stable brand/product/competitor identity (ADR-004;
// 30_TRACEABILITY_MATRIX.md row 品牌/产品/竞品) that the later parser, alias
// matcher and GEO entity-mention work binds to. This task is storage and
// contract only — no parser/matcher/CRUD/repository/service is added here.
//
// A tracked-entity id is never replaced when canonical_name, canonical domain,
// product URL, type, owning-entity relation or active state changes: lifecycle
// mutations update this row in place, so downstream references keep pointing at
// the same identity.
//
// `owning_entity_id` (nullable, 05_DOMAIN_DATA_MODEL.md §4) names an optional
// same-Project parent entity — a PRODUCT can name its owning BRAND, a
// COMPETITOR_PRODUCT its owning COMPETITOR, and so on. The composite
// self-reference FK carries this row's project_id as its leading column, so an
// entity on project A can never be owned by an entity on project B. Deleting an
// owner that still has owned entities is BLOCKED (no action — restrictive on
// both dialects) rather than silently nulled or cascaded, so an ownership
// reference can never dangle and owned rows keep their stable id/project. (ON
// DELETE SET NULL is impossible here: it would null the composite FK's leading
// column project_id, which is NOT NULL.)
//
// Same-project integrity for aliases is enforced by the composite FK on
// `entity_aliases` below. The `tracked_entities_project_id_id_idx` unique index
// exists ONLY as the required unique target of those composite FKs (aliases and
// the owning-entity self-reference) — id is already the primary key, so the
// composite accepts exactly the rows the PK accepts and adds no business
// uniqueness.
// ============================================================================

export const trackedEntities = sqliteTable(
  "tracked_entities",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The entity kind (05_DOMAIN_DATA_MODEL.md §4, schemas/domain-types.ts
    // TrackedEntityType). BRAND | PRODUCT | COMPETITOR | COMPETITOR_PRODUCT are
    // the DB text-enum columns; Zod validates them at the domain boundary. There
    // is no implicit/unknown fallback.
    entityType: text("entity_type", {
      enum: ["BRAND", "PRODUCT", "COMPETITOR", "COMPETITOR_PRODUCT"],
    }).notNull(),
    // The canonical, human-facing entity name. Renaming updates this column in
    // place; the row id (the stable cross-domain reference) is preserved.
    canonicalName: text("canonical_name").notNull(),
    // Optional canonical site domain (e.g. "openseo.dev"). Domain aliases can
    // then match against this exact registered domain.
    canonicalDomain: text("canonical_domain"),
    // Optional canonical product landing page URL.
    productUrl: text("product_url"),
    // Optional owning/parent entity within the SAME project (05_DOMAIN_DATA_MODEL
    // .md §4). NULL means the entity is not owned by another tracked entity. The
    // composite FK below keeps the owner same-Project and blocks deleting an
    // owner that still has owned entities.
    owningEntityId: text("owning_entity_id"),
    // Soft-disable flag: inactive entities remain stored and referenced but are
    // excluded from active matching later.
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Every entity read is project-scoped, so project_id leads list/active
    // lookups. No business-rule unique index: no V1.0 artifact constrains
    // canonical_name (or domain) uniqueness per project.
    index("tracked_entities_project_idx").on(table.projectId),
    // Supporting unique target for the entity_aliases composite FK and the
    // owning-entity composite FK below (both reference (project_id, id)). id is
    // already the PK, so this adds no business uniqueness.
    uniqueIndex("tracked_entities_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // Same-Project self-reference for owning_entity_id: the FK's leading column
    // is this row's project_id, so an entity on project A can never name an
    // owner on project B (the composite has no matching parent row). Deleting an
    // owner that still has owned entities is blocked (no action — restrictive on
    // both dialects), so an ownership reference can never dangle.
    foreignKey({
      columns: [table.projectId, table.owningEntityId],
      foreignColumns: [table.projectId, table.id],
    }).onDelete("no action"),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized entity aliases.
//
// An alias is one surface spelling/domain an entity is matched under
// (05_DOMAIN_DATA_MODEL.md §4 EntityAlias, schemas/domain-types.ts EntityAlias).
// Storage/contract only: the alias substring-safety rule against overly short
// generic substrings belongs to later validation/matching work.
//
// Project ownership is EXPLICIT on the row and database-enforced: the alias
// carries its own project_id and a same-project composite FK
// ((project_id, entity_id) -> tracked_entities(project_id, id)), so an alias
// whose entity lives on another Project has no matching parent row and is
// rejected by the DB. Deleting a Project, a tracked entity, or an alias's
// entity cascades the alias away, so aliases never dangle.
//
// `priority` (05_DOMAIN_DATA_MODEL.md §4 EntityAlias) is an integer
// storage-only precedence hint for later alias matching; it defaults to 0 and no
// ranking/matching behavior is implemented in this task.
// ============================================================================

export const entityAliases = sqliteTable(
  "entity_aliases",
  {
    id: text("id").primaryKey(),
    // The alias's own project. Explicit typed column so ownership is never
    // inferred and the same-project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The tracked_entities.id this alias resolves to (the stable ADR-004 id).
    entityId: text("entity_id").notNull(),
    // The alias surface text (e.g. a brand/product variant or a domain).
    aliasText: text("alias_text").notNull(),
    // Optional IETF language tag the alias spelling applies to; NULL means the
    // alias is not locale-restricted.
    locale: text("locale"),
    // Approved alias match mode
    // (EXACT | CASE_INSENSITIVE_EXACT | WORD_BOUNDARY | UNICODE_SUBSTRING |
    // DOMAIN). DB text-enum columns; Zod validates them at the domain boundary.
    matchMode: text("match_mode", {
      enum: [
        "EXACT",
        "CASE_INSENSITIVE_EXACT",
        "WORD_BOUNDARY",
        "UNICODE_SUBSTRING",
        "DOMAIN",
      ],
    }).notNull(),
    // Whether alias text comparison is case-sensitive for the given match mode.
    caseSensitive: integer("case_sensitive", { mode: "boolean" })
      .notNull()
      .default(false),
    // Storage-only integer precedence hint for later alias matching
    // (05_DOMAIN_DATA_MODEL.md §4 EntityAlias). 0 is the neutral default; no
    // ranking or matching behavior is implemented here.
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-project composite FK to the owning tracked entity: the alias's
    // project_id must equal the entity's project_id. Deleting an entity removes
    // its aliases; the referenced (project_id, id) pair is unique via the
    // supporting tracked_entities_project_id_id_idx unique index above.
    foreignKey({
      columns: [table.projectId, table.entityId],
      foreignColumns: [trackedEntities.projectId, trackedEntities.id],
    }).onDelete("cascade"),
    // Project-scoped alias reads (list aliases within a project).
    index("entity_aliases_project_idx").on(table.projectId),
    // Entity -> aliases reads and the entity cascade delete path.
    index("entity_aliases_entity_idx").on(table.entityId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped search prompts.
//
// A search prompt is the versioned, topic-scoped question/instruction the later
// fresh-GEO observation work sends to a search engine or model API
// (05_DOMAIN_DATA_MODEL.md §5, schemas/domain-types.ts SearchPrompt). This task
// is storage and contract only — no generation, normalization algorithm,
// template, execution, CRUD, or GEO observation code is added here.
//
// Every prompt belongs to an existing same-Project SearchTopic; an optional
// same-Project SearchMarketProfile may scope it to one concrete market. Both
// relations are DB-enforced with composite FKs whose leading column is this
// row's project_id, so a prompt can never reference a topic or profile on
// another Project. Deleting a topic or a market profile cascades its prompts
// away (and deleting a whole Project cascades through the Project FK), so a
// prompt can never dangle.
//
// The prompt_type text-enum column is the exact V1.0 PromptType list
// (lowercase, 05_DOMAIN_DATA_MODEL.md §5 / schemas/domain-types.ts); the Zod
// boundary in src/types/schemas/search-prompt.ts rejects unsupported, case-
// mismatched and empty values at the runtime boundary.
//
// business_fit and priority are explicit REAL score columns on the 0..100 scale
// the domain contract defines; the two CHECK constraints below enforce the
// range at the storage boundary. This is score-boundary validation only — no
// ranking, matching or prompt-behavior rule is added.
//
// The SOLE versioned-identity rule (schemas/migrations-reference.sql
// idx_search_prompts_unique) is the unique index on
// (project_id, normalized_prompt, market_profile_id, version): a version never
// overwrites history (05_DOMAIN_DATA_MODEL.md §5 "Prompt version 不覆盖历史") —
// versioning a prompt inserts a new row with the next version. No other
// business uniqueness, normalization, generated-prompt or matching rule exists.
// ============================================================================

export const searchPrompts = sqliteTable(
  "search_prompts",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The stable SearchTopic id (search_topics.id, ADR-004) this prompt belongs
    // to. Bound to the row's project by the composite FK below.
    topicId: text("topic_id").notNull(),
    // The human-authored prompt text sent to the surface (05_DOMAIN_DATA_MODEL
    // .md §5). No generation/template code is added in this task.
    promptText: text("prompt_text").notNull(),
    // The normalized form of the prompt text. Stored as an explicit typed column
    // because it is the leading identity input of the versioned-identity rule;
    // no normalization algorithm is implemented here.
    normalizedPrompt: text("normalized_prompt").notNull(),
    // The V1.0 PromptType (exact lowercase values from schemas/domain-types.ts).
    promptType: text("prompt_type", {
      enum: [
        "definition",
        "problem",
        "recommendation",
        "comparison",
        "alternative",
        "risk",
        "security",
        "pricing",
        "implementation",
        "brand_validation",
        "scenario",
      ],
    }).notNull(),
    // Optional human-facing persona the prompt is written for.
    persona: text("persona"),
    // Optional buying-stage label the prompt targets.
    buyingStage: text("buying_stage"),
    // Optional same-Project SearchMarketProfile the prompt is scoped to; NULL
    // means the prompt is not attached to any profile. The composite FK below
    // keeps it same-Project and cascades prompts away when a profile is deleted.
    marketProfileId: text("market_profile_id"),
    // IETF language tag (e.g. "en", "zh-CN") of the prompt text.
    language: text("language").notNull(),
    // Business-fit score, 0..100 (domain contract). Explicit REAL column + CHECK
    // range below; no ranking behavior.
    businessFit: real("business_fit").notNull(),
    // Priority/importance score, 0..100 (domain contract). Explicit REAL column
    // + CHECK range below; storage-only — no ranking behavior.
    priority: real("priority").notNull(),
    // Prompt version. Versioning inserts a new row (never overwrites history),
    // so the (project, normalized_prompt, market_profile_id, version) unique
    // index below is the versioned-identity rule.
    version: integer("version").notNull(),
    // Soft-disable flag: inactive prompts remain stored but are excluded from
    // later observation selection.
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the topic: the prompt's project_id must equal
    // the topic's project_id. Deleting a topic removes its prompts (the
    // referenced (project_id, id) pair is unique via the supporting
    // search_topics_project_id_id_idx index created in 0046).
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the optional market profile: when set, the
    // prompt's project_id must equal the profile's project_id. Deleting a
    // profile removes the prompts scoped to it (the referenced (project_id, id)
    // pair is unique via the supporting
    // search_market_profiles_project_id_id_idx index added to
    // searchMarketProfiles). NULL market_profile_id means no profile is attached
    // and the FK is not enforced.
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // The SOLE versioned-identity rule:
    // (project_id, normalized_prompt, market_profile_id, version)
    // (schemas/migrations-reference.sql idx_search_prompts_unique). No other
    // business uniqueness exists.
    uniqueIndex(
      "search_prompts_unique_project_normalized_market_version_idx",
    ).on(
      table.projectId,
      table.normalizedPrompt,
      table.marketProfileId,
      table.version,
    ),
    // Project-scoped prompt reads.
    index("search_prompts_project_idx").on(table.projectId),
    // Topic -> prompts reads and the topic cascade delete path.
    index("search_prompts_topic_idx").on(table.topicId),
    // Market profile -> prompts reads and the profile cascade delete path.
    index("search_prompts_market_profile_idx").on(table.marketProfileId),
    // Supporting unique target for the geo_observation_runs composite FK
    // ((project_id, prompt_id) -> search_prompts(project_id, id), defined
    // below). id is already the PK, so this composite accepts exactly the rows
    // the PK accepts and adds no business uniqueness.
    uniqueIndex("search_prompts_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // Score-boundary checks directly required by the domain contract
    // (schemas/domain-types.ts SearchPrompt: businessFit and priority are
    // 0..100). These enforce the range only; no ranking behavior is created.
    check(
      "search_prompts_business_fit_range",
      sql`${table.businessFit} >= 0 AND ${table.businessFit} <= 100`,
    ),
    check(
      "search_prompts_priority_range",
      sql`${table.priority} >= 0 AND ${table.priority} <= 100`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, append-only geo observation runs.
//
// A geo observation run is the immutable record of ONE observation event — the
// raw "what occurred" fact (05_DOMAIN_DATA_MODEL.md §6 GeoObservationRun —
// Immutable). It is storage and contract only: no provider/execution/sampling/
// cache/parser/metrics/CRUD behavior is added here, and a row is written once
// and never updated.
//
// FIELD RECONCILIATION (05_DOMAIN_DATA_MODEL.md §6 is the direct contract):
//   - §6 field list is shipped verbatim (id, batch_id, project_id, prompt_id,
//     prompt_version, surface_type, surface_name, fidelity, provider?, engine?,
//     model?, model_version?, web_search?, search_mode?, market_profile_id?,
//     repeat_index, application_cache_bypassed, raw_answer, raw_response,
//     provider_request_id?, usage/cost, started_at, finished_at, status).
//   - `fidelity` (not the migration-reference `surface_fidelity`) is the column
//     name because §6 and the TASK field list name the direct field `fidelity`;
//     the reference SQL's surface_* prefix is a design-artifact rename.
//   - Raw payloads are captured as raw text columns only: `raw_answer` (the
//     observed answer text), `raw_response` (the full raw provider/engine
//     response payload) and `usage_json` (raw usage/cost payload). The
//     design-reference `raw_citations_json` and `raw_response_ref` are NOT
//     separate columns: citations stay inside the raw response payload and the
//     later Parse task extracts them into geo_citations; V1.0 has no external
//     raw-response store to point a ref at. No relationship is encoded in JSON.
//   - The reference/domain-types contextual fields `topic_id`, `country`,
//     `language` and `observed_at` are NOT shipped: the run's topic is the
//     same-Project SearchPrompt's topic (the prompt FK below keeps the run
//     project-bound), country/language market context is bound through the
//     optional market_profile_id + the prompt's language, and §6 already
//     records the occurrence window with started_at/finished_at. `created_at`
//     is the append-only creation timestamp the task requires.
//
// APPEND-ONLY SHAPE: the row has no `updated_at`, no update/delete API, no
// repository/service and no mutation surface in this task — immutability is by
// schema/contract shape, not a DB trigger. Raw observation and the later
// versioned parse stay separate (ADR-005).
//
// OWNERSHIP / RELATIONSHIPS (every relation is an explicit typed FK column):
//   - Each run belongs to an existing same-Project SearchPrompt: the composite
//     FK (project_id, prompt_id) -> search_prompts(project_id, id) carries this
//     row's project_id as its leading column, so a run on project A can never
//     reference a prompt on project B. The referenced (project_id, id) pair is
//     unique via the supporting `search_prompts_project_id_id_idx` index above.
//   - `prompt_version` records the observed prompt version as a typed fact
//     snapshot (§6). It is not a second FK: search_prompts.version is a value
//     on the same row the prompt FK already binds to.
//   - An optional same-Project market profile may scope the observation; the
//     composite FK (project_id, market_profile_id) ->
//     search_market_profiles(project_id, id) keeps it same-Project. NULL means
//     no profile attached.
//   - DELETE BEHAVIOR (no dangling run references): deleting a Prompt, a market
//     profile, or a whole Project cascades the run away. (Deleting a Topic
//     cascades its prompts, which in turn cascade their runs.) Cascade matches
//     the accepted tree-wide teardown convention of the earlier Search Growth
//     tables and keeps whole-Project deletion operational.
//
// NO BUSINESS UNIQUENESS: fresh GEO sampling must create independent rows for
// repeats of the same prompt/provider/model/surface (21_TEST_ACCEPTANCE_PLAN.md
// §3), so no business-rule unique index exists. The one unique index below
// (`geo_observation_runs_project_id_id_idx`) exists ONLY as the required unique
// target of the geo_observation_parses composite FK
// ((project_id, run_id) -> geo_observation_runs(project_id, id)); id is already
// the PK, so it accepts exactly the rows the PK accepts and adds no business
// uniqueness.
// ============================================================================

export const geoObservationRuns = sqliteTable(
  "geo_observation_runs",
  {
    id: text("id").primaryKey(),
    // The observation batch this run belongs to. Free-form grouping id (V1.0
    // defines no batch table); a batch of repeats produces multiple run rows.
    batchId: text("batch_id").notNull(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The stable SearchPrompt id observed (search_prompts.id). Bound to the
    // run's project by the composite FK below.
    promptId: text("prompt_id").notNull(),
    // The observed prompt version, recorded as the fact snapshot (§6). The
    // referenced prompt row's own `version` is the same value; this is stored
    // so the immutable run is self-describing without a join.
    promptVersion: integer("prompt_version").notNull(),
    // The observation surface kind. DB text-enum column with the canonical
    // ObservationSurfaceType values (schemas/domain-types.ts); the Zod boundary
    // rejects unsupported/case-mismatched/empty values at runtime.
    surfaceType: text("surface_type", {
      enum: [
        "AGGREGATED_SEARCH_DATA",
        "MODEL_API_SEARCH",
        "CONSUMER_PRODUCT_OBSERVED",
        "MANUAL_CONSUMER_OBSERVATION",
      ],
    }).notNull(),
    // The concrete surface observed (engine/product/API name). Free text; the
    // observed surface's identity/name is not an enum in V1.0.
    surfaceName: text("surface_name").notNull(),
    // How faithful the observation is to the consumer surface. DB text-enum
    // column with the canonical SurfaceFidelity values (schemas/domain-types
    // .ts); the Zod boundary validates it at runtime.
    fidelity: text("fidelity", {
      enum: [
        "AGGREGATED",
        "API_SIMULATION",
        "CONSUMER_OBSERVED",
        "MANUAL_OBSERVED",
      ],
    }).notNull(),
    // Optional provider / engine / model / model version that produced the
    // observation. Free-text provenance fields; no provider enum is invented.
    provider: text("provider"),
    engine: text("engine"),
    model: text("model"),
    modelVersion: text("model_version"),
    // Optional 3-state web-search flag: TRUE = web search enabled, FALSE = not,
    // NULL = unknown/not applicable for the surface.
    webSearch: integer("web_search", { mode: "boolean" }),
    // Optional search-mode label (free text; V1.0 defines no enum for it).
    searchMode: text("search_mode"),
    // Optional same-Project SearchMarketProfile the observation is scoped to;
    // NULL means no profile is attached. The composite FK below keeps it
    // same-Project and cascades runs away when a profile is deleted.
    marketProfileId: text("market_profile_id"),
    // Repeat ordinal of this observation within its sampling loop. Validated as
    // a non-negative integer at the Zod boundary and by the CHECK constraint
    // below. Fresh GEO sampling creates independent rows per repeat
    // (21_TEST_ACCEPTANCE_PLAN.md §3); no uniqueness rule groups them.
    repeatIndex: integer("repeat_index").notNull(),
    // Typed fresh-path flag. The direct fresh-path invariant
    // application_cache_bypassed=true is enforced by the later sampling/
    // execution path (ADR-003); this slice only persists the typed flag and
    // does not implement cache behavior.
    applicationCacheBypassed: integer("application_cache_bypassed", {
      mode: "boolean",
    }).notNull(),
    // Raw payload capture (raw text only, never parsed here): the observed
    // answer text and the full raw provider/engine response. NULL when an
    // observation ended before the surface returned a payload (e.g. a FAILED
    // run); the later Parse task extracts entities/citations from these.
    rawAnswer: text("raw_answer"),
    rawResponse: text("raw_response"),
    // The provider's request id for this observation (independent per run).
    providerRequestId: text("provider_request_id"),
    // Raw usage/cost payload (input/output tokens, cost, ...) captured as raw
    // JSON text (migrations-reference.sql usage_json). Not parsed here —
    // metrics behavior is a later task.
    usage: text("usage_json"),
    // The observation request window (§6). started_at is the request start; a
    // recorded run always started. finished_at is NULL only for a run that did
    // not reach a clean completion.
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    // Run lifecycle status (PENDING | RUNNING | SUCCEEDED | FAILED — the
    // canonical run-status union in schemas/domain-types.ts). DB text-enum
    // column; the Zod boundary validates it. Which states the future execution
    // path persists is that task's concern, not this storage slice's.
    status: text("status", {
      enum: ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"],
    }).notNull(),
    // Append-only creation timestamp (system insert time). No updated_at
    // column exists — the row is immutable once written.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the prompt: the run's project_id must equal
    // the prompt's project_id. Deleting a prompt removes its runs (referenced
    // (project_id, id) pair is unique via search_prompts_project_id_id_idx).
    foreignKey({
      columns: [table.projectId, table.promptId],
      foreignColumns: [searchPrompts.projectId, searchPrompts.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the optional market profile: when set, the
    // run's project_id must equal the profile's project_id. Deleting a profile
    // removes the runs scoped to it. NULL market_profile_id means no profile is
    // attached and the FK is not enforced.
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // Repeat index is a non-negative integer (schemas/domain-types.ts
    // GeoObservationRun.repeatIndex). The Zod boundary enforces the same rule.
    check(
      "geo_observation_runs_repeat_index_nonnegative",
      sql`${table.repeatIndex} >= 0`,
    ),
    // Project-scoped run reads.
    index("geo_observation_runs_project_idx").on(table.projectId),
    // Batch -> runs reads (a batch of repeats is listed together).
    index("geo_observation_runs_batch_idx").on(table.batchId),
    // Prompt -> runs reads and the prompt cascade delete path.
    index("geo_observation_runs_prompt_idx").on(table.promptId),
    // Market profile -> runs reads and the profile cascade delete path.
    index("geo_observation_runs_market_profile_idx").on(table.marketProfileId),
    // Supporting unique target for the geo_observation_parses composite FK
    // ((project_id, run_id) -> geo_observation_runs(project_id, id), defined
    // below). id is already the PK, so this composite accepts exactly the rows
    // the PK accepts and adds no business uniqueness.
    uniqueIndex("geo_observation_runs_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, append-only geo observation parses.
//
// A geo observation parse is the immutable, versioned record of ONE parser run
// over an already stored raw geo_observation_run (05_DOMAIN_DATA_MODEL.md §7,
// ADR-005). A parser upgrade creates another row for the same run — v1/v2
// coexist and each row snapshots its parser version. This task is storage and
// contract only: no parser, reparse workflow, current-pointer selection,
// metrics, entity/citation extraction, recommendation logic or provider action
// is implemented here.
//
// FIELD RECONCILIATION (05_DOMAIN_DATA_MODEL.md §7 is the direct field
// contract; schemas/domain-types.ts GeoObservationParse and
// schemas/migrations-reference.sql geo_observation_parses supply reference
// context):
//   - §7's field list is shipped verbatim: id, run_id, parser_version,
//     parse_status, accuracy_status, parsed_at, is_current. `created_at` is the
//     append-only system insert timestamp the task requires. The parse is
//     distinct from the raw run: run_id references the immutable run and no raw
//     payload field is stored or updated here.
//   - `project_id` is the explicit Project ownership key added by the
//     PO-approved Round 2 data-contract recovery (TASK T107 Round 2): it lets
//     the DB itself enforce that a Parse belongs to the same Project as its Run
//     (composite FK below) and that a GeoEntityMention is Project-consistent
//     with its Parse/Entity. It is an ownership fact on an already-append-only
//     row — it enables no mutation/current-pointer/reparse behavior. §7's list
//     omits it exactly as it omits the stable `id` and `created_at`, which the
//     established schema convention requires.
//   - `parser_version` is TEXT (schemas/domain-types.ts parserVersion: string;
//     migrations-reference.sql parser_version TEXT): the parser package/version
//     identifier, not a numeric ordinal.
//   - `parse_status` is exactly SUCCESS | PARTIAL | FAILED and the optional
//     `accuracy_status` is exactly ACCURATE | PARTIAL | INACCURATE | UNKNOWN
//     when present (schemas/domain-types.ts GeoObservationParse unions). NULL
//     accuracy_status means no accuracy assessment was made (e.g. a FAILED
//     parse). Both are DB text-enum columns validated at the Zod boundary.
//   - `parsed_at` is the application-supplied moment the parse was produced (§7);
//     `created_at` is the separate append-only system insert timestamp.
//   - `is_current` is a required typed boolean whose documented storage default
//     is false. It persists a current-marker fact/default only; selecting or
//     switching the pointer requires later workflow logic — no partial unique
//     index or update behavior exists in this slice.
//   - The reference/domain-types fields parser_model, recommendation,
//     recommendation_confidence and parsed_json are NOT shipped: no parser
//     model/recommendation/parsed-payload field belongs to this storage slice,
//     and parsed entities/citations/relationships are NOT encoded in JSON/text
//     — later normalized GeoEntityMention/GeoCitation tasks own that data.
//
// APPEND-ONLY SHAPE: the row has no `updated_at`, no update/delete API, no
// repository/service and no mutation surface in this task — immutability is by
// schema/contract shape, not a DB trigger (21_TEST_ACCEPTANCE_PLAN.md §6). The
// raw run row is never touched by parse writes.
//
// RELATIONSHIP / DELETE BEHAVIOR (explicit typed FK columns):
//   - `project_id` names the owning Project and is a NOT NULL FK to projects(id)
//     with ON DELETE CASCADE (the established Project-scoping FK every Search
//     Growth row carries). Deleting a whole Project therefore removes its parses
//     directly as well as through the run cascade below.
//   - run_id references the immutable geo_observation_runs(id) row this parse
//     was computed from. The SAME-PROJECT composite FK
//     (project_id, run_id) -> geo_observation_runs(project_id, id) carries this
//     row's project_id as its leading column, so a parse on project A can never
//     be attached to a run on project B — the DB rejects it. Deleting a run (or,
//     through the run's own Project/Prompt cascade, a whole project/prompt)
//     CASCADES its parses away, so a parse can never dangle.
//   - `(run_id, parser_version)` is the SOLE version-identity rule
//     (migrations-reference.sql idx_geo_parse_version): it permits v1/v2
//     coexistence for one raw run and rejects a duplicate parser version of the
//     same run. There is no global or current-pointer uniqueness rule — two
//     different runs may each have their own v1/v2 parses.
//   - `geo_observation_parses_project_id_id_idx` (unique on (project_id, id))
//     exists ONLY as the required unique target of the geo_entity_mentions
//     composite FK ((project_id, parse_id) -> geo_observation_parses(project_id,
//     id)). id is already the PK, so it adds no business uniqueness.
//
// Read access to a run's parses and the run-delete cascade path are served by
// the unique (run_id, parser_version) index's leading run_id column, so no
// separate run_id index is needed (the migration reference defines none either).
// Project-scoped parse reads are served by the (project_id, id) unique index's
// leading project_id column.
// ============================================================================

export const geoObservationParses = sqliteTable(
  "geo_observation_parses",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable raw run this parse was computed from (geo_observation_runs
    // .id). Bound to the row's project by the composite FK below, which cascades
    // parses away when the run is deleted.
    runId: text("run_id").notNull(),
    // Parser package/version identifier (TEXT). A parser upgrade inserts a new
    // row with a new version — the unique index below is the versioned-identity
    // rule that lets v1/v2 coexist and rejects a duplicate version per run.
    parserVersion: text("parser_version").notNull(),
    // Parse outcome (SUCCESS | PARTIAL | FAILED — the canonical
    // schemas/domain-types.ts GeoObservationParse.parseStatus union). DB
    // text-enum column; the Zod boundary rejects unsupported/case-mismatched/
    // empty values at runtime.
    parseStatus: text("parse_status", {
      enum: ["SUCCESS", "PARTIAL", "FAILED"],
    }).notNull(),
    // Optional accuracy assessment (ACCURATE | PARTIAL | INACCURATE | UNKNOWN —
    // the canonical GeoObservationParse.accuracyStatus union). DB text-enum
    // column; NULL means no accuracy assessment was made (e.g. a FAILED parse).
    accuracyStatus: text("accuracy_status", {
      enum: ["ACCURATE", "PARTIAL", "INACCURATE", "UNKNOWN"],
    }),
    // The application-supplied moment this parse was produced (§7). Distinct
    // from the append-only system `created_at` insert timestamp below.
    parsedAt: text("parsed_at").notNull(),
    // Current-marker fact/default only (documented storage default false).
    // Required typed boolean; selecting/switching the pointer is later workflow
    // logic and is NOT implemented here.
    isCurrent: integer("is_current", { mode: "boolean" })
      .notNull()
      .default(false),
    // Append-only creation timestamp (system insert time). No updated_at column
    // exists — the row is immutable once written.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the run: the parse's project_id must equal
    // the run's project_id. Deleting a run removes its parses (the referenced
    // (project_id, id) pair is unique via the supporting
    // geo_observation_runs_project_id_id_idx unique index on geoObservationRuns,
    // which the run's Project FK/Prompt FK already lead with).
    foreignKey({
      columns: [table.projectId, table.runId],
      foreignColumns: [geoObservationRuns.projectId, geoObservationRuns.id],
    }).onDelete("cascade"),
    // The SOLE version-identity rule (migrations-reference.sql
    // idx_geo_parse_version): (run_id, parser_version). v1/v2 parses of the
    // same raw run coexist; a duplicate parser version of the same run is
    // rejected. The leading run_id column also serves run -> parses reads and
    // the run-delete cascade path. No global or current-pointer uniqueness.
    uniqueIndex("geo_observation_parses_run_version_unique_idx").on(
      table.runId,
      table.parserVersion,
    ),
    // Supporting unique target for the geo_entity_mentions composite FK
    // ((project_id, parse_id) -> geo_observation_parses(project_id, id), defined
    // below). id is already the PK, so this composite accepts exactly the rows
    // the PK accepts and adds no business uniqueness.
    uniqueIndex("geo_observation_parses_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized geo entity mentions.
//
// A geo entity mention is one normalized mention/recommendation fact extracted
// from a specific versioned parse (05_DOMAIN_DATA_MODEL.md §7 GeoEntityMention,
// ADR-004/ADR-005). The later parser writes one row per tracked entity the
// source answer mentioned (or explicitly did not mention); this slice is
// storage and contract only — no parsing, entity extraction/matching, mention/
// recommendation/sentiment scoring, reparse workflow, current-pointer
// selection, CRUD or provider action is implemented here.
//
// FIELD RECONCILIATION (05_DOMAIN_DATA_MODEL.md §7 is the direct field
// contract; schemas/domain-types.ts GeoEntityMention and
// schemas/migrations-reference.sql geo_entity_mentions supply reference
// context):
//   - The stable `id` primary key is required by the established Search Growth
//     schema convention (every V1.0 row has a stable text id; §7's snippet
//     omits it only because it lists relations first). `created_at` is the
//     append-only system insert timestamp shared by every accepted sibling
//     table.
//   - `project_id` is the explicit Project ownership key added by the
//     PO-approved Round 2 data-contract recovery (TASK T107 Round 2). Round 1
//     documented that the direct §7 mention contract carries no project column,
//     so a mention could only be project-bound transitively and the entity_id
//     FK could not be same-Project-enforced. Round 2 adds the row's own
//     project_id so the DB itself binds a mention to a concrete same-Project
//     Parse AND a concrete same-Project TrackedEntity (composite FKs below). It
//     is an ownership fact on an already-append-only row — it enables no
//     mutation/current-pointer/reparse behavior.
//   - `parse_id` (NOT NULL) references the concrete, immutable
//     `geo_observation_parses(id)` row this mention was computed from and
//     `entity_id` (NOT NULL) references the tracked_entities(id) stable
//     identity (ADR-004). Parse-version isolation is therefore structural:
//     mentions stay attached to the exact source Parse row (v1 or v2), never to
//     a mutable "current" parse pointer, and deleting a parse/entity/project
//     cascades its mentions away so no mention can dangle.
//   - `mentioned` is the required V1.0 boolean (the parse's mention verdict for
//     this entity). `recommended` (nullable boolean), `mention_position`
//     (nullable integer), `sentiment` (nullable free text) and `evidence_text`
//     (nullable free text) follow the direct contract/nullability: NULL means
//     the parser recorded no value (e.g. an entity that was not mentioned has
//     no recommendation/position/sentiment/evidence).
//   - `sentiment` is §7's `sentiment?`. V1.0 defines no sentiment enum or
//     scale (07_GEO_MEASUREMENT_SPEC.md §5 treats sentiment as nuanced LLM
//     output), so it is stored verbatim as nullable free TEXT — no sentiment
//     enum/score is invented.
//   - `evidence_text` realises §7's `evidence_span_ref?` as the literal
//     evidence-span text (schemas/domain-types.ts `evidenceText`,
//     schemas/migrations-reference.sql `evidence_text`): the snippet of the
//     source answer that evidences the mention. V1.0 has no separate span
//     object/table to point at, so the span reference is the span text itself.
//   - The reference-only/context fields are NOT shipped: there is no parse-
//     output JSON blob, no current/pointer column, no matching/ranking/score
//     column and no duplicate of Project/Parse/Entity storage.
//
// PROJECT SCOPING: ownership is EXPLICIT on the row and database-enforced. The
// mention carries its own project_id (a NOT NULL FK to projects(id) with ON
// DELETE CASCADE, the established Project-scoping FK every Search Growth row
// carries) and two SAME-PROJECT composite FKs whose leading column is that
// project_id:
//   - (project_id, parse_id)     -> geo_observation_parses(project_id, id)
//   - (project_id, entity_id)    -> tracked_entities(project_id, id)
// so the DB (not application convention) rejects a mention whose Parse and
// TrackedEntity belong to different Projects, and rejects a mention row whose
// own project_id does not match its Parse or its Entity. Deleting a Project, a
// parse, or a tracked entity cascades the mention away, so a mention can never
// dangle.
//
// NO UNIQUENESS: neither §7, the domain type nor the migration reference
// defines an identity/uniqueness rule for mentions (the same entity can be
// mentioned at several positions/evidence spans in one answer), so no
// business-unique index is added. The two non-unique indexes below serve the
// parse -> mentions and entity -> mentions read paths and their cascade delete
// paths only.
// ============================================================================

export const geoEntityMentions = sqliteTable(
  "geo_entity_mentions",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable, versioned parse this mention was computed from
    // (geo_observation_parses.id, ADR-005). Mentions attach to this concrete
    // Parse row — never to a mutable current pointer. Bound to the row's
    // project by the composite FK below, which cascades mentions away when the
    // parse (or, through the run/parse cascade, a whole project) is deleted.
    parseId: text("parse_id").notNull(),
    // The tracked entity this mention is about (tracked_entities.id, ADR-004).
    // Bound to the row's project by the composite FK below, which cascades
    // mentions away when the entity is deleted.
    entityId: text("entity_id").notNull(),
    // The parse's mention verdict: true = the source answer mentioned the
    // entity, false = the parser explicitly recorded it was not mentioned.
    // Required boolean; no storage default (a mention row always states a
    // verdict).
    mentioned: integer("mentioned", { mode: "boolean" }).notNull(),
    // Optional recommendation verdict (nullable boolean): NULL means no
    // recommendation was recorded (e.g. the entity was not mentioned).
    recommended: integer("recommended", { mode: "boolean" }),
    // Optional mention position in the source answer (nullable integer). No
    // ordinal/ranking behavior is defined by the direct contract; the column
    // stores the parser's position fact only.
    mentionPosition: integer("mention_position"),
    // Optional nuanced sentiment (nullable free text; §7 `sentiment?`). V1.0
    // defines no sentiment enum/scale, so the parser's verbatim sentiment text
    // is stored — no sentiment enum is invented.
    sentiment: text("sentiment"),
    // Optional evidence-span reference realised as the evidence span's literal
    // text (nullable; schemas/domain-types.ts `evidenceText`,
    // migrations-reference.sql `evidence_text`).
    evidenceText: text("evidence_text"),
    // Append-only creation timestamp (system insert time). No updated_at
    // column exists — a mention is written once as part of its immutable parse.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the concrete parse: the mention's project_id
    // must equal the parse's project_id. Deleting a parse removes its mentions
    // (the referenced (project_id, id) pair is unique via the supporting
    // geo_observation_parses_project_id_id_idx unique index above). A mention
    // whose parse lives on another Project has no matching parent row and is
    // rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.parseId],
      foreignColumns: [geoObservationParses.projectId, geoObservationParses.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the tracked entity: the mention's project_id
    // must equal the entity's project_id. Deleting an entity removes its
    // mentions (the referenced (project_id, id) pair is unique via the
    // supporting tracked_entities_project_id_id_idx unique index above). A
    // mention whose entity lives on another Project has no matching parent row
    // and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.entityId],
      foreignColumns: [trackedEntities.projectId, trackedEntities.id],
    }).onDelete("cascade"),
    // Parse -> mentions reads and the parse-delete cascade path.
    index("geo_entity_mentions_parse_idx").on(table.parseId),
    // Entity -> mentions reads and the entity-delete cascade path.
    index("geo_entity_mentions_entity_idx").on(table.entityId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized geo citations.
//
// A geo citation is one normalized citation fact the parser recognised in a
// source answer (05_DOMAIN_DATA_MODEL.md §7 GeoCitation, ADR-005): the raw URL
// exactly as cited plus the reconciled identity fields (normalized URL, domain,
// source ownership and, once a later receipt-matching task resolves it, the
// matched publication receipt). This slice is storage and contract only — no
// parser, URL normalization implementation, ownership classification logic,
// receipt matching, attribution, provider/network, CRUD or external action is
// implemented here, and the raw/normalized URL values in tests are fixtures a
// later out-of-scope task will produce.
//
// FIELD RECONCILIATION (05_DOMAIN_DATA_MODEL.md §7 is the direct field
// contract; schemas/domain-types.ts GeoCitation and schemas/migrations-reference
// .sql geo_citations supply reference context):
//   - The stable `id` primary key and the append-only `created_at` system
//     timestamp are the additions the established Search Growth schema
//     convention requires (every V1.0 row has a stable text id and §7's snippet
//     omits it only because it lists relations first).
//   - `project_id` is the explicit Project ownership key (the T107 Round 2
//     pattern): the citation carries its own project so the DB itself binds it
//     to a same-Project concrete Parse (composite FK below). It is an ownership
//     fact on an already-append-only row — it enables no mutation/current-
//     pointer/reparse behavior.
//   - §7 lists `run_id / parse_id`; this table binds the CONCRETE PARSE
//     (`parse_id`, NOT NULL) rather than a run. A citation is a parser-
//     extracted/reconciled output of a specific immutable parser version
//     (ADR-005; T106/T107 establish that parsed citations are normalized by a
//     later GeoCitation task), so binding the source parse is what makes
//     Parse-version isolation structural: a parser upgrade creates a new parse
//     row whose citations coexist with — and never overwrite — the prior
//     version's citations. The citation's run is the source parse's run,
//     reachable through geo_observation_parses.run_id, so no run_id column is
//     duplicated here (a run-bound copy would denormalise the Parse -> Run
//     relation and could name a run different from the citation's parse). The
//     reference/domain-types `run_id` is reconciled as that transitive run
//     binding; run-level raw-citation storage was already reconciled out of the
//     accepted run schema (T105 keeps raw citations inside the raw response
//     payload until a parse extracts them).
//   - `raw_url` (NOT NULL) is the citation URL exactly as the answer cited it
//     and `normalized_url` (NOT NULL) is its normalized identity key
//     (migrations-reference.sql normalized_url; 07_GEO_MEASUREMENT_SPEC.md §8).
//     No normalization algorithm exists in this slice — the columns store the
//     later task's outputs.
//   - `domain` (NOT NULL) is the citation site domain; `title` (nullable) and
//     `position` (nullable integer) are the optional citation title and ordinal
//     position in the answer. `position` follows §7's direct field name (the
//     reference `citation_position` is a design-artifact rename, as in the T105
//     `fidelity` reconciliation). NULL title/position means the source answer
//     gave none.
//   - `source_ownership` is exactly the V1.0 CitationOwnership union
//     (OWNED_DOMAIN | CONTROLLED_PUBLICATION | EARNED_THIRD_PARTY | COMPETITOR
//     | UNKNOWN — schemas/domain-types.ts CitationOwnership). DB text-enum
//     column; the Zod boundary in src/types/schemas/geo-citation.ts rejects
//     unsupported/case-mismatched/empty values. No classification logic runs
//     here.
//   - `matched_publication_receipt_id` is the optional publication-receipt
//     relation (§7 `matched_publication_receipt_id?`; migrations-reference.sql
//     declares the same unconstrained nullable column). The publication_receipts
//     table does not exist in the accepted schema yet (it arrives with the
//     Release/Distribution tasks), so this slice stores the scalar reference
//     exactly as the reference SQL does; the same-Project composite FK to
//     publication_receipts is added by that later task's migration alongside
//     the table itself.
//   - The reference-only context fields `source_type` and `safe_url_status` are
//     NOT shipped: the TASK field list names no source-type/safe-URL column,
//     and no classification/URL-safety behavior is authorized here.
//
// PROJECT SCOPING / DELETE BEHAVIOR: ownership is EXPLICIT on the row and
// database-enforced. The citation carries its own project_id (a NOT NULL FK to
// projects(id) with ON DELETE CASCADE, the established Project-scoping FK) and
// one SAME-PROJECT composite FK whose leading column is that project_id:
// (project_id, parse_id) -> geo_observation_parses(project_id, id), so the DB
// rejects a citation whose concrete Parse belongs to another Project and rejects
// a citation row whose own project_id does not match its Parse. Parse-version
// isolation is structural: citations stay attached to the exact source Parse row
// (v1 or v2), never to a mutable "current" parse pointer. Deleting a Project or
// a parse cascades the citation away (a parse is immutable and has no delete
// API; the cascade only fires on whole-Project teardown or an explicit
// parser-version cleanup), so a citation can never dangle.
//
// NO BUSINESS UNIQUENESS: the migration reference's `(run_id, normalized_url)`
// unique index is intentionally NOT shipped — the TASK forbids business
// uniqueness, and the same URL can legitimately be cited at several positions /
// by several parse versions. The single non-unique index below serves the
// parse -> citations read path and its cascade delete path only.
// ============================================================================

export const geoCitations = sqliteTable(
  "geo_citations",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable, versioned parse that extracted/reconciled this citation
    // (geo_observation_parses.id, ADR-005). Citations attach to this concrete
    // Parse row — never to a mutable current pointer or to a bare run. Bound to
    // the row's project by the composite FK below, which cascades citations away
    // when the parse (or, through the run/parse cascade, a whole project) is
    // deleted.
    parseId: text("parse_id").notNull(),
    // The citation URL exactly as cited in the source answer. No normalization
    // is performed in this slice.
    rawUrl: text("raw_url").notNull(),
    // The normalized identity key of the citation URL (later URL-normalization
    // task output). Stored as an explicit typed column because it is the
    // identity input for the later URLIdentity/receipt matching
    // (07_GEO_MEASUREMENT_SPEC.md §8, 21_TEST_ACCEPTANCE_PLAN.md §25).
    normalizedUrl: text("normalized_url").notNull(),
    // The citation site domain (later attribution task output).
    domain: text("domain").notNull(),
    // Optional citation title from the source answer (NULL = none given).
    title: text("title"),
    // Optional ordinal position of the citation in the source answer (§7
    // `position`; NULL = no position recorded).
    position: integer("position"),
    // Source-ownership classification fact (OWNED_DOMAIN | CONTROLLED_PUBLICATION
    // | EARNED_THIRD_PARTY | COMPETITOR | UNKNOWN — the exact V1.0
    // CitationOwnership union). DB text-enum column; the Zod boundary validates
    // it. No classification logic exists in this slice; UNKNOWN is the value a
    // not-yet-classified citation would carry.
    sourceOwnership: text("source_ownership", {
      enum: [
        "OWNED_DOMAIN",
        "CONTROLLED_PUBLICATION",
        "EARNED_THIRD_PARTY",
        "COMPETITOR",
        "UNKNOWN",
      ],
    }).notNull(),
    // Optional publication-receipt relation (§7 `matched_publication_receipt_id?`).
    // Stored as an unconstrained scalar reference because the publication_receipts
    // table does not exist in the accepted schema yet; the later task that creates
    // it adds the same-Project composite FK. NULL = no receipt matched.
    matchedPublicationReceiptId: text("matched_publication_receipt_id"),
    // Append-only creation timestamp (system insert time). No updated_at column
    // exists — a citation is written once as part of its immutable parse.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the concrete parse: the citation's project_id
    // must equal the parse's project_id. Deleting a parse removes its citations
    // (the referenced (project_id, id) pair is unique via the supporting
    // geo_observation_parses_project_id_id_idx unique index on
    // geoObservationParses). A citation whose parse lives on another Project has
    // no matching parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.parseId],
      foreignColumns: [geoObservationParses.projectId, geoObservationParses.id],
    }).onDelete("cascade"),
    // Parse -> citations reads and the parse-delete cascade path.
    index("geo_citations_parse_idx").on(table.parseId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped growth opportunities.
//
// A search growth opportunity is the stored result of the later deterministic
// Opportunity/PageFit services (08_OPPORTUNITY_ENGINE_SPEC.md;
// 05_DOMAIN_DATA_MODEL.md §8 SearchGrowthOpportunity;
// schemas/domain-types.ts SearchGrowthOpportunity). This task is the storage
// and contract foundation ONLY — no opportunity computation, scoring engine,
// profile/PageFit calculation, ranking, recommendation runtime, CRUD, UI or
// external action is implemented here, and the score/data-quality/evidence
// values in tests are fixtures a later out-of-scope task will produce.
//
// FIELD RECONCILIATION (05_DOMAIN_DATA_MODEL.md §8 + the TASK field list are
// the direct contract; schemas/domain-types.ts SearchGrowthOpportunity and
// schemas/migrations-reference.sql growth_opportunities supply reference
// context):
//   - The stable `id` primary key, the explicit `project_id` Project key and
//     the `created_at`/`updated_at` system timestamps are the additions the
//     established Search Growth schema convention requires (every V1.0 row has
//     a stable text id; §8's snippet omits id/project_id/timestamps only
//     because it lists relations first). `updated_at` is shipped because an
//     opportunity is a mutable lifecycle row (a later re-computation refreshes
//     it in place) — unlike the append-only run/parse/citation tables, §8 and
//     the migration reference both carry `updated_at`.
//   - `topic_id` (NOT NULL) binds the opportunity to its stable same-Project
//     SearchTopic and `market_profile_id` (nullable) optionally scopes it to a
//     same-Project SearchMarketProfile (§8 `market_profile_id`; the TASK field
//     list "optional MarketProfile"). Both are DB-enforced by SAME-PROJECT
//     composite FKs whose leading column is this row's project_id, so an
//     opportunity can never reference a Topic or MarketProfile on another
//     Project. `market_profile_id` NULL means no profile is attached.
//   - `profile` is exactly the canonical V1.0 OpportunityProfile union
//     (EXISTING_GOOGLE_PAGE | EXISTING_SEARCH_PAGE_PARTIAL | NEW_TOPIC |
//     GEO_DISTRIBUTION | EVIDENCE_ONLY | TECHNICAL_BLOCKER —
//     schemas/domain-types.ts OpportunityProfile, 21_TEST_ACCEPTANCE_PLAN.md
//     §7). §8 names the field `type`; the domain type and the migration
//     reference name it `profile`, which is the shipped column (TASK
//     "profile/type"). The DB text-enum column plus the named CHECK below and
//     the Zod boundary in src/types/schemas/search-growth-opportunity.ts
//     reject unsupported/case-mismatched/empty values; no profile/PageFit
//     computation happens here.
//   - `page_fit_action` is exactly the canonical V1.0 PageFitAction union
//     (NEW_PAGE | REFRESH_PAGE | MERGE | DISTRIBUTE_ONLY | EVIDENCE_ONLY |
//     TECHNICAL_FIX — schemas/domain-types.ts PageFitAction,
//     21_TEST_ACCEPTANCE_PLAN.md §8). DB text-enum column + named CHECK below +
//     Zod boundary; storage/contract only.
//   - `target_page_url` (nullable) is the optional same-site target page the
//     action applies to (§8 `target_page_url?`).
//   - The score, data-quality and evidence payloads are IMMUTABLE SNAPSHOT
//     columns (opaque JSON text, exactly as the migration reference declares
//     them):
//       * `score_json` (NOT NULL) holds the whole canonical `scores` snapshot
//         (schemas/domain-types.ts SearchGrowthOpportunity.scores — the
//         component scores plus the optional `finalScore`; the migration
//         reference's separate `final_score REAL` is that same value inside the
//         snapshot and is NOT duplicated as a second column to avoid two
//         storage representations of one immutable value drifting).
//       * `data_quality_json` (NOT NULL) holds the whole canonical DataQuality
//         snapshot (status + warnings[] + optional sample counts —
//         schemas/domain-types.ts DataQuality; the migration reference
//         `data_quality_json`). The DataQuality status/warning enums are the
//         directly supported boundary (validated in the Zod module); the
//         snapshot is stored as one JSON payload, never as relational identity.
//       * `evidence_snapshot_json` (NOT NULL) holds the opaque evidence
//         payload (§8 `evidence_snapshot_json`; domain-types
//         `evidenceSnapshot`).
//     No value inside any snapshot is ever used as a relationship key or
//     duplicate of the Project/Topic/MarketProfile columns — relational data
//     stays in typed FK columns only.
//   - `reason` (NOT NULL) and `recommended_action` (NOT NULL) are the direct
//     §8 text fields; `source_snapshot_at` (NOT NULL) is the application-
//     supplied moment the source data snapshot was taken (domain-types
//     `sourceSnapshotAt`; the TASK field list "source snapshot time"), distinct
//     from the system `created_at`/`updated_at` timestamps.
//   - The reference-only `status` lifecycle column in the migration reference
//     is NOT shipped: §8, the domain type, the TASK field list and the
//     21_TEST_ACCEPTANCE_PLAN §7–8 profile/PageFit contract define no
//     opportunity lifecycle union, and no workflow is authorized here.
//
// RELATIONSHIP / DELETE BEHAVIOR (explicit typed FK columns, no JSON
// relationships): `project_id` is a NOT NULL FK to projects(id) ON DELETE
// CASCADE (the established Project-scoping FK every Search Growth row carries).
// The SAME-PROJECT composite FKs below lead with this row's project_id:
//   - (project_id, topic_id)         -> search_topics(project_id, id)
//   - (project_id, market_profile_id)-> search_market_profiles(project_id, id)
// so the DB (not application convention) rejects an opportunity whose Topic or
// MarketProfile belongs to another Project and rejects a row whose own
// project_id does not match them. The referenced (project_id, id) pairs are
// unique via the supporting `search_topics_project_id_id_idx` (0046) and
// `search_market_profiles_project_id_id_idx` (0049) target indexes accepted by
// earlier tasks — this task adds no supporting target index for those two FKs.
// The `search_growth_opportunities_project_id_id_idx` unique index in the table
// callback below exists ONLY as the required referential target of the T117
// content_packages same-Project composite FK
// ((project_id, opportunity_id) -> search_growth_opportunities(project_id, id),
// added below by the T117 0062 migration) — id is already the PK, so the
// composite accepts exactly the rows the PK accepts and adds no business
// uniqueness. Deleting a Topic,
// a MarketProfile (cascading opportunities scoped to it), or a whole Project
// cascades the opportunity away, so an opportunity can never dangle.
//
// The two non-unique indexes below serve the topic -> opportunities and market
// profile -> opportunities read paths and their parent-cascade delete paths
// only. There is no business-rule unique index: no V1.0 artifact constrains
// how many opportunities a Topic/MarketProfile may carry or dedupes them (the
// later scoring service defines any refresh policy), and the TASK forbids
// additional business uniqueness.
// ============================================================================

export const searchGrowthOpportunities = sqliteTable(
  "search_growth_opportunities",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The stable SearchTopic id (search_topics.id, ADR-004) this opportunity
    // belongs to. Bound to the row's project by the composite FK below, which
    // cascades opportunities away when the topic is deleted.
    topicId: text("topic_id").notNull(),
    // Optional same-Project SearchMarketProfile the opportunity is scoped to;
    // NULL means no profile is attached. The composite FK below keeps it
    // same-Project and cascades the opportunity away when the profile is
    // deleted.
    marketProfileId: text("market_profile_id"),
    // The opportunity profile (EXISTING_GOOGLE_PAGE | EXISTING_SEARCH_PAGE_PARTIAL
    // | NEW_TOPIC | GEO_DISTRIBUTION | EVIDENCE_ONLY | TECHNICAL_BLOCKER — the
    // exact canonical OpportunityProfile union). DB text-enum column + the
    // named CHECK below; the Zod boundary validates it. No profile computation
    // exists in this slice.
    profile: text("profile", {
      enum: [
        "EXISTING_GOOGLE_PAGE",
        "EXISTING_SEARCH_PAGE_PARTIAL",
        "NEW_TOPIC",
        "GEO_DISTRIBUTION",
        "EVIDENCE_ONLY",
        "TECHNICAL_BLOCKER",
      ],
    }).notNull(),
    // The page-fit action (NEW_PAGE | REFRESH_PAGE | MERGE | DISTRIBUTE_ONLY |
    // EVIDENCE_ONLY | TECHNICAL_FIX — the exact canonical PageFitAction union).
    // DB text-enum column + the named CHECK below; the Zod boundary validates
    // it. No PageFit computation exists in this slice.
    pageFitAction: text("page_fit_action", {
      enum: [
        "NEW_PAGE",
        "REFRESH_PAGE",
        "MERGE",
        "DISTRIBUTE_ONLY",
        "EVIDENCE_ONLY",
        "TECHNICAL_FIX",
      ],
    }).notNull(),
    // Optional same-site target page URL the action applies to (NULL = the
    // action does not target an existing page, e.g. NEW_PAGE/DISTRIBUTE_ONLY).
    targetPageUrl: text("target_page_url"),
    // Immutable score snapshot (the whole canonical `scores` object incl. the
    // optional finalScore). Opaque JSON text; never parsed/queried here and
    // never used as relational identity.
    scoreJson: text("score_json").notNull(),
    // Immutable DataQuality snapshot (status + warnings[] + optional sample
    // counts). Opaque JSON text; the DataQuality status/warning enums are the
    // Zod boundary. Never used as relational identity.
    dataQualityJson: text("data_quality_json").notNull(),
    // Immutable evidence payload snapshot (opaque JSON text).
    evidenceSnapshotJson: text("evidence_snapshot_json").notNull(),
    // The human-readable explanation of why this opportunity exists (§8).
    reason: text("reason").notNull(),
    // The concrete recommended action text (§8) — e.g. "Refresh /solutions/rfq",
    // never a vague "improve content quality".
    recommendedAction: text("recommended_action").notNull(),
    // The application-supplied moment the source-data snapshot was taken
    // (domain-types `sourceSnapshotAt`). Distinct from the system timestamps.
    sourceSnapshotAt: text("source_snapshot_at").notNull(),
    // System insert/update timestamps (mutable lifecycle row; the later
    // re-computation service refreshes the row in place and sets updated_at).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the topic: the opportunity's project_id must
    // equal the topic's project_id. Deleting a topic removes its opportunities
    // (the referenced (project_id, id) pair is unique via the supporting
    // search_topics_project_id_id_idx index created in 0046).
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the optional market profile: when set, the
    // opportunity's project_id must equal the profile's project_id. Deleting a
    // profile removes the opportunities scoped to it (the referenced
    // (project_id, id) pair is unique via the supporting
    // search_market_profiles_project_id_id_idx index created in 0049). NULL
    // market_profile_id means no profile is attached and the FK is not
    // enforced.
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // DB-level enum rejection for the two canonical unions (the TASK requires
    // migration-backed enum rejection; the Zod boundary enforces the same lists
    // at the runtime edge).
    check(
      "search_growth_opportunities_profile_valid",
      sql`(${table.profile} IN ('EXISTING_GOOGLE_PAGE','EXISTING_SEARCH_PAGE_PARTIAL','NEW_TOPIC','GEO_DISTRIBUTION','EVIDENCE_ONLY','TECHNICAL_BLOCKER'))`,
    ),
    check(
      "search_growth_opportunities_page_fit_action_valid",
      sql`(${table.pageFitAction} IN ('NEW_PAGE','REFRESH_PAGE','MERGE','DISTRIBUTE_ONLY','EVIDENCE_ONLY','TECHNICAL_FIX'))`,
    ),
    // Topic -> opportunities reads and the topic-delete cascade path.
    index("search_growth_opportunities_topic_idx").on(table.topicId),
    // Market profile -> opportunities reads and the profile-delete cascade path.
    index("search_growth_opportunities_market_profile_idx").on(
      table.marketProfileId,
    ),
    // Supporting unique target for the T117 content_packages same-Project
    // composite FK ((project_id, opportunity_id) ->
    // search_growth_opportunities(project_id, id), added below by the T117 0062
    // migration). id is already the PK, so this composite accepts exactly the
    // rows the PK accepts and adds no business uniqueness.
    uniqueIndex("search_growth_opportunities_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, append-only source references.
//
// A source reference is one captured evidence source behind a later Claim or
// ContentPackageVersion (05_DOMAIN_DATA_MODEL.md §9 SourceRef;
// 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §10 "Source traceability"). This slice is
// storage and contract ONLY — no claim, verification, crawling, URL fetching,
// content, reachability/URL validation, source-content classification or
// inference, CRUD or UI is implemented here, and the `ref` values in tests are
// fixtures a later out-of-scope capture/verification task will produce.
//
// FIELD RECONCILIATION (05_DOMAIN_DATA_MODEL.md §9 is the direct field contract;
// schemas/domain-types.ts SourceRef and schemas/migrations-reference.sql
// source_refs are the legacy reference artifacts this task explicitly
// reconciles):
//   - The stable `id` primary key, the explicit `project_id` ownership key and
//     the append-only `created_at` system timestamp are the additions the
//     established Search Growth schema convention requires (every V1.0 row has a
//     stable text id; §9's snippet lists only the relation-facing fields).
//   - `type` (NOT NULL) is exactly the V1.0 SourceRef type union URL |
//     INTERNAL_DOC | PRODUCT_FACT | RESEARCH (§9; TASK field contract "V1.0
//     `type`"). The legacy reference `kind` union (URL | INTERNAL_EVIDENCE |
//     CLAIM | PUBLICATION | OTHER — schemas/domain-types.ts) and the legacy
//     `source_kind` column name (schemas/migrations-reference.sql) are NOT
//     shipped: §9 replaces that union with its own four-value union, and there is
//     no free-form/OTHER fallback (no implicit/unknown type). The DB text-enum
//     column plus the named CHECK below reject unsupported/case-mismatched/
//     empty values at the storage boundary; the Zod boundary in
//     src/types/schemas/source-ref.ts enforces the same union at runtime.
//   - `ref` (NOT NULL) is the §9 reference value exactly as captured — an opaque
//     text reference whose meaning follows `type` (a URL for URL, an internal
//     document reference for INTERNAL_DOC, a product-fact reference for
//     PRODUCT_FACT, a research reference for RESEARCH). No fetching,
//     reachability check, URL normalization or content inspection happens in
//     this slice. The legacy separate `url`/`evidence_ref` columns collapse into
//     this single §9 reference field.
//   - `captured_at` (NOT NULL) is the application-supplied moment the source was
//     captured (§9). It is distinct from the append-only system `created_at`
//     insert timestamp below.
//   - The legacy reference-only fields `title`, `classification` and the
//     `source_kind`/`url`/`evidence_ref` split are NOT shipped: §9's SourceRef
//     defines no title or classification (the classification in the §9 Claim
//     block and on ContentPackageVersion belongs to those rows, not to each
//     source reference), and V1.0 names a single `ref` value. No classification
//     union is therefore invented on the row.
//
// APPEND-ONLY SHAPE: the row has no `updated_at`, no update/delete API, no
// repository/service and no mutation surface in this task — a captured source
// reference is written once and never changed (immutability is by schema/
// contract shape, matching the accepted run/parse/citation tables).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK every Search Growth
// row carries). source_refs is also the parent of the claim_source_refs
// relation added in T111 (0057): that relation's same-Project composite FK
// ((project_id, source_ref_id) -> source_refs(project_id, id)) requires the
// supporting composite unique index below. Deleting a whole Project cascades its
// source references away, so a source reference can never dangle.
//
// NO BUSINESS UNIQUENESS: neither §9, the legacy reference type nor the legacy
// migration reference defines an identity/uniqueness rule for source refs (the
// same source ref can be shared by many Claim/ContentVersion rows), so no
// business-unique index is added. The composite unique index below exists ONLY
// as the required referential target of the claim_source_refs same-Project FK
// ((project_id, id) is already unique because id is the PK, so the composite
// accepts exactly the PK's rows and adds no business uniqueness). The single
// non-unique index serves the project -> source-refs read path and the
// project-delete cascade path only.
// ============================================================================

export const sourceRefs = sqliteTable(
  "source_refs",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The V1.0 source type (URL | INTERNAL_DOC | PRODUCT_FACT | RESEARCH — the
    // exact §9 SourceRef union). DB text-enum column + the named CHECK below;
    // the Zod boundary validates it. No source classification/inference exists
    // in this slice.
    type: text("type", {
      enum: ["URL", "INTERNAL_DOC", "PRODUCT_FACT", "RESEARCH"],
    }).notNull(),
    // The §9 reference value exactly as captured (opaque text; meaning follows
    // `type`). Stored verbatim — no fetch/reachability/normalization/content
    // processing is performed here.
    ref: text("ref").notNull(),
    // The application-supplied moment the source was captured (§9). Distinct
    // from the append-only system `created_at` insert timestamp below.
    capturedAt: text("captured_at").notNull(),
    // Append-only creation timestamp (system insert time). No updated_at column
    // exists — a captured source reference is written once and never changed.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // DB-level enum rejection for the exact V1.0 SourceRef type union (the TASK
    // requires migration-backed enum rejection; the Zod boundary enforces the
    // same list at the runtime edge).
    check(
      "source_refs_type_valid",
      sql`(${table.type} IN ('URL','INTERNAL_DOC','PRODUCT_FACT','RESEARCH'))`,
    ),
    // Required referential target of the claim_source_refs same-Project
    // composite FK ((project_id, source_ref_id) -> (project_id, id)). id is
    // already the PK, so the composite accepts exactly the PK's rows and adds
    // no business uniqueness.
    uniqueIndex("source_refs_project_id_id_idx").on(table.projectId, table.id),
    // Project -> source-refs reads and the project-delete cascade path.
    index("source_refs_project_idx").on(table.projectId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped claims.
//
// A claim is one verifiable factual assertion a later ContentPackageVersion or
// content gate will rely on (05_DOMAIN_DATA_MODEL.md §9 Claim;
// 21_TEST_ACCEPTANCE_PLAN.md §10 "UNVERIFIED hard claim -> BLOCKED"). This
// slice is storage and contract ONLY — no claim verification/reverification,
// blocking logic, content/publication gate, provider call or runtime status
// transition is implemented here.
//
// FIELD RECONCILIATION (§9 and the TASK field list are the direct contract;
// schemas/domain-types.ts Claim and schemas/migrations-reference.sql claims are
// the legacy reference artifacts this task reconciles):
//   - The stable `id` primary key and the explicit `project_id` ownership key
//     are the additions the established Search Growth schema convention requires
//     (every V1.0 row has a stable text id; §9's snippet lists only the
//     relation-facing fields). `created_at`/`updated_at` are the system
//     timestamps of a mutable lifecycle row: the later controlled verification
//     workflow updates `status`/`verified_by`/`last_verified_at`/`expires_at` in
//     place on this same row, and the legacy migration reference `claims` row
//     carries both timestamps too.
//   - `claim_text` (NOT NULL) is the direct §9 assertion text.
//   - `status` (NOT NULL) is exactly the §9 ClaimStatus union APPROVED |
//     UNVERIFIED | EXPIRED | REJECTED, enforced by the DB text-enum column and
//     the named CHECK below (the Zod boundary in src/types/schemas/claim.ts
//     enforces the same union at runtime). The legacy reference type carries the
//     same union, so no legacy variant is reconciled OUT. There is no implicit/
//     unknown fallback and no DB default — the writer states the status
//     explicitly.
//   - `verified_by` (nullable) names the verifier once the claim is verified;
//     it stays free text in this slice (no verifier FK yet — the later
//     verification workflow defines the verifier-identity contract).
//   - `last_verified_at` / `expires_at` (both nullable) are the verification
//     workflow timestamps; both are NULL until the claim has been verified.
//   - `classification` (NOT NULL) is exactly the direct Claim classification
//     union PUBLIC_MARKETING | INTERNAL | RESTRICTED (the DataClassification
//     union the legacy reference type also carries), enforced by the DB
//     text-enum column and the named CHECK below (Zod boundary at runtime).
//   - The legacy `allowed_markets[]` / `allowed_languages[]` fields are NOT
//     shipped as JSON/text lists on this row: each is modeled as a normalized
//     same-Project relation table (claim_allowed_market_profiles in T112 and
//     claim_allowed_languages in T113), never as a JSON/text column on the
//     claim row.
//   - The legacy scalar evidence fields `evidence_type`/`evidence_ref`/
//     `source_url` are reconciled OUT: source evidence becomes the normalized
//     claim_source_refs relation below (TASK item 2), so no evidence payload
//     lives on the claim row.
//   - The legacy migrations-reference `normalized_claim` column is NOT shipped:
//     no normalization algorithm exists in this slice and the TASK field list
//     names only `claim_text`.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK every Search Growth
// row carries). The composite unique index below exists ONLY as the required
// referential target of the claim_source_refs same-Project FK
// ((project_id, claim_id) -> claims(project_id, id)); id is already the PK, so
// the composite accepts exactly the PK's rows and adds no business uniqueness.
// Deleting a whole Project cascades its claims (and therefore their source
// links) away, so a claim can never dangle.
//
// NO BUSINESS UNIQUENESS: no V1.0 artifact constrains claim_text/status
// uniqueness per project, so no business-unique index is added. The only
// uniqueness rule in this slice is the link identity enforced by the
// claim_source_refs table below (one row per Claim/SourceRef edge).
// ============================================================================

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The direct §9 assertion text. No normalization/derivation exists here.
    claimText: text("claim_text").notNull(),
    // The direct §9 ClaimStatus union (APPROVED | UNVERIFIED | EXPIRED |
    // REJECTED). DB text-enum column + the named CHECK below; the Zod boundary
    // validates it. No implicit/unknown fallback and no DB default.
    status: text("status", {
      enum: ["APPROVED", "UNVERIFIED", "EXPIRED", "REJECTED"],
    }).notNull(),
    // Free-text verifier id; NULL until the claim has been verified. The later
    // verification workflow defines the verifier-identity contract.
    verifiedBy: text("verified_by"),
    // The moment the claim was last verified; NULL until verified.
    lastVerifiedAt: text("last_verified_at"),
    // The moment the claim expires; NULL when no expiry is set.
    expiresAt: text("expires_at"),
    // The direct Claim classification union (PUBLIC_MARKETING | INTERNAL |
    // RESTRICTED). DB text-enum column + the named CHECK below; the Zod
    // boundary validates it.
    classification: text("classification", {
      enum: ["PUBLIC_MARKETING", "INTERNAL", "RESTRICTED"],
    }).notNull(),
    // System insert/update timestamps (mutable lifecycle row; the later
    // verification workflow updates status/verification fields in place and
    // sets updated_at).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Project -> claims reads and the project-delete cascade path.
    index("claims_project_idx").on(table.projectId),
    // Required referential target of the claim_source_refs same-Project
    // composite FK ((project_id, claim_id) -> (project_id, id)). id is already
    // the PK, so the composite accepts exactly the PK's rows and adds no
    // business uniqueness.
    uniqueIndex("claims_project_id_id_idx").on(table.projectId, table.id),
    // DB-level enum rejection for the two direct Claim unions (the TASK requires
    // migration-backed enum rejection; the Zod boundary enforces the same lists
    // at the runtime edge).
    check(
      "claims_status_valid",
      sql`(${table.status} IN ('APPROVED','UNVERIFIED','EXPIRED','REJECTED'))`,
    ),
    check(
      "claims_classification_valid",
      sql`(${table.classification} IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED'))`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project Claim <-> SourceRef relation.
//
// Each row is ONE link between a claim and a source reference that backs it
// (05_DOMAIN_DATA_MODEL.md §9 `source_refs[]`; TASK item 2). The relation is a
// normalized table — never a JSON/text array column on the claim row — and the
// row carries no mutable evidence payload: provenance stays on the linked
// source_refs rows, so later controlled Claim verification reads the evidence
// through the link without copying it here.
//
// SAME-PROJECT INTEGRITY is database-enforced by two composite foreign keys
// that carry this row's own project_id as their leading column:
//   (project_id, claim_id)      -> claims(project_id, id)
//   (project_id, source_ref_id) -> source_refs(project_id, id)
// A link whose claim and source reference belong to different Projects has no
// matching parent row for at least one FK and is rejected by the DB in either
// direction. Both parents expose the required unique (project_id, id) target
// (claims inline above; source_refs via the source_refs_project_id_id_idx
// supporting index this task adds to the T110 table). Deleting a claim, a
// source reference, or a whole Project cascades its links away, so a link can
// never dangle.
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate Claim/SourceRef edges
// (TASK item 3), so the unique index below rejects a duplicate
// (claim_id, source_ref_id) pair. No other uniqueness rule is invented. The
// reverse non-unique index serves the source_ref -> claims read path; the
// unique index's leading claim_id already serves the claim -> sources read
// path (the accepted search_topic_keyword_refs mapping pattern).
// ============================================================================

export const claimSourceRefs = sqliteTable(
  "claim_source_refs",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FKs below can carry it as their leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked claim (claims.id). Bound to this row's project by the
    // composite FK below.
    claimId: text("claim_id").notNull(),
    // The linked source reference (source_refs.id). Bound to this row's project
    // by the composite FK below.
    sourceRefId: text("source_ref_id").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries
    // no mutable payload and no updated_at — provenance lives on the source_ref.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the claim: this link's project_id must equal
    // the claim's project_id. Deleting a claim removes its source links (the
    // referenced (project_id, id) pair is unique via claims_project_id_id_idx).
    foreignKey({
      columns: [table.projectId, table.claimId],
      foreignColumns: [claims.projectId, claims.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the source reference: this link's project_id
    // must equal the source_ref's project_id. Deleting a source reference
    // removes its claim links (the referenced (project_id, id) pair is unique
    // via source_refs_project_id_id_idx added to source_refs in this task).
    foreignKey({
      columns: [table.projectId, table.sourceRefId],
      foreignColumns: [sourceRefs.projectId, sourceRefs.id],
    }).onDelete("cascade"),
    // Link identity: one row per (claim_id, source_ref_id) edge, so a duplicate
    // Claim/SourceRef link is rejected by the DB (TASK item 3). The leading
    // claim_id also serves the claim -> sources read path.
    uniqueIndex("claim_source_refs_unique_claim_source_idx").on(
      table.claimId,
      table.sourceRefId,
    ),
    // source_ref -> claims reads.
    index("claim_source_refs_source_ref_idx").on(table.sourceRefId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project Claim <-> SearchMarketProfile
// allowed-market relation.
//
// Each row is ONE allowed-market edge of a claim (05_DOMAIN_DATA_MODEL.md §9
// `allowed_markets[]`; TASK item 1). The allowed-market policy relation is a
// normalized table — never a JSON/text array column on the claim row (TASK item
// 2) — and the linked SearchMarketProfile already carries the concrete market
// identity (engine/location/language/device/country), so the row stores only
// the relation and an append-only timestamp. This slice is schema/contract
// only: no market-selection, primary-market, ranking or policy-evaluation
// behavior is added (TASK item 3).
//
// SAME-PROJECT INTEGRITY is database-enforced by two composite foreign keys
// that carry this row's own project_id as their leading column:
//   (project_id, claim_id)           -> claims(project_id, id)
//   (project_id, market_profile_id)  -> search_market_profiles(project_id, id)
// A link whose claim and market profile belong to different Projects has no
// matching parent row for at least one FK and is rejected by the DB in either
// direction. Both parents expose the required unique (project_id, id) target
// (claims via claims_project_id_id_idx from 0057; search_market_profiles via
// search_market_profiles_project_id_id_idx from 0049), so this table adds NO
// new referential index to either parent. Deleting a claim, a market profile,
// or a whole Project cascades its links away, so a link can never dangle.
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate Claim/MarketProfile
// edges (TASK item 3), so the unique index below rejects a duplicate
// (claim_id, market_profile_id) pair. claim_id and market_profile_id are both
// globally unique primary keys, so once the same-Project FKs hold, the pair is
// project-isolated without listing project_id in the unique index (the accepted
// search_topic_keyword_refs / claim_source_refs mapping pattern). No other
// uniqueness rule is invented. The reverse non-unique index serves the
// market_profile -> claims read path; the unique index's leading claim_id
// already serves the claim -> allowed-markets read path.
// ============================================================================

export const claimAllowedMarketProfiles = sqliteTable(
  "claim_allowed_market_profiles",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FKs below can carry it as their leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked claim (claims.id). Bound to this row's project by the
    // composite FK below.
    claimId: text("claim_id").notNull(),
    // The allowed SearchMarketProfile (search_market_profiles.id). Bound to
    // this row's project by the composite FK below.
    marketProfileId: text("market_profile_id").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries
    // no mutable payload and no updated_at — the relation is a policy edge, not
    // a mutable lifecycle row.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the claim: this link's project_id must equal
    // the claim's project_id. Deleting a claim removes its allowed-market links
    // (the referenced (project_id, id) pair is unique via
    // claims_project_id_id_idx).
    foreignKey({
      columns: [table.projectId, table.claimId],
      foreignColumns: [claims.projectId, claims.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the market profile: this link's project_id
    // must equal the market profile's project_id. Deleting a market profile
    // removes its claim links (the referenced (project_id, id) pair is unique
    // via search_market_profiles_project_id_id_idx).
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // Link identity: one row per (claim_id, market_profile_id) edge, so a
    // duplicate Claim/MarketProfile link is rejected by the DB (TASK item 3).
    // The leading claim_id also serves the claim -> allowed-markets read path.
    uniqueIndex("claim_allowed_market_profiles_unique_claim_market_idx").on(
      table.claimId,
      table.marketProfileId,
    ),
    // market_profile -> claims reads and the market-profile-delete cascade path.
    index("claim_allowed_market_profiles_market_profile_idx").on(
      table.marketProfileId,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project Claim allowed-language relation.
//
// Each row is ONE allowed-language edge of a claim (05_DOMAIN_DATA_MODEL.md §9
// `allowed_languages[]`; TASK item 1). The allowed-language policy relation is a
// normalized table — never a JSON/text array column on the claim row (TASK item
// 2) — and the language value is stored as one explicit opaque tag per row,
// consistent with the existing V1.0 language fields (search_prompts.language,
// search_market_profiles.language_code, search_topics.locale). This slice is
// schema/contract only: no language catalog, locale inference/normalization,
// enum/format rule, policy-evaluation, Claim-verification or ranking behavior is
// added (TASK item 3).
//
// SAME-PROJECT INTEGRITY is database-enforced by the composite foreign key that
// carries this row's own project_id as its leading column:
//   (project_id, claim_id) -> claims(project_id, id)
// A link whose claim belongs to another Project has no matching parent row and
// is rejected by the DB. The parent exposes the required unique (project_id, id)
// target (claims via claims_project_id_id_idx from 0057), so this table adds NO
// new referential index to the claim parent. Deleting a claim or a whole Project
// cascades its links away, so a link can never dangle.
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate Claim/language edges
// (TASK item 4), so the unique index below rejects a duplicate
// (claim_id, language) pair. claim_id is a globally unique primary key, so once
// the same-Project FK holds, the pair is project-isolated without listing
// project_id in the unique index (the accepted search_topic_keyword_refs /
// claim_source_refs / claim_allowed_market_profiles mapping pattern). No other
// uniqueness rule is invented. The non-unique reverse index serves the language
// -> claims read path; the unique index's leading claim_id already serves the
// claim -> allowed-languages read path.
// ============================================================================

export const claimAllowedLanguages = sqliteTable(
  "claim_allowed_languages",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FK below can carry it as its leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked claim (claims.id). Bound to this row's project by the
    // composite FK below.
    claimId: text("claim_id").notNull(),
    // The allowed language, stored as an opaque explicit IETF-style tag exactly
    // as supplied (e.g. "en", "zh-CN"), matching the existing V1.0 language
    // fields. No catalog, normalization, inference or format rule is applied.
    language: text("language").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries
    // no mutable payload and no updated_at — the relation is a policy edge, not
    // a mutable lifecycle row.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the claim: this link's project_id must equal
    // the claim's project_id. Deleting a claim removes its allowed-language
    // links (the referenced (project_id, id) pair is unique via
    // claims_project_id_id_idx).
    foreignKey({
      columns: [table.projectId, table.claimId],
      foreignColumns: [claims.projectId, claims.id],
    }).onDelete("cascade"),
    // Link identity: one row per (claim_id, language) edge, so a duplicate
    // Claim/language link is rejected by the DB (TASK item 4). The leading
    // claim_id also serves the claim -> allowed-languages read path.
    uniqueIndex("claim_allowed_languages_unique_claim_language_idx").on(
      table.claimId,
      table.language,
    ),
    // language -> claims reads.
    index("claim_allowed_languages_language_idx").on(table.language),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped media asset metadata.
//
// A media asset is the R2 source asset metadata record (05_DOMAIN_DATA_MODEL.md
// §11 MediaAsset; 15_MEDIA_ASSET_SPEC.md §2; TASK item 1). This slice is
// schema/contract ONLY — it records asset identity, rights and classification
// without implementing upload, object storage, media processing, CRUD/UI,
// ContentVersion links, the Rights Gate runtime or any publishing behavior.
//
// FIELD RECONCILIATION (§11/15 and the TASK field list are the direct contract;
// schemas/domain-types.ts MediaAsset and schemas/migrations-reference.sql
// media_assets supply the legacy reference context):
//   - The stable `id` primary key and the explicit `project_id` ownership key
//     are the additions the established Search Growth schema convention requires
//     (every V1.0 row has a stable text id; §11's snippet lists only the
//     direct metadata fields).
//   - `media_type` (NOT NULL) is exactly the V1.0 MediaType union IMAGE | VIDEO
//     | AUDIO | DOCUMENT | OTHER (the union the legacy reference type carries and
//     the TASK enumerates), enforced by the DB text-enum column and the named
//     CHECK below (the Zod boundary in src/types/schemas/media-asset.ts enforces
//     the same union at runtime). No implicit/OTHER-content guessing exists: the
//     writer states the type explicitly.
//   - `mime_type` (NOT NULL) is the direct §11 MIME string, stored verbatim as
//     an opaque standard IANA media type tag (e.g. "image/png", "video/mp4").
//     No MIME allowlist, magic-bytes check or normalization is applied here
//     (those are upload-security behavior, out of scope).
//   - `bytes` (NOT NULL) is the direct §11 asset size in bytes (the legacy
//     `size`). No size limit/validation is applied here.
//   - `sha256` (NOT NULL) is the direct §11 content hash. It is a plain
//     non-unique column: no content-hash uniqueness/dedup rule is invented
//     (TASK item 3 forbids it without a direct V1.0 contract).
//   - `rights_status` (NOT NULL) is exactly the V1.0 MediaRightsStatus union
//     OWNED | LICENSED | APPROVED_EXTERNAL | UNKNOWN (the §11 snippet, the legacy
//     reference type and the TASK all carry the same union), enforced by the DB
//     text-enum column and the named CHECK below. The Rights Gate policy over
//     this column (UNKNOWN blocks unattended release, 09_CONTENT_EVIDENCE_
//     WEBPAGE_SPEC.md §9) is NOT implemented here — it is a later runtime slice.
//   - `classification` (NOT NULL) is exactly the V1.0 DataClassification union
//     PUBLIC_MARKETING | INTERNAL | RESTRICTED (the union the legacy reference
//     type also carries, matching the accepted claim/opportunity rows),
//     enforced by the DB text-enum column and the named CHECK below.
//   - `created_at` is the ONLY audit column shipped: the TASK limits additions
//     to "only standard creation audit metadata required by established schema
//     convention", and the established convention's creation audit metadata is
//     the append-only `created_at` text timestamp with a current_timestamp
//     default. The legacy reference's `created_by`, `deleted_at` and the §15
//     "source"/"created by/time" attribution are NOT shipped (no identity/
//     soft-delete/source contract exists yet, and the TASK forbids inventing
//     one). No `updated_at` is shipped: a source asset is content-addressed and
//     append-only in this slice, and neither the accepted §11/§15 artifacts nor
//     the legacy reference `media_assets` row carries `updated_at`.
//   - Legacy reference fields reconciled OUT (never columns on this row):
//     `storage_key` (object storage key — storage/upload out of scope),
//     `original_filename` (filename sanitization is upload security, out of
//     scope), `width`/`height`/`duration_seconds`/`alt_text` (dimensions/
//     duration/extraction out of scope), `created_by`/`deleted_at` (audit/soft-
//     delete fields beyond the creation metadata convention), and the §15
//     `source` attribution field (no source contract authorized here).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK every Search Growth
// row carries). Deleting a whole Project cascades its media assets away. There
// is no content-version/relation link yet (ContentVersion.asset_ids[] is a later
// slice), but the T115 published_media_refs relation's same-Project composite FK
// ((project_id, media_asset_id) -> media_assets(project_id, id), defined below)
// requires the supporting composite unique target index added below in this
// task's 0061 forward migration.
//
// NO BUSINESS UNIQUENESS: no V1.0 artifact dedupes media assets by sha256 or
// constrains mime/type/rights/classification uniqueness per project, so the only
// unique index below is `media_assets_project_id_id_idx` on (project_id, id),
// which exists ONLY as the required referential target of that child composite
// FK — id is already the PK, so the composite accepts exactly the rows the PK
// accepts and adds no business uniqueness. No content-hash, storage-key,
// filename, dimensional or duplicate rule is added. The non-unique Project
// lookup/cascade index below serves Project-scoped reads and the project-delete
// cascade path.
// ============================================================================

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + delete cascade are enforced by the database.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The direct §11 MediaType union (IMAGE | VIDEO | AUDIO | DOCUMENT | OTHER).
    // DB text-enum column + the named CHECK below; the Zod boundary validates
    // it. No type detection/inference exists in this slice.
    mediaType: text("media_type", {
      enum: ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"],
    }).notNull(),
    // The direct §11 MIME type string, stored verbatim as an opaque standard
    // IANA media type tag. No allowlist or magic-bytes check exists here.
    mimeType: text("mime_type").notNull(),
    // The direct §11 asset size in bytes.
    bytes: integer("bytes").notNull(),
    // The direct §11 SHA-256 content hash. Plain non-unique column: no content-
    // hash uniqueness/dedup rule is invented in this slice.
    sha256: text("sha256").notNull(),
    // The direct §11 MediaRightsStatus union (OWNED | LICENSED |
    // APPROVED_EXTERNAL | UNKNOWN). DB text-enum column + the named CHECK below;
    // the Zod boundary validates it. The Rights Gate policy over this value is a
    // later runtime slice and is not implemented here.
    rightsStatus: text("rights_status", {
      enum: ["OWNED", "LICENSED", "APPROVED_EXTERNAL", "UNKNOWN"],
    }).notNull(),
    // The direct DataClassification union (PUBLIC_MARKETING | INTERNAL |
    // RESTRICTED). DB text-enum column + the named CHECK below; the Zod boundary
    // validates it.
    classification: text("classification", {
      enum: ["PUBLIC_MARKETING", "INTERNAL", "RESTRICTED"],
    }).notNull(),
    // Append-only creation timestamp (system insert time) — the only audit
    // column the established schema convention's creation metadata requires.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Project -> media-asset reads and the project-delete cascade path (the
    // non-unique Project lookup index; TASK item 3).
    index("media_assets_project_idx").on(table.projectId),
    // Supporting unique target for the published_media_refs same-Project
    // composite FK ((project_id, media_asset_id) -> media_assets(project_id, id),
    // added below by the T115 0061 migration). id is already the PK, so this
    // composite accepts exactly the rows the PK accepts and adds no business
    // uniqueness.
    uniqueIndex("media_assets_project_id_id_idx").on(table.projectId, table.id),
    // DB-level enum rejection for the three direct MediaAsset unions (the TASK
    // requires migration-backed enum rejection; the Zod boundary enforces the
    // same lists at the runtime edge).
    check(
      "media_assets_media_type_valid",
      sql`(${table.mediaType} IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','OTHER'))`,
    ),
    check(
      "media_assets_rights_status_valid",
      sql`(${table.rightsStatus} IN ('OWNED','LICENSED','APPROVED_EXTERNAL','UNKNOWN'))`,
    ),
    check(
      "media_assets_classification_valid",
      sql`(${table.classification} IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED'))`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped published media references.
//
// A published media reference records ONE media asset's opaque remote reference
// on an external creator/CMS platform after a later publisher adapter uploads/
// transfers it (05_DOMAIN_DATA_MODEL.md §11 PublishedMediaRef;
// 15_MEDIA_ASSET_SPEC.md §3 "asset://id -> upload/transfer -> PublishedMediaRef
// -> stable platform URL/media id"; ADR-007). This slice is schema/contract
// ONLY: it adds no publisher connector, account authorization, upload, external
// request, URL reachability or public-verification behavior, and it invents no
// success/status semantics — a row is only a STORED REFERENCE, never proof of
// public success.
//
// FIELD RECONCILIATION (§11 and the TASK field list are the direct contract;
// schemas/domain-types.ts PublishedMediaRef and schemas/migrations-reference.sql
// published_media_refs supply the legacy reference context):
//   - The stable `id` primary key and the explicit `project_id` ownership key
//     are the additions the established Search Growth schema convention requires
//     (every V1.0 row has a stable text id; §11's snippet lists only the
//     relation-facing fields, and the legacy reference row has no project
//     column). `project_id` is required so the DB itself can enforce
//     same-Project ownership against the source MediaAsset (composite FK below).
//   - `media_asset_id` (NOT NULL) is the R2 source MediaAsset id this reference
//     was produced from (§11 `asset_id`, named `media_asset_id` by the TASK).
//   - `platform` (NOT NULL) is the opaque target platform/CMS identifier. It is
//     stored verbatim; no platform enum, registry, capability table or
//     credential data is invented in this slice.
//   - `account_id` (nullable) is the opaque platform account that performed the
//     upload (TASK "nullable opaque account_id"). No account credentials or
//     account FK are stored.
//   - `external_media_id` (nullable) is the platform's opaque remote media id
//     (§11 `external_media_id?`); NULL means the platform has not returned one.
//   - `public_url` (nullable) is the platform/CMS public media URL, stored
//     verbatim (§11 `public_url?`). No reachability check, URL normalization,
//     fetch or verification happens here.
//   - `sha256` (nullable) is the OPTIONAL remote content/media hash the platform
//     reported (TASK "optional remote sha256"; 15_MEDIA_ASSET_SPEC.md §7
//     content/media hashes). Plain non-unique column — no content-hash matching
//     or dedup rule is invented.
//   - `created_at` is the append-only creation timestamp (system insert time) —
//     the established creation-audit convention's only audit column.
//   - The legacy/§15 reference-only `adapter_version`
//     (15_MEDIA_ASSET_SPEC.md §4 PublishedMediaRef) is NOT shipped: the TASK
//     field list names no adapter-version column and no adapter contract is
//     authorized here.
//   - No success/status/verification/credential field is shipped (TASK item 3):
//     there is no PUBLIC_VERIFIED/success/status column, no uniqueness that
//     would imply a single "published" record per platform, and no account
//     credential value. A row is a stored reference, never proof of public
//     success.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK). Same-Project
// ownership against the source asset is database-enforced by the composite FK
// (project_id, media_asset_id) -> media_assets(project_id, id), whose leading
// column is this row's project_id, so a reference whose MediaAsset lives on
// another Project (in either direction) has no matching parent row and is
// rejected by the DB. The referenced (project_id, id) pair is made unique by the
// supporting `media_assets_project_id_id_idx` unique index this task adds to the
// T114 mediaAssets table (0061/0039) — the only referential parent key this FK
// requires. Deleting a MediaAsset or a whole Project cascades its references
// away, so a reference can never dangle. (Cascading away the local reference
// row does NOT delete externally published media — 15_MEDIA_ASSET_SPEC.md §7
// "不自动删除外部平台已发布媒体" — it only removes the stored pointer.)
//
// NO BUSINESS UNIQUENESS: no V1.0 artifact constrains a single "published"
// reference per asset/platform or dedupes external ids/public URLs, and the TASK
// forbids inventing publication uniqueness or public-verification behavior, so
// no business-unique index exists. The two non-unique indexes below serve the
// project -> references and asset -> references read paths and their cascade
// delete paths only.
// ============================================================================

export const publishedMediaRefs = sqliteTable(
  "published_media_refs",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The R2 source MediaAsset id this reference was produced from
    // (media_assets.id). Bound to the row's project by the same-Project
    // composite FK below, which cascades references away when the asset is
    // deleted.
    mediaAssetId: text("media_asset_id").notNull(),
    // The opaque target platform/CMS identifier. Stored verbatim; no platform
    // enum/registry or capability data exists in this slice.
    platform: text("platform").notNull(),
    // The opaque platform account that performed the upload; NULL when the
    // platform reports no account context. No account credentials are stored.
    accountId: text("account_id"),
    // The platform's opaque remote media id; NULL until the platform returns
    // one. No id format is interpreted here.
    externalMediaId: text("external_media_id"),
    // The platform/CMS public media URL, stored verbatim. No reachability or
    // URL validation is performed here.
    publicUrl: text("public_url"),
    // Optional remote content/media hash reported by the platform. Plain
    // non-unique column: no content-hash matching or dedup rule is invented.
    sha256: text("sha256"),
    // Append-only creation timestamp (system insert time). No updated_at column
    // exists — a reference is written once when the upload is recorded.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the source media asset: this row's
    // project_id must equal the asset's project_id. Deleting an asset removes
    // its references (the referenced (project_id, id) pair is unique via the
    // supporting media_assets_project_id_id_idx unique index added to
    // mediaAssets by this task's 0061 migration). A reference whose asset lives
    // on another Project has no matching parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.mediaAssetId],
      foreignColumns: [mediaAssets.projectId, mediaAssets.id],
    }).onDelete("cascade"),
    // Project -> references reads and the project-delete cascade path.
    index("published_media_refs_project_idx").on(table.projectId),
    // Asset -> references reads and the asset-delete cascade path.
    index("published_media_refs_media_asset_idx").on(table.mediaAssetId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped content package containers.
//
// A content package is the stable topic container (05_DOMAIN_DATA_MODEL.md §10
// ContentPackage — "主题容器"; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §2) that later
// ContentVersion/variant/rendering/publishing slices attach to. This slice is
// schema/contract ONLY: it establishes only the package's core identity and its
// required Topic / optional Opportunity ownership. It adds no ContentVersion,
// ContentVariant, brief/canonical content, metadata/WebPageSpec JSON,
// claims/sources/assets mappings, keywords/prompts, market/persona modeling,
// search intent/PageFit behavior, immutable/version/gate runtime, renderers,
// CRUD/UI, connector or publishing behavior.
//
// FIELD RECONCILIATION (the TASK field list and 05_DOMAIN_DATA_MODEL.md §10
// ContentPackage are the direct contract;
// schemas/migrations-reference.sql content_packages and
// schemas/domain-types.ts ContentPackageVersion supply the legacy reference
// context):
//   - The stable `id` primary key, the explicit NOT NULL `project_id` ownership
//     key, and the `created_at`/`updated_at` audit timestamps are the additions
//     the established Search Growth schema convention requires (every V1.0
//     mutable row has a stable text id, an explicit Project FK and both system
//     timestamps).
//   - `topic_id` (NOT NULL) is the required stable SearchTopic id (ADR-004) this
//     package is a container for.
//   - `opportunity_id` (nullable) is the optional same-Project
//     SearchGrowthOpportunity the package was produced from; NULL means no
//     opportunity is attached.
//   - `title` (NOT NULL), `locale` (NOT NULL) and `status` (NOT NULL) are
//     required opaque text: stored verbatim with no format/allowlist/enum
//     interpretation in this slice. `status` in particular stays opaque — this
//     container slice must NOT invent a lifecycle enum, gate behavior, release
//     state or publication success semantics (TASK item 3). A row is a topic
//     container, never a ContentVersion, approved release or public-publish
//     proof.
//   - No Market/Persona/keyword/prompt relation is inferred from JSON (TASK item
//     2): no JSON column exists on this row at all — every relationship is a
//     typed FK column.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK every Search Growth
// row carries). Same-Project ownership against the required Topic and the
// optional Opportunity is database-enforced by the Project-leading composite FKs
// below:
//   - (project_id, topic_id)       -> search_topics(project_id, id)
//   - (project_id, opportunity_id) -> search_growth_opportunities(project_id, id)
// so the DB (not application convention) rejects a package whose Topic or
// Opportunity belongs to another Project (in either direction) and rejects a
// dangling Topic/Opportunity. The Topic target (project_id, id) is unique via
// the accepted `search_topics_project_id_id_idx`; the Opportunity target is made
// unique by the `search_growth_opportunities_project_id_id_idx` supporting index
// the T117 slice added to the accepted T109 opportunities table (0062/0040).
// Deleting a Topic, an Opportunity, or a whole Project cascades the package
// away, so a container can never dangle.
//
// NO BUSINESS UNIQUENESS: no V1.0 artifact constrains how many content packages
// a Topic/Opportunity may carry or dedupes them, and the TASK forbids adding
// business uniqueness. The one unique index this row now exposes
// (`content_packages_project_id_id_idx` on (project_id, id), added by the T118
// 0063/0041 migrations) exists ONLY as the required referential target of the
// T118 content_package_versions same-Project composite FK
// ((project_id, content_package_id) -> content_packages(project_id, id)) — id is
// already the PK, so the composite accepts exactly the rows the PK accepts and
// adds no business uniqueness. The non-unique indexes below serve the
// project -> packages, topic -> packages and opportunity -> packages
// read/cascade paths only.
// ============================================================================

export const contentPackages = sqliteTable(
  "content_packages",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The stable SearchTopic id (search_topics.id, ADR-004) this package is a
    // container for. Bound to the row's project by the composite FK below, which
    // cascades packages away when the topic is deleted.
    topicId: text("topic_id").notNull(),
    // Optional same-Project SearchGrowthOpportunity the package was produced
    // from; NULL means no opportunity is attached. The composite FK below keeps
    // it same-Project and cascades the package away when the opportunity is
    // deleted.
    opportunityId: text("opportunity_id"),
    // Required opaque human-facing container title, stored verbatim (no
    // normalization/format rules exist in this slice).
    title: text("title").notNull(),
    // Required opaque locale of the package, stored verbatim (a container is
    // never locale-less/global).
    locale: text("locale").notNull(),
    // Required opaque lifecycle state, stored verbatim. Deliberately NOT an
    // enum column: this container slice defines no lifecycle union, gate,
    // release or publication semantics (TASK item 3).
    status: text("status").notNull(),
    // System insert/update timestamps (mutable container row; a later CRUD task
    // mutates the row in place and sets updated_at).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the required topic: this row's project_id
    // must equal the topic's project_id. Deleting a topic removes its packages
    // (the referenced (project_id, id) pair is unique via the supporting
    // search_topics_project_id_id_idx index created in 0046). A package whose
    // topic lives on another Project has no matching parent row and is rejected
    // by the DB.
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the optional opportunity: when set, this
    // row's project_id must equal the opportunity's project_id. Deleting an
    // opportunity removes the packages produced from it (the referenced
    // (project_id, id) pair is unique via the
    // search_growth_opportunities_project_id_id_idx supporting unique index
    // added by the T117 0062 migration). NULL opportunity_id means no
    // opportunity is attached and the FK is not enforced.
    foreignKey({
      columns: [table.projectId, table.opportunityId],
      foreignColumns: [
        searchGrowthOpportunities.projectId,
        searchGrowthOpportunities.id,
      ],
    }).onDelete("cascade"),
    // Supporting unique referential target for the content_package_versions
    // same-Project composite FK ((project_id, content_package_id) ->
    // content_packages(project_id, id), added below by the T118 0063
    // migration). id is already the PK, so this composite accepts exactly the
    // rows the PK accepts and adds no business uniqueness.
    uniqueIndex("content_packages_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // Project -> packages reads and the project-delete cascade path.
    index("content_packages_project_idx").on(table.projectId),
    // Topic -> packages reads and the topic-delete cascade path.
    index("content_packages_topic_idx").on(table.topicId),
    // Opportunity -> packages reads and the opportunity-delete cascade path.
    index("content_packages_opportunity_idx").on(table.opportunityId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped, immutable content versions.
//
// A content version records ONE immutable snapshot of a content package's
// canonical content and its version identity (05_DOMAIN_DATA_MODEL.md §10
// ContentVersion — "ContentVersion — Immutable"; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC
// .md §1 canonical source and §8 immutable versions). This slice is
// schema/contract ONLY: the TASK records canonical content and version identity
// only. Normalized Claim/SourceRef/MediaAsset mapping tables, ContentVariant,
// Gate evaluation, and all release/dry-run/approval/publishing behavior are
// separate tasks.
//
// FIELD RECONCILIATION (the TASK field list is the direct authoritative
// contract; 05_DOMAIN_DATA_MODEL.md §10 and the legacy references
// schemas/domain-types.ts ContentPackageVersion and
// schemas/migrations-reference.sql content_package_versions supply the reference
// context):
//   - The stable `id` primary key, the explicit NOT NULL `project_id` ownership
//     key, and the append-only `created_at` timestamp are the additions the
//     established Search Growth schema convention requires.
//   - `content_package_id` (NOT NULL) is the stable id of the owning
//     content_packages container and `version_no` (NOT NULL) is the monotonic
//     version number within that package. Together they form the version
//     identity.
//   - `canonical_markdown` (NOT NULL) is the canonical Markdown body and
//     `canonical_metadata_json` (NOT NULL) is the canonical structured metadata
//     (09 spec §1): both are opaque document payloads stored verbatim.
//   - `web_page_spec_json` (nullable) is the optional WebPageSpec document
//     payload; NULL means the version does not (yet) carry a page spec.
//   - `content_hash` (NOT NULL) is a required opaque content hash, stored
//     verbatim. It is deliberately a plain non-unique column: no content-hash
//     matching/dedup rule is invented in this slice.
//   - `gate_status` (NOT NULL) records only the core value of the
//     domain-types.ts gateStatus union (DRAFT | BLOCKED | PASSED), enforced by
//     the DB text-enum column and the named CHECK below. This slice does NOT
//     implement Gate evaluation and the value cannot be invented by the DB.
//   - `classification` (NOT NULL) is exactly the V1.0 DataClassification union
//     PUBLIC_MARKETING | INTERNAL | RESTRICTED (domain-types.ts
//     DataClassification), enforced by the DB text-enum column and the named
//     CHECK below.
//   - The legacy reference fields `brief_json`, `claim_ids_json`,
//     `source_ref_ids_json`, `asset_ids_json`, `gate_report_json` and
//     `created_by` are reconciled OUT: the TASK field list does not name them,
//     and normalized Claim/SourceRef/MediaAsset mappings (never JSON arrays on
//     this row) plus Gate/release behavior are separate tasks (09 spec §1 asset/
//     claim/source refs; TASK item 3).
//   - IMMUTABLE-ROW SHAPE: no `updated_at` column and no mutable workflow,
//     release approval, publishing or public-success column exists (TASK item
//     3). A version row is written once; a content change creates a new
//     version_no rather than mutating this row (09 spec §8).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK every Search Growth
// row carries). Same-Project ContentPackage ownership is database-enforced by
// the Project-leading composite FK
//   (project_id, content_package_id) -> content_packages(project_id, id)
// so the DB (not application convention) rejects a version whose package belongs
// to another Project (in either direction) and rejects a dangling package. The
// parent (project_id, id) target is made unique by the
// `content_packages_project_id_id_idx` supporting unique index this task adds to
// the accepted T117 content_packages table (0063/0041) — the only new
// referential parent index this slice requires. Deleting a content package or a
// whole Project cascades its versions away, so a version can never dangle.
//
// VERSION IDENTITY / NO OTHER BUSINESS UNIQUENESS: the only business uniqueness
// rule in this slice is the version identity needed to reject a duplicate
// (content_package_id, version_no) pair (TASK item 2). content_package_id is a
// globally unique primary key, so once the same-Project FK holds, the pair is
// project-isolated without listing project_id in the unique index (the accepted
// mapping/version patterns). No other business uniqueness is added: content_hash
// is a plain column (no dedup rule) and the version identity index's leading
// content_package_id already serves the content-package -> versions read path.
// The one supporting referential index on this table,
// `content_package_versions_project_id_id_idx` (unique on (project_id, id)), is
// added by the T119 0064 migration purely as the composite-FK target of the
// content_package_version_claims same-Project FK below — id is already the PK,
// so it accepts exactly the PK's rows and adds no business uniqueness. No other
// index exists on this table.
// ============================================================================

export const contentPackageVersions = sqliteTable(
  "content_package_versions",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The stable content_packages.id this version belongs to. Bound to the
    // row's project by the composite FK below, which cascades versions away when
    // the content package is deleted.
    contentPackageId: text("content_package_id").notNull(),
    // The monotonic version number within the content package. The unique index
    // below enforces one row per (content_package_id, version_no) — a content
    // change creates a new version_no instead of mutating this immutable row.
    versionNo: integer("version_no").notNull(),
    // The canonical Markdown body (09 spec §1), stored verbatim as an opaque
    // document payload. No rendering or normalization happens in this slice.
    canonicalMarkdown: text("canonical_markdown").notNull(),
    // The canonical structured metadata document (09 spec §1), stored verbatim
    // as an opaque JSON payload. The metadata is a document, not a relational
    // model: Claim/SourceRef/MediaAsset mappings are never encoded here (TASK
    // item 3).
    canonicalMetadataJson: text("canonical_metadata_json").notNull(),
    // The optional WebPageSpec document payload (05 §10 web_page_spec_json);
    // NULL means this version does not carry a page spec yet. Also an opaque
    // JSON payload.
    webPageSpecJson: text("web_page_spec_json"),
    // The required opaque content hash, stored verbatim. Plain non-unique
    // column: no content-hash matching/dedup rule is invented in this slice.
    contentHash: text("content_hash").notNull(),
    // The direct ContentPackageVersion gateStatus core union (DRAFT | BLOCKED |
    // PASSED — domain-types.ts). DB text-enum column + the named CHECK below;
    // the Zod boundary validates it. This slice records the core value only and
    // does NOT implement Gate evaluation (TASK item 3).
    gateStatus: text("gate_status", {
      enum: ["DRAFT", "BLOCKED", "PASSED"],
    }).notNull(),
    // The direct DataClassification union (PUBLIC_MARKETING | INTERNAL |
    // RESTRICTED). DB text-enum column + the named CHECK below; the Zod boundary
    // validates it.
    classification: text("classification", {
      enum: ["PUBLIC_MARKETING", "INTERNAL", "RESTRICTED"],
    }).notNull(),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column: an immutable version row has no updated_at and carries no mutable
    // workflow/release/publishing state.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the owning content package: this row's
    // project_id must equal the package's project_id. Deleting a content package
    // removes its versions (the referenced (project_id, id) pair is unique via
    // the supporting content_packages_project_id_id_idx unique index added by
    // this task's 0063 migration). A version whose package lives on another
    // Project has no matching parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.contentPackageId],
      foreignColumns: [contentPackages.projectId, contentPackages.id],
    }).onDelete("cascade"),
    // Version identity: one row per (content_package_id, version_no), so a
    // duplicate version number within a content package is rejected by the DB
    // (TASK item 2). The leading content_package_id also serves the
    // content-package -> versions read path.
    uniqueIndex(
      "content_package_versions_unique_content_package_version_idx",
    ).on(table.contentPackageId, table.versionNo),
    // Supporting unique referential target for the content_package_version_claims
    // same-Project composite FK ((project_id, content_package_version_id) ->
    // content_package_versions(project_id, id), added below by the T119 0064
    // migration). id is already the PK, so this composite accepts exactly the
    // rows the PK accepts and adds no business uniqueness.
    uniqueIndex("content_package_versions_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // DB-level enum rejection for the two direct ContentVersion unions (the TASK
    // requires migration-backed classification enum rejection; the Zod boundary
    // enforces the same lists at the runtime edge).
    check(
      "content_package_versions_gate_status_valid",
      sql`(${table.gateStatus} IN ('DRAFT','BLOCKED','PASSED'))`,
    ),
    check(
      "content_package_versions_classification_valid",
      sql`(${table.classification} IN ('PUBLIC_MARKETING','INTERNAL','RESTRICTED'))`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project ContentPackageVersion <->
// Claim relation.
//
// Each row is ONE link between an immutable content package version and a claim
// that version relies on (05_DOMAIN_DATA_MODEL.md §10 ContentVersion
// `claim_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §1 claim/source refs and
// §10 "every piece of content can trace the Claims used"). The relation is a
// normalized table — never a JSON/text array column on the immutable
// content_package_versions row (TASK item 3) — and the row carries no mutable
// evidence payload: claim verification/reverification state stays on the linked
// claims rows, so a later hard-claim Gate reads the version's claims through the
// link without copying verification state here. This slice is schema/contract
// only: no Claim gate evaluation/override, evidence payload, release/publishing
// behavior, or CRUD/UI is added (TASK item 3).
//
// SAME-PROJECT INTEGRITY is database-enforced by two composite foreign keys that
// carry this row's own project_id as their leading column:
//   (project_id, content_package_version_id) -> content_package_versions(project_id, id)
//   (project_id, claim_id)                   -> claims(project_id, id)
// A link whose content package version and claim belong to different Projects
// has no matching parent row for at least one FK and is rejected by the DB in
// either direction. The ContentVersion parent target
// `content_package_versions_project_id_id_idx` is the ONE new referential parent
// index this slice requires (added to the accepted T118 table in the new 0064
// migration); the Claim parent target is the accepted `claims_project_id_id_idx`
// from 0057 and is reused, so this table adds NO index to `claims`. Deleting a
// content package version, a claim, or a whole Project cascades its links away,
// so a link can never dangle.
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate
// ContentPackageVersion/Claim edges (TASK item 2), so the unique index below
// rejects a duplicate (content_package_version_id, claim_id) pair.
// content_package_version_id and claim_id are both globally unique primary keys,
// so once the same-Project FKs hold, the pair is project-isolated without
// listing project_id in the unique index (the accepted search_topic_keyword_refs
// / claim_source_refs mapping pattern). No other uniqueness rule is invented.
// The reverse non-unique index serves the claim -> versions read path; the
// unique index's leading content_package_version_id already serves the
// content-package-version -> claims read path.
// ============================================================================

export const contentPackageVersionClaims = sqliteTable(
  "content_package_version_claims",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FKs below can carry it as their leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked immutable content package version (content_package_versions.id).
    // Bound to this row's project by the composite FK below.
    contentPackageVersionId: text("content_package_version_id").notNull(),
    // The linked claim (claims.id). Bound to this row's project by the composite
    // FK below. Claim verification/reverification state lives on the claim row,
    // never here.
    claimId: text("claim_id").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries no
    // mutable payload and no updated_at — the reference itself is immutable and
    // evidence/verification state stays on the linked claim.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the content package version: this link's
    // project_id must equal the version's project_id. Deleting a content package
    // version removes its claim links (the referenced (project_id, id) pair is
    // unique via content_package_versions_project_id_id_idx added by this task's
    // 0064 migration).
    foreignKey({
      columns: [table.projectId, table.contentPackageVersionId],
      foreignColumns: [
        contentPackageVersions.projectId,
        contentPackageVersions.id,
      ],
    }).onDelete("cascade"),
    // Same-Project composite FK to the claim: this link's project_id must equal
    // the claim's project_id. Deleting a claim removes its version links (the
    // referenced (project_id, id) pair is unique via the accepted
    // claims_project_id_id_idx from 0057 — reused, not recreated).
    foreignKey({
      columns: [table.projectId, table.claimId],
      foreignColumns: [claims.projectId, claims.id],
    }).onDelete("cascade"),
    // Link identity: one row per (content_package_version_id, claim_id) edge, so
    // a duplicate ContentPackageVersion/Claim link is rejected by the DB (TASK
    // item 2). The leading content_package_version_id also serves the
    // content-package-version -> claims read path.
    uniqueIndex(
      "content_package_version_claims_unique_content_package_version_claim_idx",
    ).on(table.contentPackageVersionId, table.claimId),
    // claim -> content-package-versions reads.
    index("content_package_version_claims_claim_idx").on(table.claimId),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project ContentPackageVersion <->
// SourceRef relation.
//
// Each row is ONE link between an immutable content package version and a source
// reference that version relies on (05_DOMAIN_DATA_MODEL.md §10 ContentVersion
// `source_refs[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §§2–4 source refs and §10
// "every piece of content can trace the ... sources used"). The relation is a
// normalized table — never a JSON/text array column on the immutable
// content_package_versions row (TASK item 3) — and the row carries no mutable
// evidence payload: source capture/verification state stays on the linked
// source_refs rows, so a later evidence read follows the link without copying any
// source validation/revalidation state here. This slice is schema/contract only:
// no source assessment/verification/revalidation, evidence payload, Claim gate
// behavior, release/publishing behavior, or CRUD/UI is added (TASK items 3–4).
//
// SAME-PROJECT INTEGRITY is database-enforced by two composite foreign keys that
// carry this row's own project_id as their leading column:
//   (project_id, content_package_version_id) -> content_package_versions(project_id, id)
//   (project_id, source_ref_id)              -> source_refs(project_id, id)
// A link whose content package version and source reference belong to different
// Projects has no matching parent row for at least one FK and is rejected by the
// DB in either direction. Both composite-FK target unique indexes already exist
// on the accepted parents and are REUSED, so this slice adds NO index to either
// parent: content_package_versions_project_id_id_idx (T118/T119, D1 0064 / PG
// 0042) and source_refs_project_id_id_idx (T110, D1 0057 / PG 0035). Deleting a
// content package version, a source reference, or a whole Project cascades its
// links away, so a link can never dangle.
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate
// ContentPackageVersion/SourceRef edges (TASK item 2), so the unique index below
// rejects a duplicate (content_package_version_id, source_ref_id) pair.
// content_package_version_id and source_ref_id are both globally unique primary
// keys, so once the same-Project FKs hold, the pair is project-isolated without
// listing project_id in the unique index (the accepted search_topic_keyword_refs
// / claim_source_refs / content_package_version_claims mapping pattern). No other
// uniqueness rule is invented. The reverse non-unique index serves the
// source-ref -> versions read path; the unique index's leading
// content_package_version_id already serves the content-package-version ->
// source-refs read path.
// ============================================================================

export const contentPackageVersionSourceRefs = sqliteTable(
  "content_package_version_source_refs",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FKs below can carry it as their leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked immutable content package version (content_package_versions.id).
    // Bound to this row's project by the composite FK below.
    contentPackageVersionId: text("content_package_version_id").notNull(),
    // The linked source reference (source_refs.id). Bound to this row's project
    // by the composite FK below. Source capture/verification state lives on the
    // source_refs row, never here.
    sourceRefId: text("source_ref_id").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries no
    // mutable payload and no updated_at — the reference itself is immutable and
    // source evidence/verification state stays on the linked source reference.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the content package version: this link's
    // project_id must equal the version's project_id. Deleting a content package
    // version removes its source links (the referenced (project_id, id) pair is
    // unique via the accepted content_package_versions_project_id_id_idx from
    // 0064 — reused, not recreated).
    foreignKey({
      columns: [table.projectId, table.contentPackageVersionId],
      foreignColumns: [
        contentPackageVersions.projectId,
        contentPackageVersions.id,
      ],
    }).onDelete("cascade"),
    // Same-Project composite FK to the source reference: this link's project_id
    // must equal the source reference's project_id. Deleting a source reference
    // removes its version links (the referenced (project_id, id) pair is unique
    // via the accepted source_refs_project_id_id_idx from 0057 — reused, not
    // recreated).
    foreignKey({
      columns: [table.projectId, table.sourceRefId],
      foreignColumns: [sourceRefs.projectId, sourceRefs.id],
    }).onDelete("cascade"),
    // Link identity: one row per (content_package_version_id, source_ref_id)
    // edge, so a duplicate ContentPackageVersion/SourceRef link is rejected by
    // the DB (TASK item 2). The leading content_package_version_id also serves
    // the content-package-version -> source-refs read path.
    uniqueIndex(
      "content_package_version_source_refs_unique_content_package_version_source_ref_idx",
    ).on(table.contentPackageVersionId, table.sourceRefId),
    // source-ref -> content-package-versions reads.
    index("content_package_version_source_refs_source_ref_idx").on(
      table.sourceRefId,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project ContentPackageVersion <->
// MediaAsset relation.
//
// Each row is ONE link between an immutable content package version and a media
// asset that version references (05_DOMAIN_DATA_MODEL.md §10 ContentVersion
// `asset_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §1 canonical source
// `asset://<id>` and §2 "assets"). The relation is a normalized table — never a
// JSON/text array column on the immutable content_package_versions row (TASK
// item 3) — and the row carries no mutable payload: asset metadata, rights and
// classification stay on the linked media_assets row, so a later Rights Gate /
// renderer reads the asset through this link without copying any
// rights/classification/verification state here. This slice is schema/contract
// only: no asset upload, object storage, transformation, rights evaluation,
// rendered/published behavior, release/publishing behavior, or CRUD/UI is added
// (TASK items 3–4).
//
// SAME-PROJECT INTEGRITY is database-enforced by two composite foreign keys that
// carry this row's own project_id as their leading column:
//   (project_id, content_package_version_id) -> content_package_versions(project_id, id)
//   (project_id, media_asset_id)             -> media_assets(project_id, id)
// A link whose content package version and media asset belong to different
// Projects has no matching parent row for at least one FK and is rejected by the
// DB in either direction. Both composite-FK target unique indexes already exist
// on the accepted parents and are REUSED, so this slice adds NO index to either
// parent: content_package_versions_project_id_id_idx (T118/T119, D1 0064 / PG
// 0042) and media_assets_project_id_id_idx (T114, D1 0061 / PG 0039). Deleting a
// content package version, a media asset, or a whole Project cascades its links
// away, so a link can never dangle. (Cascading away the local link row does NOT
// delete the R2 source asset — 15_MEDIA_ASSET_SPEC.md §7 — it only removes the
// stored pointer.)
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate
// ContentPackageVersion/MediaAsset edges (TASK item 2), so the unique index below
// rejects a duplicate (content_package_version_id, media_asset_id) pair.
// content_package_version_id and media_asset_id are both globally unique primary
// keys, so once the same-Project FKs hold, the pair is project-isolated without
// listing project_id in the unique index (the accepted search_topic_keyword_refs
// / claim_source_refs / content_package_version_claims / content_package_version_
// source_refs mapping pattern). No other uniqueness rule is invented. The reverse
// non-unique index serves the media-asset -> versions read path; the unique
// index's leading content_package_version_id already serves the
// content-package-version -> media-assets read path.
// ============================================================================

export const contentPackageVersionMediaAssets = sqliteTable(
  "content_package_version_media_assets",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FKs below can carry it as their leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked immutable content package version (content_package_versions.id).
    // Bound to this row's project by the composite FK below.
    contentPackageVersionId: text("content_package_version_id").notNull(),
    // The linked media asset (media_assets.id). Bound to this row's project by
    // the composite FK below. Asset metadata/rights/classification state lives on
    // the media_assets row, never here.
    mediaAssetId: text("media_asset_id").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries no
    // mutable payload and no updated_at — the reference itself is immutable and
    // asset rights/classification state stays on the linked media asset.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the content package version: this link's
    // project_id must equal the version's project_id. Deleting a content package
    // version removes its media links (the referenced (project_id, id) pair is
    // unique via the accepted content_package_versions_project_id_id_idx from
    // 0064 — reused, not recreated).
    foreignKey({
      columns: [table.projectId, table.contentPackageVersionId],
      foreignColumns: [
        contentPackageVersions.projectId,
        contentPackageVersions.id,
      ],
    }).onDelete("cascade"),
    // Same-Project composite FK to the media asset: this link's project_id must
    // equal the asset's project_id. Deleting a media asset removes its version
    // links (the referenced (project_id, id) pair is unique via the accepted
    // media_assets_project_id_id_idx from 0061 — reused, not recreated).
    foreignKey({
      columns: [table.projectId, table.mediaAssetId],
      foreignColumns: [mediaAssets.projectId, mediaAssets.id],
    }).onDelete("cascade"),
    // Link identity: one row per (content_package_version_id, media_asset_id)
    // edge, so a duplicate ContentPackageVersion/MediaAsset link is rejected by
    // the DB (TASK item 2). The leading content_package_version_id also serves
    // the content-package-version -> media-assets read path.
    uniqueIndex(
      "content_package_version_media_assets_unique_content_package_version_media_asset_idx",
    ).on(table.contentPackageVersionId, table.mediaAssetId),
    // media-asset -> content-package-versions reads.
    index("content_package_version_media_assets_media_asset_idx").on(
      table.mediaAssetId,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — immutable, Project-scoped platform-native ContentVariant.
//
// ONE ContentVariant is a platform-native rendering of one immutable
// ContentVersion, NOT a mechanical copy and NOT a publishing instruction
// (05_DOMAIN_DATA_MODEL.md §10 ContentVariant "平台原生版，不是全文简单复制";
// 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §7 Platform Variants; ADR-006: canonical
// Markdown + metadata + asset refs are the source, the platform HTML/body is the
// variant). The row stores the direct renderer inputs only — the opaque
// `platform`/`format` strings, `title`/`body`, the opaque platform-native
// `metadata_json` (the §7 presentation contract: format/tags/categories/external
// link policy/cover-image constraints/CTA expression) and the render-integrity
// `body_hash` + `renderer_version` — plus the stable `id`, explicit Project
// ownership and the linked `content_package_version_id`.
//
// SAME-PROJECT INTEGRITY is database-enforced by the Project-leading composite FK
//   (project_id, content_package_version_id) -> content_package_versions(project_id, id)
// so a variant whose ContentVersion belongs to another Project has no matching
// parent row and is rejected by the DB in either direction, and a dangling
// ContentVersion/Project is likewise rejected. The composite target is the
// accepted `content_package_versions_project_id_id_idx` (added by T119, D1 0064 /
// PG 0042) and is REUSED, so this slice adds NO index to any parent (TASK item
// 2). The later T123 relation adds the supporting
// `content_variants_project_id_id_idx` unique index below as the composite-FK
// target for content_variant_media_assets (id is already the PK, so it accepts
// exactly the PK's rows and adds no business uniqueness). Deleting a
// ContentVersion or a whole Project cascades its variants away, so an immutable
// variant can never dangle.
//
// IDENTITY / NO BUSINESS UNIQUENESS: `id` is the ONLY identity in this core
// slice (TASK item 2). There is deliberately no unique index on `id` beyond the
// PK and no uniqueness rule on `(content_package_version_id, platform)` or any
// other column combination — a later task owns any routing/dedup rule. No lookup
// index is added either: the TASK scopes this slice to the stable id, and the
// Project-leading composite FK is the only referential index it requires.
//
// IMMUTABLE CONTRACT (TASK item 3): the row carries the append-only `created_at`
// timestamp ONLY. There is no `updated_at`, no mutable version-overwrite
// behavior, no JSON asset/reference id container, no variant asset mapping, no
// release/approval, and no publishing/execution/account/public-success state —
// platform-account/connector choice, target routing, asset mapping, tag/category
// normalization, renderer runtime, HTML conversion and release/publishing are all
// separate tasks (OUT OF SCOPE). `metadata_json` is opaque renderer metadata, not
// a relational id container (TASK item 1). This slice is schema/contract only: no
// variant CRUD/UI.
// ============================================================================

export const contentVariants = sqliteTable(
  "content_variants",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable ContentVersion this variant renders. Bound to the row's
    // project by the composite FK below, which cascades variants away when the
    // version is deleted.
    contentPackageVersionId: text("content_package_version_id").notNull(),
    // Opaque target platform identifier (e.g. a platform slug). Deliberately a
    // free-form required string: the platform/connector catalogue is a separate
    // task, so no enum is invented here (TASK item 1).
    platform: text("platform").notNull(),
    // Opaque platform-native format identifier. Also a free-form required string
    // — no format enum is invented in this core slice (TASK item 1).
    format: text("format").notNull(),
    // The platform-native variant title (09 spec §7 title).
    title: text("title").notNull(),
    // The platform-native variant body (ADR-006 platform HTML/body; 09 spec §7).
    // Stored verbatim as an opaque document payload — no Markdown/HTML conversion
    // or normalization happens in this slice.
    body: text("body").notNull(),
    // Opaque platform-native renderer metadata document (09 spec §7 presentation
    // contract), stored verbatim as a required JSON payload. This is renderer
    // metadata, NOT a relational id container: asset/reference ids are never
    // encoded here (TASK item 1).
    metadataJson: text("metadata_json").notNull(),
    // The required opaque body hash stored verbatim. Plain non-unique column: no
    // body-hash matching/dedup rule is invented in this slice.
    bodyHash: text("body_hash").notNull(),
    // The required renderer version that produced this body, stored verbatim for
    // render provenance. No renderer runtime exists in this slice.
    rendererVersion: text("renderer_version").notNull(),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column: an immutable variant row has no updated_at and carries no mutable
    // execution/approval/account/public-success state (TASK item 3).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ContentVersion: this row's project_id must
    // equal the version's project_id. Deleting a content package version removes
    // its variants (the referenced (project_id, id) pair is unique via the
    // accepted content_package_versions_project_id_id_idx from 0064 — reused, not
    // recreated). A variant whose version lives on another Project has no
    // matching parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.contentPackageVersionId],
      foreignColumns: [
        contentPackageVersions.projectId,
        contentPackageVersions.id,
      ],
    }).onDelete("cascade"),
    // Supporting unique referential target for the content_variant_media_assets
    // same-Project composite FK ((project_id, content_variant_id) ->
    // content_variants(project_id, id), added by the T123 0068 migration). id is
    // already the PK, so this composite accepts exactly the rows the PK accepts
    // and adds no business uniqueness.
    uniqueIndex("content_variants_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, same-Project ContentVariant <-> MediaAsset
// relation.
//
// Each row is ONE link between an immutable platform-native ContentVariant and a
// media asset that variant references (05_DOMAIN_DATA_MODEL.md §10 ContentVariant
// derived from ContentVersion `asset_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md
// §1 canonical source `asset://<id>`, §2 "assets", §7 Platform Variants; the
// legacy `schemas/domain-types.ts` ContentVariant `assetRefs: string[]` and
// `schemas/migrations-reference.sql` `content_variants.asset_refs_json`). The
// relation is a normalized table — never a JSON/text array column on the
// immutable content_variants row (TASK item 3) — and the row carries no mutable
// payload: asset metadata, media type, rights and classification stay on the
// linked media_assets row, so a later Rights Gate / renderer reads the asset
// through this link without copying any rights/classification/transformation
// state here. This slice is schema/contract only: no asset upload, object
// storage, download, transformation, rights evaluation, rendered/published
// behavior, release/approval/publishing behavior, PublishedMediaRef behavior, or
// CRUD/UI is added (TASK items 3–4).
//
// SAME-PROJECT INTEGRITY is database-enforced by two Project-leading composite
// FKs that carry this row's own project_id as their leading column:
//   (project_id, content_variant_id) -> content_variants(project_id, id)
//   (project_id, media_asset_id)     -> media_assets(project_id, id)
// A link whose variant and media asset belong to different Projects has no
// matching parent row for at least one FK and is rejected by the DB in either
// direction. The ContentVariant composite-FK target
// `content_variants_project_id_id_idx` is the ONE new referential parent index
// this slice requires (added to the accepted T122 table in the new 0068
// migration); the MediaAsset target is the accepted `media_assets_project_id_id_idx`
// (T114/T115, D1 0061 / PG 0039) and is reused, so this table adds NO index to
// `media_assets`. Deleting a content variant, a media asset, or a whole Project
// cascades its links away, so an edge can never dangle. (Cascading away the local
// link row does NOT delete the R2 source asset — 15_MEDIA_ASSET_SPEC.md §7 — it
// only removes the stored pointer.)
//
// LINK IDENTITY / DUPLICATE EDGES: the only business uniqueness rule in this
// slice is the link identity needed to prevent duplicate ContentVariant/MediaAsset
// edges (TASK item 2), so the unique index below rejects a duplicate
// (content_variant_id, media_asset_id) pair. content_variant_id and media_asset_id
// are both globally unique primary keys, so once the same-Project FKs hold, the
// pair is project-isolated without listing project_id in the unique index (the
// accepted content_package_version_media_assets / content_package_version_source_refs
// / claim_source_refs mapping pattern). No other uniqueness rule is invented. The
// reverse non-unique index serves the media-asset -> variants read path; the
// unique index's leading content_variant_id already serves the variant ->
// media-assets read path.
// ============================================================================

export const contentVariantMediaAssets = sqliteTable(
  "content_variant_media_assets",
  {
    id: text("id").primaryKey(),
    // This link's own Project. Explicit typed column so the same-Project
    // composite FKs below can carry it as their leading column.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The linked immutable ContentVariant (content_variants.id). Bound to this
    // row's project by the composite FK below.
    contentVariantId: text("content_variant_id").notNull(),
    // The linked media asset (media_assets.id). Bound to this row's project by
    // the composite FK below. Asset metadata/rights/classification state lives on
    // the media_assets row, never here.
    mediaAssetId: text("media_asset_id").notNull(),
    // Append-only creation timestamp (system insert time). A link row carries no
    // mutable payload and no updated_at — the reference itself is immutable and
    // asset rights/classification state stays on the linked media asset.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ContentVariant: this link's project_id
    // must equal the variant's project_id. Deleting a content variant removes its
    // media links (the referenced (project_id, id) pair is unique via
    // content_variants_project_id_id_idx added by this task's 0068 migration).
    foreignKey({
      columns: [table.projectId, table.contentVariantId],
      foreignColumns: [contentVariants.projectId, contentVariants.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the media asset: this link's project_id must
    // equal the asset's project_id. Deleting a media asset removes its variant
    // links (the referenced (project_id, id) pair is unique via the accepted
    // media_assets_project_id_id_idx from 0061 — reused, not recreated).
    foreignKey({
      columns: [table.projectId, table.mediaAssetId],
      foreignColumns: [mediaAssets.projectId, mediaAssets.id],
    }).onDelete("cascade"),
    // Link identity: one row per (content_variant_id, media_asset_id) edge, so a
    // duplicate ContentVariant/MediaAsset link is rejected by the DB (TASK item
    // 2). The leading content_variant_id also serves the variant -> media-assets
    // read path.
    uniqueIndex(
      "content_variant_media_assets_unique_content_variant_media_asset_idx",
    ).on(table.contentVariantId, table.mediaAssetId),
    // media-asset -> content-variants reads.
    index("content_variant_media_assets_media_asset_idx").on(
      table.mediaAssetId,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — immutable, Project-scoped ReleaseBundle.
//
// A ReleaseBundle is the ONE frozen business approval unit (05_DOMAIN_DATA_MODEL
// .md §12 "ReleaseBundle — Immutable approval unit"; 10_DISTRIBUTION_ARCHITECTURE
// .md §6 One Approval; docs/adr/ADR-008-releasebundle-approval.md: one approval
// freezes content/assets/targets/UTM/execution-plan hash, and changing any item
// creates a new release version; 21_TEST_ACCEPTANCE_PLAN.md §12 Release
// Immutability). This slice is the storage/contract core ONLY: it records the
// frozen bundle identity and the approval metadata, but implements NO state
// transition/CAS, NO approval action, NO dry-run execution, NO target/connector/
// account logic, NO publishing and NO paid action (TASK item 4). A row is never a
// publish instruction, execution result, approval action or public-success proof.
//
// FIELD RECONCILIATION (the TASK field list is the direct authoritative contract;
// 05_DOMAIN_DATA_MODEL.md §12, 10_DISTRIBUTION_ARCHITECTURE.md, the status
// machine in 18_WORKFLOW_STATE_MACHINES.md §1, and the legacy references
// schemas/domain-types.ts ReleaseBundle and schemas/migrations-reference.sql
// release_bundles supply the reference context):
//   - The stable `id` primary key and the explicit NOT NULL `project_id`
//     ownership key are the additions the established Search Growth schema
//     convention requires.
//   - `content_package_version_id` (NOT NULL) is the stable id of the immutable
//     ContentVersion this bundle freezes (domain-types.ts ReleaseBundle
//     contentPackageVersionId; migrations-reference content_package_version_id).
//   - `release_version` (NOT NULL) is the immutable release version number
//     (R1/R2/...) within that ContentVersion (21 plan §12 "Content v1 → Release
//     R1 → ... R2"). The unique index below makes it the release identity.
//   - `status` (NOT NULL) is exactly the V1.0 release lifecycle union
//     (DRAFT | DRY_RUN_READY | READY_FOR_APPROVAL | APPROVED | EXECUTING |
//     COMPLETED | PARTIAL | PAUSED | CANCELLED — 18 §1 / domain-types.ts
//     ReleaseBundle.status), enforced by the DB text-enum column and the named
//     CHECK below. This slice records the current value only; it implements no
//     transition and no CAS (TASK item 4).
//   - `release_strategy` (NOT NULL) is the source-defined strategy union
//     WEBSITE_FIRST | PARALLEL | SOCIAL_ONLY (domain-types.ts ReleaseBundle
//     strategy; 10 §5 Website First), enforced by the named CHECK below.
//   - `utm_policy_json` (NOT NULL) is the required opaque UTM policy document
//     frozen with the bundle (ADR-008; 21 §12 changing UTM requires a new
//     release). Opaque JSON payload stored verbatim — never a relational model.
//   - `bundle_hash` (NOT NULL) is the required opaque frozen-bundle hash
//     (ADR-008 "执行计划hash"; 21 §12 "Approve hash H1"/"Execute hash 必须等于
//     approved H1"), stored verbatim. Plain non-unique column: no hash
//     matching/dedup rule is invented in this slice.
//   - `dry_run_report_json` (nullable) is the optional opaque dry-run report
//     document (migrations-reference dry_run_report_json); NULL means no dry-run
//     report has been attached yet (the dry-run step itself is out of scope).
//   - `approved_by` / `approved_at` (nullable) are the approval fields
//     (domain-types.ts ReleaseBundle approvedBy/approvedAt); NULL means the
//     bundle is not approved. Recording them does NOT implement an approval
//     action (TASK item 4).
//   - The legacy `updated_at` column is reconciled OUT: the TASK field list names
//     the creation timestamp only, and this slice implements no state transition
//     or CAS (TASK item 4), matching the accepted immutable ContentVersion/
//     ContentVariant row shape. The row is written once; a content/asset/target/
//     UTM change creates a new release_version rather than mutating a row
//     (ADR-008; 21 §12).
//   - The legacy ReleaseTarget/PublicationExecutionPlan/PlatformDraft/PublishingJob
//     /PublicationReceipt tables are separate tasks (TASK OUT OF SCOPE): no
//     target, execution plan, job, receipt or connector/account column exists here.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) with
// ON DELETE CASCADE (the established Project-scoping FK every Search Growth row
// carries). Same-Project ContentVersion ownership is database-enforced by the
// Project-leading composite FK
//   (project_id, content_package_version_id) -> content_package_versions(project_id, id)
// so the DB (not application convention) rejects a bundle whose ContentVersion
// belongs to another Project (in either direction) and rejects a dangling
// version. The parent (project_id, id) target is the accepted
// `content_package_versions_project_id_id_idx` (added by T119, D1 0064 / PG 0042)
// and is REUSED, so this slice adds NO index to any parent (TASK item 2).
// Deleting a ContentVersion or a whole Project cascades its bundles away, so a
// bundle can never dangle.
//
// IDENTITY / UNIQUENESS: the only business uniqueness rule in this slice is the
// release identity needed to reject a duplicate (content_package_version_id,
// release_version) pair (TASK item 2), so the unique index below enforces one
// row per release version within a ContentVersion (the accepted
// content_package_versions identity pattern). content_package_version_id is a
// globally unique primary key, so once the same-Project FK holds, the pair is
// project-isolated without listing project_id in the unique index. The unique
// index's leading content_package_version_id also serves the ContentVersion ->
// release-bundles read path. No other uniqueness rule and no extra lookup index
// is invented.
// ============================================================================

export const releaseBundles = sqliteTable(
  "release_bundles",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable ContentVersion this bundle freezes. Bound to the row's
    // project by the composite FK below, which cascades bundles away when the
    // version is deleted.
    contentPackageVersionId: text("content_package_version_id").notNull(),
    // The immutable release version number (R1/R2/...) within the ContentVersion.
    // The unique index below enforces one release per version number — a change
    // to any frozen item creates a new release_version instead of mutating a row
    // (ADR-008; 21 §12). No insert-time default exists.
    releaseVersion: integer("release_version").notNull(),
    // The direct V1.0 release lifecycle union (18 §1). DB text-enum column + the
    // named CHECK below; the Zod boundary validates the same list. This slice
    // records the value only — no transition/CAS is implemented (TASK item 4).
    status: text("status", {
      enum: [
        "DRAFT",
        "DRY_RUN_READY",
        "READY_FOR_APPROVAL",
        "APPROVED",
        "EXECUTING",
        "COMPLETED",
        "PARTIAL",
        "PAUSED",
        "CANCELLED",
      ],
    }).notNull(),
    // The direct source-defined release strategy union (domain-types.ts
    // ReleaseBundle.strategy; 10 §5). DB text-enum column + the named CHECK
    // below.
    releaseStrategy: text("release_strategy", {
      enum: ["WEBSITE_FIRST", "PARALLEL", "SOCIAL_ONLY"],
    }).notNull(),
    // Required opaque UTM policy document frozen with the bundle (ADR-008; 21
    // §12). Stored verbatim — no UTM normalization/expansion happens in this
    // slice and no relational model is encoded here.
    utmPolicyJson: text("utm_policy_json").notNull(),
    // Required opaque frozen-bundle hash (ADR-008; 21 §12 "Approve hash H1").
    // Stored verbatim. Plain non-unique column: no hash matching/dedup rule.
    bundleHash: text("bundle_hash").notNull(),
    // Optional opaque dry-run report document; NULL means no report is attached
    // yet. The dry-run step itself is out of scope (TASK item 4).
    dryRunReportJson: text("dry_run_report_json"),
    // Approval fields; NULL means the bundle is not approved. Recording them does
    // NOT implement an approval action (TASK item 4).
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column: the TASK field list names the creation timestamp only and no state
    // transition/CAS is implemented, so there is no updated_at (TASK item 4).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ContentVersion: this row's project_id must
    // equal the version's project_id. Deleting a content package version removes
    // its release bundles (the referenced (project_id, id) pair is unique via the
    // accepted content_package_versions_project_id_id_idx from 0064 — reused, not
    // recreated). A bundle whose version lives on another Project has no matching
    // parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.contentPackageVersionId],
      foreignColumns: [
        contentPackageVersions.projectId,
        contentPackageVersions.id,
      ],
    }).onDelete("cascade"),
    // Release identity: one row per (content_package_version_id, release_version),
    // so a duplicate release version within a ContentVersion is rejected by the DB
    // (TASK item 2). The leading content_package_version_id also serves the
    // ContentVersion -> release-bundles read path.
    uniqueIndex(
      "release_bundles_unique_content_package_version_release_version_idx",
    ).on(table.contentPackageVersionId, table.releaseVersion),
    // Supporting unique referential target for the release_targets same-Project
    // composite FK ((project_id, release_bundle_id) ->
    // release_bundles(project_id, id), added by the T125 0070 migration). id is
    // already the PK, so this composite accepts exactly the rows the PK accepts
    // and adds no business uniqueness.
    uniqueIndex("release_bundles_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // DB-level enum rejection for the two direct release unions (the TASK requires
    // migration-backed enum rejection; the Zod boundary enforces the same lists at
    // the runtime edge).
    check(
      "release_bundles_status_valid",
      sql`(${table.status} IN ('DRAFT','DRY_RUN_READY','READY_FOR_APPROVAL','APPROVED','EXECUTING','COMPLETED','PARTIAL','PAUSED','CANCELLED'))`,
    ),
    check(
      "release_bundles_release_strategy_valid",
      sql`(${table.releaseStrategy} IN ('WEBSITE_FIRST','PARALLEL','SOCIAL_ONLY'))`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — immutable, Project-scoped ReleaseTarget core.
//
// ONE ReleaseTarget is the source-defined target intent frozen inside a
// ReleaseBundle before it is resolved into a PublicationExecutionPlan
// (05_DOMAIN_DATA_MODEL.md §12 ReleaseTarget; 10_DISTRIBUTION_ARCHITECTURE.md §2
// "each ReleaseTarget resolves into a fixed plan before execution", §4 route
// exclusivity; 16_ATTRIBUTION_EXPERIMENT_SPEC.md "ReleaseTarget has
// required=true/false"; 21_TEST_ACCEPTANCE_PLAN.md §14 max targets/release; the
// legacy `schemas/domain-types.ts` ReleaseTarget and
// `schemas/migrations-reference.sql` release_targets). This is the schema/domain
// core slice ONLY: it does not approve, execute, publish, spend, contact an
// external system, or implement any credential/account behavior (TASK items 1,
// 3, 4). A row is never a publish instruction, execution result, approval action
// or public-success proof.
//
// FIELD RECONCILIATION (TASK item 1; legacy reference is read-only):
//   - `id` (PK) is the stable target id. `project_id` (NOT NULL) carries explicit
//     Project ownership so the Project FK + same-Project composite FKs below can
//     be enforced — ownership is never inferred.
//   - `release_bundle_id` / `content_variant_id` (both NOT NULL) are the required
//     same-Project ReleaseBundle and ContentVariant owners (TASK item 2).
//   - `platform` (NOT NULL) stays an opaque free-form platform slug: the
//     platform/connector catalogue is a later gated task, so no platform enum is
//     invented here (TASK item 3; mirrors the accepted ContentVariant platform).
//   - `target_intent` (NOT NULL) is the source-defined target intent union
//     (DRAFT | PUBLIC | SUBMIT_FOR_REVIEW | PAID_SUBMIT — domain-types.ts
//     TargetIntent; 10 §2 targetIntent), DB-checked below and narrowed by the Zod
//     boundary. The legacy property name `intent` ships as `targetIntent` /
//     `target_intent` to match the source column/plan key (TASK item 4).
//   - `required` (NOT NULL DEFAULT true, DB boolean) is the source-defined
//     required flag (16 spec; the legacy `required INTEGER NOT NULL DEFAULT 1`).
//   - `scheduled_at` (nullable) is the optional schedule; NULL = not scheduled.
//     No scheduler runs in this slice.
//   - `dependency_target_id` (nullable) is the optional source-defined target
//     dependency. It is enforced as a same-Project self-reference (composite FK
//     below) and never left as an unconstrained relational id (TASK item 2).
//   - `utm_url` (nullable) is the optional UTM URL stored verbatim; NULL = none.
//     No UTM expansion/GA4 behavior exists in this slice.
//   - `target_hash` (NOT NULL) is the required opaque target hash stored verbatim
//     as a plain non-unique column; no hash matching/dedup rule is invented.
//   - `created_at` (NOT NULL) is the append-only creation timestamp and the ONLY
//     audit column: the target core is immutable, so there is no `updated_at`
//     (TASK item 4). A target/UTM/variant change creates a new release version
//     (21_TEST_ACCEPTANCE_PLAN.md §12), not a mutated row.
//   - `publisher_connection_id` (legacy NOT NULL column) is DELIBERATELY NOT
//     persisted (TASK item 3): a publisher connection/credential/account/
//     connector/external integration model belongs to a later gated
//     credential-bound task, and an unconstrained relational id must not exist.
//     There is no account/connector/credential column here.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) with
// ON DELETE CASCADE (the established Project-scoping FK every Search Growth row
// carries). Same-Project ReleaseBundle and ContentVariant ownership is
// database-enforced by two Project-leading composite FKs that carry this row's
// own project_id as their leading column:
//   (project_id, release_bundle_id) -> release_bundles(project_id, id)
//   (project_id, content_variant_id) -> content_variants(project_id, id)
// so the DB (not application convention) rejects a target whose bundle or
// variant belongs to another Project (in either direction) and rejects a
// dangling parent. Both cascade, so deleting a bundle, a variant, or a whole
// Project removes its targets and a target can never dangle. The
// ReleaseBundle composite-FK target `release_bundles_project_id_id_idx` is the
// ONE new referential parent index this slice requires (added to the accepted
// T124 table in the new 0070 migration); the ContentVariant target is the
// accepted `content_variants_project_id_id_idx` (T123, D1 0068 / PG 0046) and is
// reused, so this table adds NO index to `content_variants`.
//
// OPTIONAL DEPENDENCY: the nullable self-reference is a Project-leading
// composite FK (project_id, dependency_target_id) -> release_targets(project_id,
// id) with ON DELETE no action. A target on project A can never depend on a
// target on project B; a NULL dependency is unconstrained (MATCH SIMPLE ignores
// a composite FK with a NULL column); and deleting a target another target still
// depends on is BLOCKED (restrictive on both dialects) rather than silently
// SET NULL — which is impossible for a composite FK whose NOT NULL project_id
// cannot be nulled. This mirrors the accepted same-Project self-reference pattern
// (search_topics.merged_into_topic_id). A whole-project delete still cascades all
// same-Project targets together without being blocked.
//
// IDENTITY / UNIQUENESS: no source-defined business uniqueness rule exists for
// ReleaseTarget (the legacy release_targets table has none) and none is invented
// (TASK item 4). The only unique indexes on this table are the referential
// supporting targets the composite FKs require (`release_targets_project_id_id_idx`
// here and the reused parent indexes above). `release_bundle_id`,
// `content_variant_id` and `dependency_target_id` are all indexed only as FK
// support; there is no target-identity dedup rule in this slice.
// ============================================================================

export const releaseTargets = sqliteTable(
  "release_targets",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable ReleaseBundle this target is frozen inside. Bound to the
    // row's project by the composite FK below, which cascades targets away when
    // the bundle is deleted.
    releaseBundleId: text("release_bundle_id").notNull(),
    // The immutable ContentVariant this target publishes. Bound to the row's
    // project by the composite FK below, which cascades targets away when the
    // variant is deleted.
    contentVariantId: text("content_variant_id").notNull(),
    // Opaque target platform identifier (e.g. a platform slug) — deliberately a
    // free-form required string: the platform/connector catalogue is a separate
    // gated task, so no platform enum is invented here (TASK item 3).
    platform: text("platform").notNull(),
    // The direct source-defined target intent union (domain-types.ts
    // TargetIntent; 10 §2 targetIntent). DB text-enum column + the named CHECK
    // below; the Zod boundary validates the same list. This slice records the
    // intent only — no route resolution/execution is implemented (TASK item 4).
    targetIntent: text("target_intent", {
      enum: ["DRAFT", "PUBLIC", "SUBMIT_FOR_REVIEW", "PAID_SUBMIT"],
    }).notNull(),
    // The source-defined required flag (16 spec; legacy DEFAULT 1). A required
    // secondary target starts only after the website canonical is published.
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    // Optional schedule; NULL = not scheduled. No scheduler exists in this slice.
    scheduledAt: text("scheduled_at"),
    // Optional target dependency (legacy dependency_target_id). Bound to this
    // row's project by the composite self-FK below; NULL = no dependency.
    dependencyTargetId: text("dependency_target_id"),
    // Optional UTM URL stored verbatim; NULL = none. No UTM expansion or GA4
    // attribution behavior runs in this slice.
    utmUrl: text("utm_url"),
    // Required opaque target hash stored verbatim. Plain non-unique column: no
    // hash matching/dedup rule is invented in this slice.
    targetHash: text("target_hash").notNull(),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column: an immutable target row has no updated_at and carries no mutable
    // execution/approval/account/public-success state (TASK item 4).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ReleaseBundle. Deleting a bundle removes
    // its targets (the referenced (project_id, id) pair is unique via the
    // supporting `release_bundles_project_id_id_idx` added by this migration). A
    // target whose bundle lives on another Project has no matching parent row and
    // is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.releaseBundleId],
      foreignColumns: [releaseBundles.projectId, releaseBundles.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the ContentVariant, reusing the accepted
    // `content_variants_project_id_id_idx` (T123, D1 0068) as its referential
    // target — no index is added to content_variants. Deleting a variant removes
    // its targets; a cross-Project or dangling variant is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.contentVariantId],
      foreignColumns: [contentVariants.projectId, contentVariants.id],
    }).onDelete("cascade"),
    // Optional same-Project dependency self-reference. A NULL dependency is
    // unconstrained (MATCH SIMPLE); a non-NULL one must name a target on the SAME
    // project. Deleting a target another target still depends on is blocked (no
    // action — restrictive on both dialects) rather than SET NULL, which a
    // composite FK cannot do for the NOT NULL project_id.
    foreignKey({
      columns: [table.projectId, table.dependencyTargetId],
      foreignColumns: [table.projectId, table.id],
    }).onDelete("no action"),
    // Supporting unique referential target for the dependency self-FK: the FK
    // references (project_id, id), so that pair must be unique. This is the ONLY
    // index this table needs beyond the parent FK targets; id is already the PK,
    // so it adds no business uniqueness.
    uniqueIndex("release_targets_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // DB-level enum rejection for the source-defined target intent (the TASK
    // requires migration-backed enum rejection; the Zod boundary enforces the
    // same list at the runtime edge).
    check(
      "release_targets_target_intent_valid",
      sql`(${table.targetIntent} IN ('DRAFT','PUBLIC','SUBMIT_FOR_REVIEW','PAID_SUBMIT'))`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — append-only, Project-scoped audit events.
//
// ONE audit event is the immutable governance fact that records what happened to
// a Project-scoped object (05_DOMAIN_DATA_MODEL.md §13 "AuditEvent — append
// only"; 20_DATABASE_SCHEMA_GUIDE.md §§1/3/6; 24_RISK_REGISTER.md R42
// "Audit缺失 → append-only audit"; 30_TRACEABILITY_MATRIX.md row
// "可审计 | AuditEvent | assertions"). This is the credential-free
// schema/validation core slice ONLY: it records no external action and
// implements no runtime-control mutation, release execution, publishing,
// spend, credential/account/connector model, CRUD, UI or production behavior
// (TASK items 1, 3, 4).
//
// FIELD RECONCILIATION (TASK item 1 direct field list; the legacy read-only
// reference artifacts `schemas/domain-types.ts` AuditEvent and
// `schemas/migrations-reference.sql` `search_growth_audit_events`):
//   - `id` (PK) is the stable audit-event id and `project_id` (NOT NULL) is the
//     explicit Project ownership column, so ownership is never inferred and the
//     Project FK below can be enforced.
//   - `actor_id`, `action`, `object_type`, `object_id` and `correlation_id` are
//     NOT NULL opaque audit data. They are deliberately plain text: actor,
//     object and correlation values must not become foreign keys, and no event
//     action/object taxonomy or enum is invented in this core slice (TASK item
//     3).
//   - `before_ref` / `after_ref` are the optional before/after references,
//     stored verbatim as nullable opaque text (NULL = the event carries no
//     before/after reference). They are not foreign keys either (TASK item 3).
//   - `metadata_json` (NOT NULL) is the event's metadata document. It is stored
//     as validated JSON text (the accepted JSON-column convention,
//     20_DATABASE_SCHEMA_GUIDE.md §6) with a DB-level validity CHECK below, so
//     malformed metadata cannot be persisted on either dialect. As with every
//     sibling table, relational ids are never encoded in this JSON.
//   - `created_at` (NOT NULL) is the append-only creation timestamp. There is no
//     `updated_at`, no state-transition/current-pointer column and no mutable
//     runtime-control state on the row.
//
// APPEND-ONLY ENFORCEMENT AT THE DATABASE BOUNDARY (TASK item 2): immutability
// is not left to application convention. The forward migration adds two
// dialect-equivalent guards to the table itself:
//   - a BEFORE UPDATE trigger and a BEFORE DELETE trigger that ABORT every
//     update/delete attempt on an event row (SQLite `RAISE(ABORT, ...)`,
//     PostgreSQL `RAISE EXCEPTION`), so a direct UPDATE or DELETE is rejected by
//     the database. The migration-backed storage test asserts both rejections.
//   - Because foreign-key cascade actions fire these row triggers on both
//     dialects (verified in the SQLite test), deleting a whole Project that still
//     owns audit events is blocked as well — immutable audit history is never
//     silently dropped (R42). A row can therefore only ever be INSERTed.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// with ON DELETE CASCADE (the established Project-scoping FK every Search Growth
// row carries). The cascade can never remove audit history because the DELETE
// trigger above aborts it; the FK still guarantees a dangling event can never
// exist and that an event's project is a real Project.
//
// IDENTITY / UNIQUENESS: no source-defined business uniqueness exists for an
// audit event (neither 05 §13, the legacy reference table, nor the TASK defines
// one) and none is invented (TASK item 3): the same action/object/correlation
// may legitimately produce several event rows. The single non-unique
// project_id index serves project-scoped audit reads only.
// ============================================================================

export const searchGrowthAuditEvents = sqliteTable(
  "search_growth_audit_events",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Opaque actor identity (who/what performed the action). Deliberately not a
    // foreign key — no account/user/credential model is invented in this slice
    // (TASK item 3).
    actorId: text("actor_id").notNull(),
    // Opaque action label. No action taxonomy/enum is invented here (TASK item
    // 3).
    action: text("action").notNull(),
    // Opaque object type and object id the action applied to. Not foreign keys —
    // an audit event must be recordable for any object kind without inventing a
    // polymorphic relation (TASK item 3).
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    // Optional before/after references, stored verbatim as nullable opaque text;
    // NULL = no reference recorded. Not foreign keys (TASK item 3).
    beforeRef: text("before_ref"),
    afterRef: text("after_ref"),
    // The event metadata document persisted as JSON text. Required; the named
    // CHECK below rejects malformed JSON on both dialects. Never a relational id
    // container.
    metadataJson: text("metadata_json").notNull(),
    // Opaque correlation id grouping related events. Not a foreign key (TASK
    // item 3).
    correlationId: text("correlation_id").notNull(),
    // Append-only creation timestamp (system insert time). The row has no
    // updated_at and the migration triggers reject every UPDATE/DELETE.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Project-scoped audit reads. No business-rule unique index: several events
    // may share action/object/correlation (TASK item 3).
    index("search_growth_audit_events_project_idx").on(table.projectId),
    // Metadata validity at the storage boundary: malformed JSON is rejected.
    // PostgreSQL has no json_valid(); its mirror migration uses an equivalent
    // JSON-cast CHECK with the same name (schema-parity compares check names).
    check(
      "search_growth_audit_events_metadata_valid",
      sql`json_valid(${table.metadataJson})`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — mutable global runtime controls (kill-switch storage).
//
// ONE runtime control row is one named, globally-scoped configuration value
// (05_DOMAIN_DATA_MODEL.md §13 RuntimeControl; 10_DISTRIBUTION_ARCHITECTURE.md
// §10 Global Controls; 17_SECURITY_GOVERNANCE.md §9 Runtime Kill Switch;
// 20_DATABASE_SCHEMA_GUIDE.md §§1/3/6; 21_TEST_ACCEPTANCE_PLAN.md §14;
// 24_RISK_REGISTER.md R31 "Kill Switch仅UI → DB/server enforcement";
// 30_TRACEABILITY_MATRIX.md row "可暂停 | RuntimeControls | kill switch"). This
// is the credential-free schema/validation core slice ONLY: it records control
// values but implements no control evaluation, pause/resume behavior, job
// claiming, side-effect start/stop, publishing, spend, external contact, CRUD,
// UI or production behavior (TASK items 1 and 3).
//
// FIELD RECONCILIATION (TASK item 1 direct field list; legacy read-only
// reference artifacts `schemas/domain-types.ts` RuntimeControl,
// `schemas/migrations-reference.sql` `runtime_controls` and
// `schemas/zod-contracts.reference.ts` `runtimeControlSchema`):
//   - `control_key` (PK, NOT NULL) is the stable control identity (e.g. a global
//     or per-platform publishing pause). It is opaque text: the control
//     catalogue/keys and their evaluation are later tasks, so no key enum or
//     implicit fallback is invented (TASK item 3). PRIMARY KEY gives key
//     identity — a duplicate key is rejected.
//   - `value_json` (NOT NULL) is the control value stored as validated JSON
//     text. The source contract allows exactly the boolean|number|string union;
//     one JSON text column is the smallest dialect-neutral way to preserve that
//     union identically on SQLite/D1 and PostgreSQL (TASK item 2) instead of
//     three nullable typed columns or a JSON-vs-text dialect divergence. The
//     named CHECK below rejects malformed JSON and every unsupported JSON kind
//     (null/array/object), so only a boolean/number/string scalar is persistable.
//   - `reason` (nullable) is the optional operator reason; NULL = no reason
//     recorded. Opaque text, not a foreign key or taxonomy. The legacy zod
//     request contract bounds it at 1000 chars, but that is a request-body
//     concern; the stored row does not invent a length check (TASK item 3).
//   - `updated_by` (NOT NULL) is the required updater identity, stored verbatim
//     as opaque text. Deliberately NOT a foreign key — no account/user/actor
//     model is invented in this slice (TASK item 3).
//   - `updated_at` (NOT NULL) is the mutation timestamp, defaulted to insert
//     time. Unlike AuditEvent this row is intentionally MUTABLE configuration:
//     there is no append-only trigger, no CAS/version column, no state
//     transition and no control-evaluation/current-pointer column (TASK item 3).
//
// SCOPE: global, not Project-scoped. The control set (global publishing pause,
// per-platform pause, blast-radius limits, minimum interval; 10 §10) is a
// service-wide kill switch and the legacy reference table carries no project_id.
// Adding a Project FK would invent ownership the source does not define.
// ============================================================================

export const runtimeControls = sqliteTable(
  "runtime_controls",
  {
    // Stable control identity; the PRIMARY KEY gives key identity and rejects a
    // duplicate key. Opaque text — no control-key enum/taxonomy is invented
    // (TASK item 3).
    controlKey: text("control_key").primaryKey(),
    // The control value as JSON text carrying exactly boolean|number|string.
    // JSON storage is used ONLY to preserve the source value union identically
    // on both dialects (TASK item 2). Required.
    valueJson: text("value_json").notNull(),
    // Optional operator reason; NULL = no reason recorded. Opaque text.
    reason: text("reason"),
    // Required updater identity; opaque, not a foreign key (TASK item 3).
    updatedBy: text("updated_by").notNull(),
    // Mutable update timestamp (system time), defaulted on insert. No
    // append-only trigger and no CAS/version column (TASK item 3).
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Value validity at the storage boundary: malformed JSON and every
    // non-boolean/number/string JSON kind (null/array/object) are rejected.
    // `json_type` yields true|false|integer|real|text for the allowed union.
    // PostgreSQL has no json_valid()/json_type(); its mirror migration uses an
    // equivalent jsonb cast + jsonb_typeof CHECK with the same name
    // (schema-parity compares check names).
    check(
      "runtime_controls_value_valid",
      sql`json_valid(${table.valueJson}) AND json_type(${table.valueJson}) IN ('true','false','integer','real','text')`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped index observation facts.
//
// ONE indexing observation is one credential-free fact about a URL's search
// indexing state (20_DATABASE_SCHEMA_GUIDE.md §1 Search/Experiment
// `indexing_observations`; legacy read-only reference `schemas/
// migrations-reference.sql` `indexing_observations`). This is the persistence +
// domain-contract core slice ONLY: it does not crawl the URL, query a search
// engine, resolve URL identity, create publication receipts, publish, use
// credentials, spend or run any production behavior (TASK GOAL / items 1–3).
//
// FIELD RECONCILIATION (TASK item 1 direct field list is authoritative; the
// legacy reference table supplies the column shapes):
//   - `id` is the stable text primary key (established Search Growth convention;
//     the reference table declares it the PK).
//   - `project_id` is the explicit, NOT NULL Project ownership key (TASK item 1)
//     and the leading column of the same-Project composite FK below. It is a
//     direct projects(id) FK with ON DELETE CASCADE — the established
//     Project-scoping FK every Search Growth row carries.
//   - `url` is the observed URL stored as an OPAQUE value (TASK item 2). No
//     normalization/identity key, no URL deduplication and no uniqueness rule is
//     added here: URL normalization and identity are separately scoped later
//     work (20_DATABASE_SCHEMA_GUIDE.md §5), so the reference/domain URL
//     identity split is deliberately NOT shipped in this slice.
//   - `search_engine` is exactly the authoritative V1.0 SearchEngine union
//     (GOOGLE | BAIDU | BING | OTHER — 05_DOMAIN_DATA_MODEL.md §2
//     SearchMarketProfile, `schemas/domain-types.ts` SearchEngine). It is the one
//     direct field with an authoritative enum, so it is a DB text-enum column
//     plus the named `indexing_observations_search_engine_valid` CHECK below; the
//     Zod boundary in src/types/schemas/indexing-observation.ts validates the
//     same list. No other engine value/fallback is admitted.
//   - `market_profile_id` is the optional same-Project SearchMarketProfile the
//     observation is scoped to (TASK item 1 "optional MarketProfile"; TASK item
//     2 same-Project ownership). It is NULL when no profile is attached; when
//     present the Project-leading composite FK
//     (project_id, market_profile_id) -> search_market_profiles(project_id, id)
//     makes the DB itself reject a profile from another Project. Deleting the
//     profile (or the Project) cascades the scoped observations away, matching
//     the established optional-profile relation on search_prompts /
//     geo_observation_runs / search_growth_opportunities.
//   - `observation_type` and `status` are required opaque text (TASK item 1).
//     No V1.0 document defines an observation-type or observation-status union
//     (the reference table stores both as unconstrained TEXT and neither
//     `schemas/domain-types.ts` nor `schemas/zod-contracts.reference.ts` declares
//     an IndexObservation enum), so — per TASK item 3 "use only source-defined
//     enum/status values where an authoritative source defines them" — no enum,
//     CHECK or taxonomy is invented and no lifecycle transition is implied.
//   - `details_json` is the required observation-details JSON document (TASK item
//     1 "details JSON"). It is validated at the DATABASE boundary by the named
//     `indexing_observations_details_valid` CHECK on both dialects (TASK item 3);
//     the PostgreSQL mirror uses an equivalent jsonb-cast CHECK because it has no
//     json_valid(). No shape is decomposed into relational columns — detail data
//     is never encoded to avoid a join (TASK item 3).
//   - `observed_at` is the required application-supplied moment the observation
//     was recorded (TASK item 1 "observed timestamp"). Distinct from the
//     append-only system `created_at` insert timestamp below.
//   - `created_at` is the append-only system insert timestamp the established
//     Search Growth row convention adds. There is deliberately NO `updated_at`:
//     an observation is a point-in-time fact and TASK item 3 authorizes no
//     lifecycle transition or update behavior.
//   - The reference table's `publication_receipt_id` column is NOT shipped
//     (TASK item 2): the credential-bound publication_receipts domain does not
//     exist in the accepted schema yet, so no unconstrained receipt reference is
//     persisted. A later receipt task adds the relation alongside that domain.
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE; the optional-profile composite FK above also cascades, so
// deleting a Project or a market profile removes its observations and no
// observation can dangle. There is NO business-rule unique index (TASK item 3
// forbids business uniqueness / URL dedup): the two non-unique indexes below
// serve only project-scoped reads and the market-profile cascade/read path.
// ============================================================================

export const indexingObservations = sqliteTable(
  "indexing_observations",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The observed URL, OPAQUE in this slice. No normalization/identity key and
    // no dedup rule exists here (TASK item 2; URL identity is later work).
    url: text("url").notNull(),
    // The exact SearchEngine union (GOOGLE | BAIDU | BING | OTHER). DB text-enum
    // column + the named CHECK below; the Zod boundary validates the same list.
    searchEngine: text("search_engine", {
      enum: ["GOOGLE", "BAIDU", "BING", "OTHER"],
    }).notNull(),
    // Optional same-Project SearchMarketProfile; NULL means no profile attached.
    // The Project-leading composite FK below keeps it same-Project.
    marketProfileId: text("market_profile_id"),
    // Required opaque observation-kind label. No authoritative enum exists, so
    // no enum/taxonomy is invented (TASK item 3).
    observationType: text("observation_type").notNull(),
    // Required opaque status label. No authoritative enum exists, so no enum/
    // lifecycle transition is invented (TASK item 3).
    status: text("status").notNull(),
    // Required observation-details JSON document; validated at the DB boundary
    // by the named CHECK below. Never used as relational identity.
    detailsJson: text("details_json").notNull(),
    // The application-supplied moment the observation was recorded (TASK item 1
    // "observed timestamp"), distinct from the system `created_at` below.
    observedAt: text("observed_at").notNull(),
    // Append-only creation timestamp (system insert time). No updated_at exists:
    // an observation is a point-in-time fact with no update/lifecycle behavior.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the optional market profile: when set, the
    // observation's project_id must equal the profile's project_id. The
    // referenced (project_id, id) pair is unique via the supporting
    // search_market_profiles_project_id_id_idx index (0049). NULL
    // market_profile_id means no profile is attached and the FK is not
    // enforced. A profile from another Project has no matching parent row.
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // DB-level enum rejection for the one authoritative enum (SearchEngine).
    // The Zod boundary enforces the same list at the runtime edge. PostgreSQL
    // uses the same check name/expression (schema-parity compares check names).
    check(
      "indexing_observations_search_engine_valid",
      sql`(${table.searchEngine} IN ('GOOGLE','BAIDU','BING','OTHER'))`,
    ),
    // Details-document validity at the storage boundary: malformed JSON is
    // rejected. PostgreSQL has no json_valid(); its mirror migration uses an
    // equivalent jsonb-cast CHECK with the same name (schema-parity compares
    // check names).
    check(
      "indexing_observations_details_valid",
      sql`json_valid(${table.detailsJson})`,
    ),
    // Project-scoped observation reads.
    index("indexing_observations_project_idx").on(table.projectId),
    // Market profile -> observations reads and the profile cascade delete path.
    index("indexing_observations_market_profile_idx").on(table.marketProfileId),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped Experiment core (credential-free).
//
// ONE Experiment is the persisted, Project-scoped container that binds a Topic
// (and optionally the Opportunity and ReleaseBundle that motivated it) to a
// written hypothesis plus the opaque reference/policy documents a later
// measurement slice will read (05_DOMAIN_DATA_MODEL.md §14 Experiment;
// 16_ATTRIBUTION_EXPERIMENT_SPEC.md §§4–5; 21_TEST_ACCEPTANCE_PLAN.md §27).
// This is the persistence + domain-contract core slice ONLY: it does not
// activate an experiment, schedule a workflow, create snapshots, publish, call a
// provider, use credentials, spend or run any production behavior (TASK GOAL).
// A stored row is a plan/record, never an activation, execution or success proof.
//
// FIELD RECONCILIATION (TASK item 1 direct field list is authoritative; the
// legacy read-only `schemas/migrations-reference.sql` `experiments` table
// supplies the column shapes):
//   - `id` is the stable text primary key (established Search Growth convention).
//   - `project_id` is the explicit, NOT NULL Project ownership key (TASK item 1
//     "explicit Project ownership") and the leading column of every same-Project
//     composite FK below. It is a direct projects(id) FK ON DELETE CASCADE.
//   - `topic_id` is the REQUIRED Topic relation (TASK item 1 "required Topic").
//     Bound same-Project by the composite FK below; deleting the Topic (or the
//     Project) cascades the Experiment away.
//   - `opportunity_id` is the OPTIONAL Opportunity relation (TASK item 1
//     "optional Opportunity"); NULL = the experiment was not seeded by a stored
//     Opportunity. Bound same-Project by the composite FK below; deleting the
//     referenced Opportunity cascades the Experiment away.
//   - `release_bundle_id` is the OPTIONAL ReleaseBundle relation (TASK item 1
//     "optional ReleaseBundle"); NULL = no release is attached. Bound same-Project
//     by the composite FK below; deleting the referenced ReleaseBundle cascades
//     the Experiment away.
//   - `title`/`hypothesis` are the required human-facing record (reference table
//     both NOT NULL TEXT); carried verbatim, no content handling.
//   - `status` is required opaque text (TASK item 3). No V1.0 document defines an
//     Experiment status/lifecycle union (the reference table stores plain TEXT and
//     neither `schemas/domain-types.ts` nor `schemas/state-machines.json` declares
//     an Experiment status), so — per TASK item 3 — no enum, CHECK or lifecycle
//     transition is invented here.
//   - `activation_policy` IS the one field with an authoritative value set:
//     16_ATTRIBUTION_EXPERIMENT_SPEC.md §4 defines the Distribution Experiment
//     activation configuration as FIRST_REQUIRED_PUBLIC | ALL_REQUIRED_TERMINAL
//     (documented default FIRST_REQUIRED_PUBLIC). It is therefore a DB text-enum
//     column plus the named `experiments_activation_policy_valid` CHECK; the Zod
//     boundary validates the same list. No DB default is set — the documented
//     default is a resolution rule for later work, not an activation performed
//     here (TASK item 3 "do not invent lifecycle semantics").
//   - `activation_at` is the optional activation timestamp (TASK item 1); NULL =
//     not activated. This slice only stores the value; it never sets it (no
//     activation runtime exists here).
//   - `target_keyword_refs_json`, `target_prompt_refs_json`,
//     `target_surface_refs_json` and `recheck_policy_json` are required opaque
//     reference/policy documents persisted as JSON text (TASK item 1). Each is
//     validated at the DATABASE boundary by its own named CHECK on both dialects
//     (TASK item 3); none is decomposed into relational columns or used as
//     relational identity (TASK item 3).
//   - `created_at` is the append-only system insert timestamp the established
//     Search Growth row convention adds. There is deliberately NO `updated_at`:
//     the field list names the creation timestamp only and no state transition is
//     authorized in this slice.
//   - The reference `experiment_snapshots` table is NOT created by this table;
//     it is added by the T130 0075 migration, which also adds this table's ONE
//     referential supporting unique index `experiments_project_id_id_idx`
//     ((project_id, id), the target its composite FK requires) — see the
//     experimentSnapshots table below.
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE (the established Project-scoping FK). Same-Project ownership
// for Topic/Opportunity/ReleaseBundle is database-enforced by three
// Project-leading composite FKs that carry this row's own project_id as their
// leading column; a relation to another Project has no matching parent row and
// is rejected by the DB. All three cascade, consistent with the established
// parent-reference convention (the optional-profile relations on search_prompts /
// geo_observation_runs / search_growth_opportunities / indexing_observations all
// cascade too), so deleting a Topic, Opportunity, ReleaseBundle or whole Project
// removes its Experiments and none can dangle.
//
// IDENTITY / UNIQUENESS: the TASK forbids inventing business uniqueness, and no
// V1.0 artifact constrains title/hypothesis/topic uniqueness, so there is NO
// business unique index on this table. The referenced (project_id, id) pairs the
// composite FKs need already exist on search_topics / search_growth_opportunities
// / release_bundles. The ONLY unique index on this table is the referential
// supporting target `experiments_project_id_id_idx` ((project_id, id)) required
// by the experiment_snapshots composite FK added alongside its own table by the
// T130 0075 migration — id is already the PK, so it accepts exactly the PK's
// rows and adds no business uniqueness.
// ============================================================================

export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The REQUIRED same-Project SearchTopic this experiment runs against
    // (search_topics.id, ADR-004). Bound to the row's project by the composite
    // FK below, which cascades experiments away when the topic is deleted.
    topicId: text("topic_id").notNull(),
    // The OPTIONAL same-Project Opportunity that motivated this experiment;
    // NULL = not seeded by a stored opportunity. Bound to the row's project by
    // the composite FK below, which cascades experiments away when the
    // opportunity is deleted.
    opportunityId: text("opportunity_id"),
    // The OPTIONAL same-Project ReleaseBundle under measurement; NULL = no
    // release attached. Bound to the row's project by the composite FK below,
    // which cascades experiments away when the bundle is deleted.
    releaseBundleId: text("release_bundle_id"),
    // Required human-facing experiment title; carried verbatim.
    title: text("title").notNull(),
    // Required written hypothesis; carried verbatim. No evaluation/decision
    // logic exists in this slice.
    hypothesis: text("hypothesis").notNull(),
    // Required opaque lifecycle label. No authoritative Experiment status union
    // exists in V1.0, so no enum/lifecycle transition is invented (TASK item 3).
    status: text("status").notNull(),
    // The one authoritative enum: the source-defined Distribution Experiment
    // activation policy (FIRST_REQUIRED_PUBLIC | ALL_REQUIRED_TERMINAL —
    // 16_ATTRIBUTION_EXPERIMENT_SPEC.md §4). DB text-enum column + the named
    // CHECK below; the Zod boundary validates the same list. No DB default: the
    // documented default FIRST_REQUIRED_PUBLIC is resolved by later work, not
    // applied by this storage slice.
    activationPolicy: text("activation_policy", {
      enum: ["FIRST_REQUIRED_PUBLIC", "ALL_REQUIRED_TERMINAL"],
    }).notNull(),
    // Optional activation timestamp (TASK item 1); NULL = not activated. Stored
    // only — no activation runtime exists here.
    activationAt: text("activation_at"),
    // Required opaque target keyword-reference document as JSON text; validated
    // at the DB boundary by the named CHECK below. Never relational identity.
    targetKeywordRefsJson: text("target_keyword_refs_json").notNull(),
    // Required opaque target prompt-reference document as JSON text; validated
    // at the DB boundary by the named CHECK below.
    targetPromptRefsJson: text("target_prompt_refs_json").notNull(),
    // Required opaque target surface-reference document as JSON text; validated
    // at the DB boundary by the named CHECK below.
    targetSurfaceRefsJson: text("target_surface_refs_json").notNull(),
    // Required opaque recheck-policy document as JSON text; validated at the DB
    // boundary by the named CHECK below.
    recheckPolicyJson: text("recheck_policy_json").notNull(),
    // Append-only creation timestamp (system insert time). No updated_at exists:
    // no state transition is authorized in this slice.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the REQUIRED topic: the experiment's
    // project_id must equal the topic's project_id. Deleting a topic removes its
    // experiments (the referenced (project_id, id) pair is unique via the
    // accepted search_topics_project_id_id_idx).
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the OPTIONAL opportunity: when set, the
    // experiment's project_id must equal the opportunity's project_id. Deleting
    // the opportunity removes experiments that reference it (the referenced
    // (project_id, id) pair is unique via the accepted
    // search_growth_opportunities_project_id_id_idx). NULL opportunity_id means
    // no opportunity is attached and the FK is not enforced (MATCH SIMPLE).
    foreignKey({
      columns: [table.projectId, table.opportunityId],
      foreignColumns: [
        searchGrowthOpportunities.projectId,
        searchGrowthOpportunities.id,
      ],
    }).onDelete("cascade"),
    // Same-Project composite FK to the OPTIONAL release bundle: when set, the
    // experiment's project_id must equal the bundle's project_id. Deleting the
    // bundle removes experiments that reference it (the referenced
    // (project_id, id) pair is unique via the accepted
    // release_bundles_project_id_id_idx). NULL release_bundle_id means no bundle
    // is attached and the FK is not enforced (MATCH SIMPLE).
    foreignKey({
      columns: [table.projectId, table.releaseBundleId],
      foreignColumns: [releaseBundles.projectId, releaseBundles.id],
    }).onDelete("cascade"),
    // DB-level enum rejection for the one authoritative enum (activation
    // policy). The Zod boundary enforces the same list at the runtime edge.
    // PostgreSQL uses the same check name/expression (schema-parity compares
    // check names).
    check(
      "experiments_activation_policy_valid",
      sql`(${table.activationPolicy} IN ('FIRST_REQUIRED_PUBLIC','ALL_REQUIRED_TERMINAL'))`,
    ),
    // Reference/policy document validity at the storage boundary: malformed
    // JSON is rejected. PostgreSQL has no json_valid(); its mirror migration
    // uses an equivalent jsonb-cast CHECK with the same name (schema-parity
    // compares check names).
    check(
      "experiments_target_keyword_refs_valid",
      sql`json_valid(${table.targetKeywordRefsJson})`,
    ),
    check(
      "experiments_target_prompt_refs_valid",
      sql`json_valid(${table.targetPromptRefsJson})`,
    ),
    check(
      "experiments_target_surface_refs_valid",
      sql`json_valid(${table.targetSurfaceRefsJson})`,
    ),
    check(
      "experiments_recheck_policy_valid",
      sql`json_valid(${table.recheckPolicyJson})`,
    ),
    // Project-scoped experiment reads.
    index("experiments_project_idx").on(table.projectId),
    // Topic -> experiments reads and the topic cascade delete path.
    index("experiments_topic_idx").on(table.topicId),
    // Opportunity -> experiments reads and the opportunity cascade delete path.
    index("experiments_opportunity_idx").on(table.opportunityId),
    // ReleaseBundle -> experiments reads and the bundle cascade delete path.
    index("experiments_release_bundle_idx").on(table.releaseBundleId),
    // Supporting unique target for the experiment_snapshots same-Project
    // composite FK ((project_id, experiment_id) -> experiments(project_id, id),
    // added by the T130 0075 migration). id is already the PK, so this composite
    // accepts exactly the rows the PK accepts and adds NO business uniqueness —
    // it is the ONE referential index that child migration adds to this parent.
    uniqueIndex("experiments_project_id_id_idx").on(table.projectId, table.id),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped, append-only Experiment snapshots.
//
// ONE ExperimentSnapshot is the immutable, Project-scoped measurement record of
// ONE capture for an Experiment (05_DOMAIN_DATA_MODEL.md §14 ExperimentSnapshot;
// 16_ATTRIBUTION_EXPERIMENT_SPEC.md §6 Windows; 21_TEST_ACCEPTANCE_PLAN.md §27;
// legacy read-only `schemas/domain-types.ts` ExperimentSnapshot and
// `schemas/migrations-reference.sql` experiment_snapshots). This is the
// credential-free persistence + domain-contract slice ONLY: it does not
// activate an experiment, schedule a recheck, calculate attribution/comparison,
// query GEO/GSC/GA4/rank/index data, call a provider, publish, use credentials,
// spend or run any production behavior (TASK GOAL). A stored snapshot is a
// recorded measurement context and payload, never a causal conclusion.
//
// FIELD RECONCILIATION (TASK item 1 field list is authoritative; the legacy
// reference table and domain type supply the column/field shapes):
//   - `id` is the stable text primary key (established Search Growth
//     convention).
//   - `project_id` is the explicit, NOT NULL Project identity (TASK item 2) and
//     the leading column of the same-Project composite FK below. It is a direct
//     projects(id) FK ON DELETE CASCADE — the established Project-scoping FK
//     every Search Growth row carries.
//   - `experiment_id` is the REQUIRED Experiment relation (TASK item 1). Bound
//     same-Project by the composite FK below, so a snapshot is database-proven
//     to belong to its Experiment's Project (TASK item 2).
//   - `snapshot_type` is the source-defined snapshot taxonomy
//     (BASELINE | D7 | D14 | D30 | MANUAL — legacy `schemas/domain-types.ts`
//     ExperimentSnapshot.type). It is a DB text-enum column plus the named
//     `experiment_snapshots_snapshot_type_valid` CHECK; the Zod boundary
//     validates the same list. No window/lifecycle taxonomy beyond this
//     source-defined union is invented (TASK item 3).
//   - `captured_at` is the required application-supplied capture moment
//     (reference column `captured_at`; domain-types `capturedAt`), distinct from
//     the append-only system `created_at` insert timestamp below.
//   - `window_start` / `window_end` and `timezone` are the optional measurement
//     window context (05 §14 "window start/end; timezone"; 16 §6; 21 §27). NULL
//     means the snapshot records no window (e.g. a point-in-time GEO sample) or
//     no explicit timezone. No data-lag policy or window calculation is
//     implemented here (TASK item 3).
//   - `seo_metrics_json`, `geo_metrics_json`, `ga4_metrics_json`,
//     `publication_metrics_json` and `indexing_metrics_json` are the five
//     REQUIRED metric documents (TASK item 1; reference table columns), each
//     persisted as JSON text. `data_quality_json` is the REQUIRED data-quality
//     document (05 §14 "data quality warnings"; 16 §6; reference table). Every
//     one is validated at the DATABASE boundary by its own named CHECK on both
//     dialects (TASK item 3); none is decomposed into relational columns and no
//     measurement formula, comparison or attribution value is computed (TASK
//     item 3 / OUT OF SCOPE).
//   - `notes` is the optional free-text note (reference column `notes`); NULL =
//     no note recorded.
//   - `created_at` is the append-only system insert timestamp the established
//     Search Growth row convention adds. There is deliberately NO `updated_at`:
//     the row is immutable once written.
//
// APPEND-ONLY ENFORCEMENT AT THE DATABASE BOUNDARY (TASK item 3): immutability
// is not left to application convention. The forward migration adds the
// established accepted append-only guards (the AuditEvent pattern) to the table
// itself:
//   - a BEFORE UPDATE trigger and a BEFORE DELETE trigger that ABORT every
//     update/delete attempt on a snapshot row (SQLite `RAISE(ABORT, ...)`,
//     PostgreSQL `RAISE EXCEPTION`), so a direct UPDATE or DELETE is rejected by
//     the database. The migration-backed storage test asserts both rejections.
//   - Because foreign-key cascade actions fire these row triggers on both
//     dialects, deleting an Experiment (or a whole Project) that still owns
//     snapshots is blocked as well, so immutable measurement history is never
//     silently dropped. The ON DELETE CASCADE FK below still guarantees a
//     dangling snapshot can never exist.
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE; the same-Project composite FK
// (project_id, experiment_id) -> experiments(project_id, id) carries this row's
// project_id as its leading column and also cascades, so a snapshot whose
// Experiment belongs to another Project has no matching parent row and is
// rejected by the DB. The referenced (project_id, id) pair is unique via the
// supporting `experiments_project_id_id_idx` unique index the T130 0075
// migration adds to the `experiments` table (id is already the PK; that index
// is the ONE referential target this slice adds, not a business rule).
//
// IDENTITY / UNIQUENESS: the TASK forbids business uniqueness, and no V1.0
// artifact defines a snapshot identity rule (several snapshots of the same
// Experiment/type/window are legal re-captures), so there is NO unique index on
// this table. The single non-unique index below serves the Experiment ->
// snapshots read path and its cascade delete path only.
// ============================================================================

export const experimentSnapshots = sqliteTable(
  "experiment_snapshots",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The Experiment this snapshot measures. Bound to the row's project by the
    // composite FK below, which cascades snapshots away when the experiment is
    // deleted (subject to the append-only DELETE trigger guard).
    experimentId: text("experiment_id").notNull(),
    // The source-defined snapshot taxonomy (BASELINE | D7 | D14 | D30 | MANUAL —
    // legacy domain-types ExperimentSnapshot.type). DB text-enum column + the
    // named CHECK below; the Zod boundary validates the same list. No additional
    // taxonomy/lifecycle is invented (TASK item 3).
    snapshotType: text("snapshot_type", {
      enum: ["BASELINE", "D7", "D14", "D30", "MANUAL"],
    }).notNull(),
    // The application-supplied capture moment; distinct from system created_at.
    capturedAt: text("captured_at").notNull(),
    // Optional measurement window context; NULL = none recorded. Stored only —
    // no window/data-lag calculation is implemented here (TASK item 3).
    windowStart: text("window_start"),
    windowEnd: text("window_end"),
    // Optional IANA/system timezone for the window; NULL = none recorded.
    timezone: text("timezone"),
    // The five REQUIRED metric documents, each persisted as JSON text and
    // validated at the DB boundary by its own named CHECK below. Never
    // decomposed into relational identity and never a computed attribution.
    seoMetricsJson: text("seo_metrics_json").notNull(),
    geoMetricsJson: text("geo_metrics_json").notNull(),
    ga4MetricsJson: text("ga4_metrics_json").notNull(),
    publicationMetricsJson: text("publication_metrics_json").notNull(),
    indexingMetricsJson: text("indexing_metrics_json").notNull(),
    // The REQUIRED data-quality document (warnings/sample context); validated at
    // the DB boundary by the named CHECK below. Never relational identity.
    dataQualityJson: text("data_quality_json").notNull(),
    // Optional free-text note; NULL = no note recorded.
    notes: text("notes"),
    // Append-only creation timestamp (system insert time). No updated_at exists:
    // the migration's append-only triggers reject every UPDATE/DELETE.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the Experiment: the snapshot's project_id
    // must equal the experiment's project_id, so a snapshot is DB-proven to
    // belong to its Experiment's Project (TASK item 2). Deleting the experiment
    // removes its snapshots (the referenced (project_id, id) pair is unique via
    // the supporting experiments_project_id_id_idx added by this task's 0075
    // migration), subject to the append-only DELETE trigger guard. A NULL
    // project_id/experiment_id is impossible (both NOT NULL).
    foreignKey({
      columns: [table.projectId, table.experimentId],
      foreignColumns: [experiments.projectId, experiments.id],
    }).onDelete("cascade"),
    // DB-level rejection for the one source-defined taxonomy. The Zod boundary
    // enforces the same list at the runtime edge. PostgreSQL uses the same check
    // name/expression (schema-parity compares check names).
    check(
      "experiment_snapshots_snapshot_type_valid",
      sql`(${table.snapshotType} IN ('BASELINE','D7','D14','D30','MANUAL'))`,
    ),
    // Every required JSON document is validated at the storage boundary:
    // malformed JSON is rejected. PostgreSQL has no json_valid(); its mirror
    // migration uses an equivalent jsonb-cast CHECK with the same name
    // (schema-parity compares check names).
    check(
      "experiment_snapshots_seo_metrics_valid",
      sql`json_valid(${table.seoMetricsJson})`,
    ),
    check(
      "experiment_snapshots_geo_metrics_valid",
      sql`json_valid(${table.geoMetricsJson})`,
    ),
    check(
      "experiment_snapshots_ga4_metrics_valid",
      sql`json_valid(${table.ga4MetricsJson})`,
    ),
    check(
      "experiment_snapshots_publication_metrics_valid",
      sql`json_valid(${table.publicationMetricsJson})`,
    ),
    check(
      "experiment_snapshots_indexing_metrics_valid",
      sql`json_valid(${table.indexingMetricsJson})`,
    ),
    check(
      "experiment_snapshots_data_quality_valid",
      sql`json_valid(${table.dataQualityJson})`,
    ),
    // Experiment -> snapshots reads and the experiment cascade delete path.
    index("experiment_snapshots_experiment_idx").on(table.experimentId),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped SearchGrowthTarget configuration core.
//
// ONE search_growth_targets row is the credential-free, Project-scoped targeting
// configuration for an existing OpenSEO Project (05_DOMAIN_DATA_MODEL.md §1
// SearchGrowthTarget; `schemas/openapi.yaml` SearchGrowthTarget; legacy
// read-only `schemas/migrations-reference.sql` search_growth_targets;
// templates/project-search-growth.example.json). This is the persistence +
// domain-contract slice ONLY: it records the configuration document and its
// provenance and implements no Market relation, activation, runtime, workflow,
// provider call, GEO/GSC/GA4 query, credential, publishing, spend, UI or
// production behavior (TASK GOAL / OUT OF SCOPE). It reuses the existing
// OpenSEO `projects` table and adds NO second Project model, CRUD flow or
// business uniqueness (TASK item 2).
//
// FIELD RECONCILIATION (TASK item 1 direct field list is authoritative; the
// legacy reference table supplies the column shapes; `schemas/openapi.yaml`
// SearchGrowthTarget supplies the accepted configuration-document shape):
//   - `project_id` is BOTH the primary key and a NOT NULL FK to the existing
//     projects(id) ON DELETE CASCADE — the reference table's identity preserved
//     verbatim (TASK item 2). The PK makes a Project's target configuration a
//     single row (a second row for the same Project is rejected), and the FK
//     makes a row exist only for an existing Project and removes it when that
//     Project is deleted. No Project data (name/domain/...) is duplicated here.
//   - `config_json` is the REQUIRED configuration document persisted as JSON
//     text (reference column `config_json`). Its accepted runtime shape is the
//     openapi SearchGrowthTarget object — required `brandAliases`,
//     `productTargets`, `icps`, `personas`, `conversionGoals`, each an array of
//     strings — matched by the Zod boundary in
//     src/types/schemas/search-growth-target.ts (TASK items 1–2). The named
//     CHECK below validates the document at the database boundary: malformed
//     JSON is rejected on both dialects. `preferred_market_profile_ids[]` is
//     deliberately NOT encoded here — it remains a separately scoped normalized
//     Project->Market relation after this core table is accepted (TASK item 3).
//   - `updated_by` is the REQUIRED configuration provenance (reference column
//     `updated_by`), stored verbatim as opaque text. Deliberately NOT a foreign
//     key — no account/user/actor model is invented in this slice.
//   - `updated_at` is the REQUIRED update timestamp (reference column
//     `updated_at`), defaulted to insert time. Unlike the append-only Search
//     Growth fact tables this row is intentionally MUTABLE configuration:
//     re-configuring updates this single row in place (there is no append-only
//     trigger, no CAS/version column and no created_at).
//
// IDENTITY / UNIQUENESS: project_id is the PRIMARY KEY and the SOLE identity
// rule (one row per Project, TASK item 2). No additional business uniqueness is
// added and no separate index is needed — the PK already serves the only
// project-scoped lookup (the row is addressed by project_id).
// ============================================================================

export const searchGrowthTargets = sqliteTable(
  "search_growth_targets",
  {
    // One-row-per-Project identity: the PRIMARY KEY rejects a second row for
    // the same Project, and the FK binds the row to an existing Project.
    // Deleting the Project cascades this configuration away.
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The required targeting configuration document (the openapi
    // SearchGrowthTarget shape), persisted as JSON text and validated by the
    // named CHECK below. No relational data is encoded in it — the
    // preferred-market relation is deliberately out of scope (TASK item 3).
    configJson: text("config_json").notNull(),
    // Required configuration provenance, opaque text. Not a foreign key: no
    // user/actor model is invented (TASK item 3).
    updatedBy: text("updated_by").notNull(),
    // Required mutable update timestamp, defaulted to insert time. No
    // append-only trigger and no created_at (TASK item 3).
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Configuration-document validity at the storage boundary: malformed JSON is
    // rejected. PostgreSQL has no json_valid(); its mirror migration uses an
    // equivalent jsonb-cast CHECK with the same name (schema-parity compares
    // check names).
    check(
      "search_growth_targets_config_valid",
      sql`json_valid(${table.configJson})`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — normalized, Project-scoped SearchGrowthTarget preferred
// SearchMarketProfile relation.
//
// One row is ONE preferred-market reference of a Project's search growth target
// (05_DOMAIN_DATA_MODEL.md §1 SearchGrowthTarget `preferred_market_profile_ids[]`).
// This realizes the relation T131 deferred: the accepted target configuration
// document (`config_json`) deliberately does NOT encode the ids, so the relation
// is stored as a table with an explicit typed FK column — never a JSON/text
// array on `search_growth_targets` (TASK GOAL). Storage/contract only: no
// ordering, priority, primary-market semantics, market CRUD, activation,
// runtime, workflow, provider call, credential, publishing or spend behavior is
// added here (TASK OUT OF SCOPE).
//
// FIELD RECONCILIATION: §1 lists `preferred_market_profile_ids[]`; this slice
// ships the established normalized-relation shape — the stable `id` primary key,
// the row's own explicit `project_id`, the referenced `market_profile_id` and
// the append-only `created_at` system timestamp. The referenced market profile
// already carries the concrete engine/location/language/device identity, so no
// market payload (name/engine/location/...) is duplicated on the relation and
// no ordering/priority/primary flag is invented.
//
// PROJECT SCOPING / TARGET OWNERSHIP (database-enforced, not convention): the
// relation carries its own explicit `project_id` (a NOT NULL FK to projects(id)
// ON DELETE CASCADE, the established Project-scoping FK every Search Growth row
// carries) plus two more FK constraints:
//   - project_id -> search_growth_targets(project_id): the target table's
//     PRIMARY KEY *is* project_id (one configuration row per Project), so this
//     one-column FK binds the relation to that Project's existing target row and
//     a relation can never exist without its target. "A target row and its
//     market relation must belong to the same Project" is therefore structural:
//     the relation's project_id must equal the target row's project_id.
//   - (project_id, market_profile_id) -> search_market_profiles(project_id, id):
//     the composite FK's leading column is this row's project_id, so a market
//     profile on another Project has no matching parent row and the DB rejects
//     the relation. The referenced (project_id, id) pair is unique via the
//     supporting `search_market_profiles_project_id_id_idx` target index (0049).
// Deleting the Project cascades the target (and this relation directly), a
// target row cascades its preferred-market references, and a market profile
// cascades the relations scoped to it — so a relation can never dangle.
//
// IDENTITY / DUPLICATE EDGES: the natural pair identity of a preferred-market
// reference is (project_id, market_profile_id) — the relation's target is
// identified by project_id (the target's PK) and the referenced market by
// market_profile_id. The unique index below rejects a duplicate target/market
// reference. market_profile_id is a globally unique primary key, so once the
// same-Project composite FK holds the pair is project-isolated and no second
// business uniqueness rule is added. The reverse index serves the
// market_profile -> targets read path and the market-profile delete cascade
// path; the unique index's leading project_id already serves target -> markets
// reads.
// ============================================================================

export const searchGrowthTargetPreferredMarketProfiles = sqliteTable(
  "search_growth_target_preferred_market_profiles",
  {
    id: text("id").primaryKey(),
    // This relation's own Project — explicit identity so the same-Project FKs
    // below can carry it as their leading column. Deleting the Project cascades
    // the relation away.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The preferred SearchMarketProfile (search_market_profiles.id). Bound to
    // this row's project by the composite FK below; deleting the market profile
    // cascades the relation away. No market payload is duplicated here.
    marketProfileId: text("market_profile_id").notNull(),
    // Append-only creation timestamp (system insert time). A relation row
    // carries no mutable payload and no updated_at — it is a preference edge,
    // not a mutable lifecycle row.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // The relation belongs to the Project's existing search_growth_targets row.
    // The target table's PRIMARY KEY is project_id, so this FK's single column
    // is both the target reference and the Project identity. Deleting the
    // target row cascades its preferred-market references away.
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [searchGrowthTargets.projectId],
    }).onDelete("cascade"),
    // Same-Project composite FK to the market profile: this relation's
    // project_id must equal the profile's project_id. Deleting a profile removes
    // the relations that prefer it (the referenced (project_id, id) pair is
    // unique via search_market_profiles_project_id_id_idx from 0049).
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // Duplicate-edge guard: one row per (project_id, market_profile_id)
    // target/market reference. The leading project_id also serves target ->
    // markets reads.
    uniqueIndex("search_growth_target_preferred_market_profiles_unique_idx").on(
      table.projectId,
      table.marketProfileId,
    ),
    // market_profile -> targets reads and the market-profile delete cascade
    // path.
    index("search_growth_target_preferred_market_profiles_market_idx").on(
      table.marketProfileId,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — immutable, Project-scoped PublicationExecutionPlan core.
//
// ONE plan is the fixed route/strategy/policy snapshot that resolves ONE
// accepted ReleaseTarget before execution (05_DOMAIN_DATA_MODEL.md §12
// PublicationExecutionPlan; 10_DISTRIBUTION_ARCHITECTURE.md §2 "each
// ReleaseTarget resolves into a fixed plan before execution" and "the runtime
// agent never decides at execution time how to publish", §4 route exclusivity;
// schemas/domain-types.ts PublicationExecutionPlan; skills/08-distribution-plan.md
// outputs "route, stager/finalizer/executor, required fields, verification
// policy"; the legacy `schemas/migrations-reference.sql`
// publication_execution_plans). This is the schema/domain core slice ONLY: it
// does not approve, execute, publish, spend, contact an external system, or
// implement any credential/account/connector behavior (TASK items 1, 3, 4). A
// row is never a publish instruction, execution result, approval action or
// public-success proof, and no plan is resolved at runtime in this slice.
//
// FIELD RECONCILIATION (TASK item 1; legacy reference is read-only):
//   - `id` (PK) is the stable plan id. `project_id` (NOT NULL) carries explicit
//     Project ownership so the Project FK + same-Project composite FK below can
//     be enforced — ownership is never inferred. The legacy reference table has
//     no project_id; it is added here because the TASK names "explicit Project
//     identity" and requires Project-leading constraints (TASK item 2).
//   - `release_target_id` (NOT NULL UNIQUE) is the ONE ReleaseTarget this plan
//     resolves (TASK item 1; 10 §2). UNIQUE enforces at most one plan per target
//     and the Project-leading composite FK below enforces same-Project ownership
//     and non-dangling referential integrity.
//   - `route` (NOT NULL) is the source-defined distribution route union
//     (OWNED_SITE | WECHATSYNC_STAGED_FINALIZE | YXER_NATIVE |
//     SOCIAL_AUTO_UPLOAD_NATIVE | POSTIZ_NATIVE | PAID_MEDIA_SERVICE —
//     domain-types.ts DistributionRoute; 10 §§2–3; 27_AI_CODING_MASTER_PROMPT
//     routes), DB-checked below and narrowed by the Zod boundary. 10 §4 route
//     exclusivity is enforced by the one-plan-per-target UNIQUE index: a target
//     cannot carry two competing routes.
//   - `draft_stager_id` / `finalizer_id` (nullable) are the optional opaque
//     stager/finalizer identifiers (10 §2 draftStager/finalizer). The
//     stager/finalizer catalogue is a later gated task, so no enum or connector
//     reference is invented here — they mirror the accepted ReleaseTarget
//     opaque `platform` column. NULL = the chosen route needs no stager/finalizer
//     (e.g. OWNED_SITE).
//   - `finalizer_strategy` (nullable) is the optional source-defined finalizer
//     strategy union (OFFICIAL_API | IN_PAGE_WEB_API | SERVICE_CLI | FIXED_DOM —
//     domain-types.ts FinalizerStrategy; 10 §2 finalizerStrategy), DB-checked
//     below (NULL admitted) and narrowed by the Zod boundary. NULL = no
//     finalizer strategy is attached.
//   - `executor_version` (NOT NULL) is the required executor version pinned into
//     the plan (10 §2 / skills/08 "stager/finalizer/executor"); opaque, stored
//     verbatim, no executor catalogue or resolution runs here.
//   - `required_fields_json` / `constraints_snapshot_json` /
//     `verification_policy_json` (NOT NULL) are the required plan documents
//     (TASK item 1 "required fields document, constraints snapshot document,
//     verification policy document"; 10 §2 verificationProfile; skills/08
//     outputs). Each is stored as a JSON text document and validated at the
//     storage boundary by a named CHECK (json_valid on SQLite; the Postgres
//     mirror uses an equivalent jsonb cast); the Zod boundary validates the
//     document shape. No document is decomposed into relational columns — plan
//     data is never encoded to avoid a join.
//   - `fallback_route` (nullable) is the optional source-defined fallback route
//     (domain-types.ts DistributionRoute; 10 "fallback policy"), DB-checked
//     below (NULL admitted) and narrowed by the Zod boundary. NULL = no fallback.
//     This slice only records the value: "fallback前必须reconcile" is execution
//     behavior that is out of scope.
//   - `plan_hash` (NOT NULL) is the required opaque plan hash stored verbatim
//     (TASK item 1). Plain non-unique column: no hash matching/dedup/immutability
//     enforcement rule is invented here (the executed-hash-equals-approved-hash
//     CAS is execution behavior, TASK item 4).
//   - `created_at` (NOT NULL) is the append-only creation timestamp and the ONLY
//     audit column: the resolved plan is immutable, so there is no `updated_at`
//     (TASK item 3). A changed route/strategy/policy requires a new plan, not a
//     mutated row; no mutable plan-editing behavior exists.
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) with
// ON DELETE CASCADE (the established Project-scoping FK every Search Growth row
// carries). Same-Project ReleaseTarget ownership is database-enforced by the
// Project-leading composite FK
//   (project_id, release_target_id) -> release_targets(project_id, id)
// carrying this row's own project_id as its leading column, so the DB (not
// application convention) rejects a plan whose target belongs to another Project
// (in either direction) and rejects a dangling target. It is ON DELETE CASCADE:
// deleting a ReleaseTarget removes its plan, so a plan can never dangle. The
// separate single-column release_target_id UNIQUE index enforces the one-plan-
// per-target rule. The parent (project_id, id) target is the accepted
// `release_targets_project_id_id_idx` (T125, D1 0070 / PG 0048) and is REUSED, so
// this slice adds NO index to any parent (TASK item 2).
//
// IDENTITY / UNIQUENESS: the ONE business uniqueness rule is one plan per
// ReleaseTarget (TASK item 2; 10 §2/§4), enforced by
// `publication_execution_plans_release_target_id_idx`. release_target_id is a
// globally unique primary key on release_targets, so the single-column unique
// index is project-isolated once the same-Project FK holds. No other uniqueness
// rule and no extra lookup index is invented.
// ============================================================================

export const publicationExecutionPlans = sqliteTable(
  "publication_execution_plans",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The ONE ReleaseTarget this fixed plan resolves. The UNIQUE index below
    // enforces at most one plan per target; the composite FK binds it to this
    // row's project and cascades the plan away when the target is deleted.
    releaseTargetId: text("release_target_id").notNull(),
    // The source-defined distribution route union (domain-types.ts
    // DistributionRoute; 10 §§2–3). DB text-enum column + the named CHECK below;
    // the Zod boundary validates the same list. This slice records the route
    // only — no route resolution/execution is implemented (TASK item 3).
    route: text("route", {
      enum: [
        "OWNED_SITE",
        "WECHATSYNC_STAGED_FINALIZE",
        "YXER_NATIVE",
        "SOCIAL_AUTO_UPLOAD_NATIVE",
        "POSTIZ_NATIVE",
        "PAID_MEDIA_SERVICE",
      ],
    }).notNull(),
    // Optional opaque draft-stager identifier (10 §2 draftStager); NULL = no
    // stager for the chosen route. The stager/connector catalogue is a later
    // gated task, so no enum is invented here.
    draftStagerId: text("draft_stager_id"),
    // Optional opaque finalizer identifier (10 §2 finalizer); NULL = no finalizer.
    finalizerId: text("finalizer_id"),
    // Optional source-defined finalizer strategy union (domain-types.ts
    // FinalizerStrategy; 10 §2), DB-checked below (NULL admitted) and narrowed by
    // the Zod boundary.
    finalizerStrategy: text("finalizer_strategy", {
      enum: ["OFFICIAL_API", "IN_PAGE_WEB_API", "SERVICE_CLI", "FIXED_DOM"],
    }),
    // Required opaque executor version pinned into the plan (10 §2; skills/08);
    // stored verbatim, no executor resolution/hashing runs in this slice.
    executorVersion: text("executor_version").notNull(),
    // Required plan documents (TASK item 1), each a JSON text document validated
    // at the storage boundary by the named CHECK below and shape-validated at the
    // Zod boundary. Never decomposed into a relational model.
    requiredFieldsJson: text("required_fields_json").notNull(),
    constraintsSnapshotJson: text("constraints_snapshot_json").notNull(),
    verificationPolicyJson: text("verification_policy_json").notNull(),
    // Optional source-defined fallback route (domain-types.ts DistributionRoute;
    // 10 "fallback policy"), DB-checked below (NULL admitted) and narrowed by the
    // Zod boundary. NULL = no fallback. Fallback reconciliation is execution
    // behavior and is out of scope.
    fallbackRoute: text("fallback_route", {
      enum: [
        "OWNED_SITE",
        "WECHATSYNC_STAGED_FINALIZE",
        "YXER_NATIVE",
        "SOCIAL_AUTO_UPLOAD_NATIVE",
        "POSTIZ_NATIVE",
        "PAID_MEDIA_SERVICE",
      ],
    }),
    // Required opaque plan hash stored verbatim. Plain non-unique column: no hash
    // matching/dedup/enforcement rule is invented in this slice.
    planHash: text("plan_hash").notNull(),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column: an immutable plan row has no updated_at and carries no mutable
    // execution/approval/account/public-success state (TASK item 3).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ReleaseTarget. Deleting a target removes
    // its plan (the referenced (project_id, id) pair is unique via the accepted
    // `release_targets_project_id_id_idx` from T125 — reused, not recreated). A
    // plan whose target lives on another Project has no matching parent row and
    // is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.releaseTargetId],
      foreignColumns: [releaseTargets.projectId, releaseTargets.id],
    }).onDelete("cascade"),
    // One plan per ReleaseTarget (TASK item 2; 10 §2/§4): a duplicate plan for
    // the same target is rejected by the DB. release_target_id is globally unique
    // on release_targets, so the single-column unique index is project-isolated
    // once the same-Project FK holds.
    uniqueIndex("publication_execution_plans_release_target_id_idx").on(
      table.releaseTargetId,
    ),
    // Supporting referential parent target added by the T135 forward migration
    // (0080 D1 / 0058 PG): `publishing_jobs` binds its plan reference with the
    // Project-leading, ReleaseTarget-matched composite FK
    //   (project_id, release_target_id, execution_plan_id)
    //     -> publication_execution_plans(project_id, release_target_id, id)
    // so the DB itself proves a job's chosen plan belongs to the SAME Project AND
    // the SAME ReleaseTarget, not merely the same Project. That FK needs this
    // triple to be unique; `id` is already the PRIMARY KEY and release_target_id
    // is already unique, so this index accepts exactly the existing rows and adds
    // NO business uniqueness (TASK item 2). It is the ONLY index this migration
    // adds to an accepted parent table.
    uniqueIndex(
      "publication_execution_plans_project_id_release_target_id_id_idx",
    ).on(table.projectId, table.releaseTargetId, table.id),
    // DB-level route rejection for the source-defined route union (the TASK
    // requires migration-backed route validation; the Zod boundary enforces the
    // same list at the runtime edge).
    check(
      "publication_execution_plans_route_valid",
      sql`(${table.route} IN ('OWNED_SITE','WECHATSYNC_STAGED_FINALIZE','YXER_NATIVE','SOCIAL_AUTO_UPLOAD_NATIVE','POSTIZ_NATIVE','PAID_MEDIA_SERVICE'))`,
    ),
    // Optional finalizer strategy: NULL or one of the source-defined values.
    check(
      "publication_execution_plans_finalizer_strategy_valid",
      sql`(${table.finalizerStrategy} IS NULL OR ${table.finalizerStrategy} IN ('OFFICIAL_API','IN_PAGE_WEB_API','SERVICE_CLI','FIXED_DOM'))`,
    ),
    // Optional fallback route: NULL or one of the source-defined routes.
    check(
      "publication_execution_plans_fallback_route_valid",
      sql`(${table.fallbackRoute} IS NULL OR ${table.fallbackRoute} IN ('OWNED_SITE','WECHATSYNC_STAGED_FINALIZE','YXER_NATIVE','SOCIAL_AUTO_UPLOAD_NATIVE','POSTIZ_NATIVE','PAID_MEDIA_SERVICE'))`,
    ),
    // Plan-document validity at the storage boundary (TASK item 3): malformed
    // JSON is rejected. The Postgres mirror uses an equivalent jsonb-cast CHECK
    // with the same name (schema-parity compares check names).
    check(
      "publication_execution_plans_required_fields_valid",
      sql`json_valid(${table.requiredFieldsJson})`,
    ),
    check(
      "publication_execution_plans_constraints_snapshot_valid",
      sql`json_valid(${table.constraintsSnapshotJson})`,
    ),
    check(
      "publication_execution_plans_verification_policy_valid",
      sql`json_valid(${table.verificationPolicyJson})`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped PlatformDraft evidence.
//
// ONE PlatformDraft is the credential-free record that an approved release
// target was staged as a DRAFT on a platform and (optionally) that the draft
// itself was verified. It is the persistence/contract slice of the Wechatsync
// draft stager (05_DOMAIN_DATA_MODEL.md §12 PlatformDraft;
// 11_WECHATSYNC_DRAFT_STAGER_SPEC.md §§5–10; 13_PUBLISH_FINALIZER_SPEC.md;
// 10_DISTRIBUTION_ARCHITECTURE.md §§3–9 route WECHATSYNC_STAGED_FINALIZE;
// 21_TEST_ACCEPTANCE_PLAN.md §15 "DRAFT_CREATED/DRAFT_VERIFIED 不算 Public 成功";
// legacy reference artifacts `schemas/domain-types.ts` PlatformDraft and
// `schemas/migrations-reference.sql` platform_drafts). This slice records
// evidence only: it does not stage, verify, finalize, publish, spend, contact an
// external system, select/reconcile a route, or implement any
// credential/account/connector behavior (TASK items 1, 3–5).
//
// FIELD RECONCILIATION (TASK item 1 direct field list; the legacy read-only
// reference artifacts above):
//   - `id` (PK) is the stable draft-record id.
//   - `project_id` (NOT NULL) is the explicit Project ownership column, so
//     ownership is never inferred and the Project FK + same-Project composite FK
//     below can be enforced.
//   - `release_target_id` (NOT NULL) is the ONE ReleaseTarget this staged draft
//     belongs to; bound to this row's project by the composite FK below.
//   - `platform` is the required opaque platform identifier stored verbatim. The
//     platform/connector catalogue is a separate gated task, so no platform enum
//     is invented here (mirrors the accepted opaque ReleaseTarget `platform`).
//   - `account_id` / `draft_id` are required OPAQUE external identities (the
//     platform account and the platform's own draft identity). They are opaque
//     stored strings ONLY: no publisher connection, credential, certification or
//     account-management row is referenced or created (TASK item 4).
//   - `draft_url` is the optional draft URL stored verbatim; NULL = the stager
//     returned none. It is a DRAFT url, never a public-success URL (10 §8).
//   - `content_hash` is the required opaque staged-content hash stored verbatim.
//   - `asset_hashes_json` (NOT NULL) is the staged asset-hash DOCUMENT stored as
//     validated JSON text (the accepted JSON-column convention,
//     20_DATABASE_SCHEMA_GUIDE.md §6). The DB CHECK below rejects malformed JSON
//     and the Zod boundary validates its shape (a JSON array of hash strings;
//     legacy `assetHashes: string[]`). It is never decomposed into relational
//     columns and no hash matching/dedup rule is invented.
//   - `stager_id` / `stager_version` are required OPAQUE stager identity/version
//     strings (11 §7 `stager_id`/`stager_version`), stored verbatim. No stager
//     catalogue/connector reference is invented (TASK item 4).
//   - `verified_at` is the optional DRAFT-verification timestamp (11 §8 draft
//     verification; the nullable legacy `verified_at`). It records that the
//     DRAFT was inspected/verified and explicitly does NOT assert
//     `PUBLIC_VERIFIED`, a final publish, or public success (TASK item 3;
//     11 §1 "草稿不是 Public Success"; 21 §15). NULL = not yet draft-verified.
//   - `created_at` is the append-only creation timestamp (the ONLY audit
//     column; legacy `created_at`). There is no `updated_at` and no mutable
//     lifecycle/status/job/retry/route field (TASK item 3).
//
// The source-defined draft identity rule is preserved: the UNIQUE index
// `platform_drafts_platform_account_id_draft_id_idx` enforces
// (platform, account_id, draft_id) uniqueness (legacy
// `idx_platform_draft ON platform_drafts(platform, account_id, draft_id)`), so
// the same platform account can never record the same external draft twice
// (11 §9 idempotency: remote identity is persisted once). No other uniqueness or
// lookup index is invented.
//
// This table carries no `PUBLIC_VERIFIED`/receipt/job column, no route
// selection, no finalize action and no credential/account mutation. The exported
// `PlatformDraft` row type is the domain shape later draft-staging/finalizing
// tasks will consume; `platformDraftSchema` is the runtime guard for the same
// direct fields.

export const platformDrafts = sqliteTable(
  "platform_drafts",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The ONE ReleaseTarget this staged draft belongs to. Bound to this row's
    // project by the composite FK below, which cascades the draft record away
    // when the target is deleted.
    releaseTargetId: text("release_target_id").notNull(),
    // Required opaque platform identifier stored verbatim; no platform enum is
    // invented in this core slice (TASK item 4).
    platform: text("platform").notNull(),
    // Required OPAQUE external account identity (11 §7 account_id). Stored only;
    // no credential/account-management row is referenced (TASK item 4).
    accountId: text("account_id").notNull(),
    // Required OPAQUE platform draft identity (11 §7 external_draft_id; the
    // reliable id the same-draft finalizer will need). Stored only.
    draftId: text("draft_id").notNull(),
    // Optional draft URL stored verbatim; NULL = none returned. Never a
    // public-success URL (TASK items 1, 3).
    draftUrl: text("draft_url"),
    // Required opaque staged-content hash stored verbatim; plain non-unique
    // column, no hash matching/dedup rule is invented.
    contentHash: text("content_hash").notNull(),
    // Required staged asset-hash document as validated JSON text; never
    // decomposed into a relational model.
    assetHashesJson: text("asset_hashes_json").notNull(),
    // Required OPAQUE stager identity/version (11 §7 stager_id/stager_version)
    // stored verbatim; no stager catalogue/connector reference is invented.
    stagerId: text("stager_id").notNull(),
    stagerVersion: text("stager_version").notNull(),
    // Optional DRAFT-verification timestamp; NULL = not draft-verified. Records
    // draft inspection only and never asserts PUBLIC_VERIFIED (TASK item 3).
    verifiedAt: text("verified_at"),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column: an immutable draft record has no updated_at and carries no mutable
    // lifecycle/status/job/retry/route state (TASK item 3).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ReleaseTarget. Deleting a target removes
    // its draft records (the referenced (project_id, id) pair is unique via the
    // accepted `release_targets_project_id_id_idx` from T125 — reused, not
    // recreated). A draft whose target lives on another Project has no matching
    // parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.releaseTargetId],
      foreignColumns: [releaseTargets.projectId, releaseTargets.id],
    }).onDelete("cascade"),
    // The source-defined draft identity rule (legacy idx_platform_draft): one
    // (platform, account_id, draft_id) triple names exactly one staged draft.
    uniqueIndex("platform_drafts_platform_account_id_draft_id_idx").on(
      table.platform,
      table.accountId,
      table.draftId,
    ),
    // Asset-hash document validity at the storage boundary (TASK item 3):
    // malformed JSON is rejected. The Postgres mirror uses an equivalent
    // jsonb-cast CHECK with the same name (schema-parity compares check names).
    check(
      "platform_drafts_asset_hashes_valid",
      sql`json_valid(${table.assetHashesJson})`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped PublishingJob persistence core
// (credential-free).
//
// ONE PublishingJob is the persisted, Project-scoped record that binds ONE
// accepted ReleaseTarget and its fixed PublicationExecutionPlan to an opaque
// executor identity and the source-defined publishing lifecycle status, plus the
// retry/idempotency and optional lease/external/error bookkeeping the later
// orchestration workflow will read (05_DOMAIN_DATA_MODEL.md §12 PublishingJob;
// 18_WORKFLOW_STATE_MACHINES.md §2 "PUBLIC ReleaseTarget" and §5 "Local Job
// Lease"; 10_DISTRIBUTION_ARCHITECTURE.md §§2–7; 20_DATABASE_SCHEMA_GUIDE.md §4
// "job idempotency key"; legacy read-only reference artifacts
// `schemas/domain-types.ts` PublishingJobStatus and
// `schemas/migrations-reference.sql` `publishing_jobs`).
//
// This is the persistence + domain-contract storage slice ONLY. A stored row is
// a record — never a claim, lease grant, state transition, retry schedule,
// cancellation, execution, publish, receipt or success proof. It implements NO
// claim/lease renewal, CAS/state transition, retry/backoff scheduling,
// concurrency control, cancellation, kill-switch enforcement or job execution
// behavior, and NO external system, connector, credential/account, bridge,
// provider, browser, paid action, production action or UI (TASK items 3–5). The
// lease columns are recorded storage only.
//
// FIELD RECONCILIATION (TASK item 1 direct field list is authoritative; the
// legacy read-only reference table supplies the column shapes):
//   - `id` (PK) is the stable job id.
//   - `project_id` (NOT NULL) is the explicit Project ownership column and the
//     leading column of every composite FK below, so ownership is never inferred
//     and Project/target/plan integrity is database-enforced.
//   - `release_target_id` (NOT NULL) is the ONE ReleaseTarget this job executes.
//   - `execution_plan_id` (NOT NULL) is the fixed PublicationExecutionPlan chosen
//     for that target. The composite FK below proves the plan belongs to the SAME
//     Project AND the SAME ReleaseTarget as the job (not merely the same
//     Project), so a plan for another target of the same Project is rejected by
//     the DB (TASK item 2).
//   - `executor_id` / `executor_version` are the required OPAQUE executor
//     identity/version strings (18 §5; legacy `executor_id`/`executor_version`),
//     stored verbatim. No executor registry/catalogue or resolution runs here,
//     so they are deliberately NOT foreign keys (TASK item 3).
//   - `status` is exactly the source-defined publishing-job status union
//     PublishingJobStatus (PLANNED … CANCELLED — schemas/domain-types.ts and
//     `schemas/state-machines.json` publicPublishingJob; 18 §2). DB text-enum
//     column + the named CHECK below; the Zod boundary validates the same 23
//     values. This slice records the CURRENT value only — no transition, CAS or
//     lifecycle logic exists (TASK item 3). The §5 Local Bridge QUEUED/LEASED/
//     RUNNING lease machine is a separate runtime concept that is out of scope,
//     so it is NOT merged into this authoritative row-status enum.
//   - `attempts` (NOT NULL, default 0) / `max_attempts` (NOT NULL) are the
//     source-defined retry counters (legacy shapes). Safe numeric boundaries are
//     enforced at BOTH trust boundaries (TASK item 3): the named DB CHECK and the
//     Zod refinement require `attempts >= 0`, `max_attempts >= 1` and
//     `attempts <= max_attempts`. No retry scheduling or incrementing runs here.
//   - `idempotency_key` (NOT NULL) preserves the source-defined job idempotency
//     identity (20 §4 "job idempotency key"; legacy `UNIQUE`). The unique index
//     below rejects a duplicate key at the storage boundary. This slice defines
//     no retry/replay behavior around the key.
//   - `leased_by` / `lease_expires_at` (nullable) are the optional lease holder
//     and expiry (18 §5). NULL = no lease recorded. Storage only: no claim, lease
//     grant/renewal or expiry enforcement is implemented (TASK item 3).
//   - `external_draft_id` / `external_task_id` / `external_content_id` (nullable)
//     are OPAQUE recorded external identifiers, stored verbatim. They are NOT
//     foreign keys and are NOT a receipt or a remote-action proof (TASK item 4).
//   - `public_url` (nullable) is an OPAQUE recorded URL, stored verbatim. Its
//     presence does NOT assert `PUBLIC_VERIFIED`, a publication receipt, a real
//     remote action or a production result — public verification is a separate
//     later task (TASK item 4). There is deliberately no receipt/verification
//     column and no `PUBLIC_VERIFIED`-implying constraint.
//   - `last_error_code` / `last_error_message_safe` (nullable) are the optional
//     SAFE error code/message (legacy shapes); NULL = no error recorded. Opaque
//     text, stored verbatim; this slice defines no error taxonomy and no retry
//     decision from them.
//   - `created_at` / `updated_at` (NOT NULL) are the creation and update
//     timestamps, defaulted to insert time. Unlike the immutable evidence tables,
//     a job is intentionally mutable bookkeeping, so it carries a real
//     `updated_at` (TASK item 1); no CAS/version column is added (TASK item 3).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) with
// ON DELETE CASCADE (the established Project-scoping FK every Search Growth row
// carries). Same-Project ReleaseTarget ownership is database-enforced by the
// Project-leading composite FK
//   (project_id, release_target_id) -> release_targets(project_id, id),
// reusing the accepted `release_targets_project_id_id_idx` (T125) as its parent
// target. The plan reference is database-enforced by the Project-leading,
// ReleaseTarget-matched composite FK
//   (project_id, release_target_id, execution_plan_id)
//     -> publication_execution_plans(project_id, release_target_id, id),
// whose parent target
// `publication_execution_plans_project_id_release_target_id_id_idx` is added by
// this forward migration (TASK item 2). Both cascades: deleting the target, the
// plan or the whole Project removes its jobs, so a job can never dangle. The
// delete behavior is CASCADE throughout (no `no action`/SET NULL is invented).
//
// IDENTITY / UNIQUENESS: the only business uniqueness rule is the source-defined
// idempotency key (TASK item 3), enforced by
// `publishing_jobs_idempotency_key_idx`; no other uniqueness is invented.
// ============================================================================

export const publishingJobs = sqliteTable(
  "publishing_jobs",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The ONE ReleaseTarget this job executes. Bound to this row's project by the
    // composite FK below (cascades the job away when the target is deleted).
    releaseTargetId: text("release_target_id").notNull(),
    // The fixed PublicationExecutionPlan chosen for that target. Bound to this
    // row's project AND to the same ReleaseTarget by the composite FK below; a
    // plan for another target of the same project has no matching parent row.
    executionPlanId: text("execution_plan_id").notNull(),
    // Required OPAQUE executor identity/version stored verbatim; no executor
    // registry/catalogue reference is invented (TASK item 3).
    executorId: text("executor_id").notNull(),
    executorVersion: text("executor_version").notNull(),
    // The exact source-defined PublishingJobStatus union (schemas/domain-types.ts;
    // state-machines.json publicPublishingJob; 18 §2). DB text-enum column + the
    // named CHECK below; the Zod boundary validates the same 23 values. Records
    // the current value only — no transition/CAS is implemented (TASK item 3).
    status: text("status", {
      enum: [
        "PLANNED",
        "PREFLIGHT",
        "EXECUTION_READY",
        "STAGING_DRAFT",
        "DRAFT_CREATED",
        "DRAFT_VERIFIED",
        "FINALIZE_READY",
        "FINALIZING",
        "VALIDATING",
        "DRY_RUN_PASSED",
        "SUBMITTING",
        "ACCEPTED_REMOTE_TASK",
        "PUBLISH_SUBMITTED",
        "PUBLIC_VERIFYING",
        "PUBLIC_VERIFIED",
        "AUTH_REQUIRED",
        "PUBLISH_FIELDS_REQUIRED",
        "RATE_LIMITED",
        "REMOTE_STATE_UNKNOWN",
        "REJECTED",
        "EXECUTION_FAILED",
        "VERIFY_FAILED",
        "CANCELLED",
      ],
    }).notNull(),
    // Retry counters. Safe numeric bounds are DB-checked below and refined at the
    // Zod boundary; no retry scheduling/incrementing runs in this slice.
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    // Source-defined job idempotency identity (20 §4); the unique index below
    // rejects a duplicate. No replay/retry behavior is defined here.
    idempotencyKey: text("idempotency_key").notNull(),
    // Optional lease holder / expiry (18 §5); NULL = no lease recorded. Storage
    // only — no claim, lease renewal or expiry enforcement exists (TASK item 3).
    leasedBy: text("leased_by"),
    leaseExpiresAt: text("lease_expires_at"),
    // Optional OPAQUE recorded external identifiers; not FKs, not receipts, not
    // remote-action proofs (TASK item 4).
    externalDraftId: text("external_draft_id"),
    externalTaskId: text("external_task_id"),
    externalContentId: text("external_content_id"),
    // Optional OPAQUE recorded public URL. Its presence never asserts
    // PUBLIC_VERIFIED or a publication result (TASK item 4).
    publicUrl: text("public_url"),
    // Optional SAFE error code/message; NULL = no error recorded. Opaque, no
    // error taxonomy and no retry decision (TASK item 3).
    lastErrorCode: text("last_error_code"),
    lastErrorMessageSafe: text("last_error_message_safe"),
    // Creation and update timestamps (system time), defaulted on insert. A job is
    // intentionally mutable bookkeeping, so it carries a real updated_at; no
    // CAS/version column is added (TASK item 3).
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Same-Project composite FK to the ReleaseTarget. Deleting a target removes
    // its jobs (the referenced (project_id, id) pair is unique via the accepted
    // `release_targets_project_id_id_idx` from T125 — reused, not recreated). A
    // job whose target lives on another Project has no matching parent row.
    foreignKey({
      columns: [table.projectId, table.releaseTargetId],
      foreignColumns: [releaseTargets.projectId, releaseTargets.id],
    }).onDelete("cascade"),
    // Same-Project AND same-ReleaseTarget composite FK to the chosen execution
    // plan. The referenced (project_id, release_target_id, id) triple is unique
    // via `publication_execution_plans_project_id_release_target_id_id_idx`,
    // added by this forward migration. A plan whose Project OR ReleaseTarget
    // differs from the job's has no matching parent row and is rejected by the
    // DB (TASK item 2). Deleting the plan removes its jobs.
    foreignKey({
      columns: [table.projectId, table.releaseTargetId, table.executionPlanId],
      foreignColumns: [
        publicationExecutionPlans.projectId,
        publicationExecutionPlans.releaseTargetId,
        publicationExecutionPlans.id,
      ],
    }).onDelete("cascade"),
    // Source-defined job idempotency identity: one idempotency key names exactly
    // one job (TASK item 3; 20 §4). A duplicate key is rejected by the DB.
    uniqueIndex("publishing_jobs_idempotency_key_idx").on(table.idempotencyKey),
    // DB-level enum rejection for the source-defined PublishingJobStatus union
    // (TASK item 3). PostgreSQL uses the same check name/expression
    // (schema-parity compares check names).
    check(
      "publishing_jobs_status_valid",
      sql`(${table.status} IN ('PLANNED','PREFLIGHT','EXECUTION_READY','STAGING_DRAFT','DRAFT_CREATED','DRAFT_VERIFIED','FINALIZE_READY','FINALIZING','VALIDATING','DRY_RUN_PASSED','SUBMITTING','ACCEPTED_REMOTE_TASK','PUBLISH_SUBMITTED','PUBLIC_VERIFYING','PUBLIC_VERIFIED','AUTH_REQUIRED','PUBLISH_FIELDS_REQUIRED','RATE_LIMITED','REMOTE_STATE_UNKNOWN','REJECTED','EXECUTION_FAILED','VERIFY_FAILED','CANCELLED'))`,
    ),
    // Safe numeric attempt boundaries at the storage boundary (TASK item 3):
    // non-negative attempts, at least one allowed attempt, and attempts never
    // exceed the maximum. The Zod boundary refines the same invariant.
    check(
      "publishing_jobs_attempts_valid",
      sql`(${table.attempts} >= 0 AND ${table.maxAttempts} >= 1 AND ${table.attempts} <= ${table.maxAttempts})`,
    ),
  ],
);
