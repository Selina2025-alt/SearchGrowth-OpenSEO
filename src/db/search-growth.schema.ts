/* eslint-disable max-lines -- the SQLite Search Growth schema barrel holds every V1.0 table (market profiles through the accepted T108 geo_citations, T109 search_growth_opportunities and T110 source_refs additions); the accepted additions put the counted non-comment lines just past the cap, and splitting the barrel would ripple across the schema-parity/import seam */
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
// earlier tasks — this task adds no supporting target index. Deleting a Topic,
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
// row carries). source_refs has no other parent in the accepted schema yet (the
// claims and content tables arrive in later tasks and reference source refs by
// id), so Project ownership is the row's only relationship. Deleting a whole
// Project cascades its source references away, so a source reference can never
// dangle.
//
// NO BUSINESS UNIQUENESS: neither §9, the legacy reference type nor the legacy
// migration reference defines an identity/uniqueness rule for source refs (the
// same source ref can be shared by many Claim/ContentVersion rows), so no
// business-unique index is added. The single non-unique index below serves the
// project -> source-refs read path and the project-delete cascade path only.
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
    // Project -> source-refs reads and the project-delete cascade path.
    index("source_refs_project_idx").on(table.projectId),
  ],
);
