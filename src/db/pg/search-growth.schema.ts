/* eslint-disable max-lines -- the Postgres Search Growth schema mirror carries every V1.0 table (market profiles through the accepted T108 geo_citations plus the T109 search_growth_opportunities, T110 source_refs, T111 claims/claim_source_refs, T112 claim_allowed_market_profiles, T113 claim_allowed_languages, T114 media_assets, T115 published_media_refs, T117 content_packages, T118 content_package_versions, T119 content_package_version_claims, T120 content_package_version_source_refs, T121 content_package_version_media_assets, T122 content_variants, T123 content_variant_media_assets, T124 release_bundles, T125 release_targets, T126 search_growth_audit_events, T127 runtime_controls, T128 indexing_observations, T129 experiments, T130 experiment_snapshots and T131 search_growth_targets additions, plus the T132 search_growth_target_preferred_market_profiles relation and the T133 publication_execution_plans plan core); the counted non-comment lines sit just past the cap, and splitting the mirror would ripple across the schema-parity/import seam */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects, savedKeywords } from "./app.schema";

// Timestamps are stored as *text* (same column shape as the SQLite schema);
// see the note in pg/app.schema.ts. `isoNow` matches `new Date().toISOString()`
// so DB-defaulted and app-written values sort together lexicographically.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// ============================================================================
// Search Growth V1.0 — Postgres mirror of ../search-growth.schema.ts. Keep the
// two files structurally identical; `schema-parity.test.ts` fails on drift.
// ============================================================================

export const searchMarketProfiles = pgTable(
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
    isPrimary: boolean("is_primary").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `search_topics` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
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

export const searchTopics = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `search_topic_keyword_refs` table
// in ../search-growth.schema.ts (keep the two files structurally identical).
//
// A topic maps to existing OpenSEO saved keywords WITHOUT copying keyword text,
// market fields, ranks, tags or any other keyword entity: each row stores only
// the canonical saved_keywords.id reference. Same-project integrity is enforced
// by two composite foreign keys that carry the mapping row's own project_id as
// their leading column ((project_id, topic_id) -> search_topics(project_id, id)
// and (project_id, open_seo_keyword_ref) -> saved_keywords(project_id, id)), so
// the DB rejects a topic and a saved keyword that belong to different projects.
// One mapping per (topic_id, open_seo_keyword_ref) is the V1.0 uniqueness rule;
// deleting a topic, saved keyword, or whole project cascades to the mapping.
// ============================================================================

export const searchTopicKeywordRefs = pgTable(
  "search_topic_keyword_refs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    topicId: text("topic_id").notNull(),
    openSeoKeywordRef: text("open_seo_keyword_ref").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
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
    // keyword -> topic reads (the unique index above already leads with topic_id).
    index("search_topic_keyword_refs_keyword_idx").on(table.openSeoKeywordRef),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `tracked_entities` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
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

export const trackedEntities = pgTable(
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
    active: boolean("active").notNull().default(true),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `entity_aliases` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
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

export const entityAliases = pgTable(
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
    caseSensitive: boolean("case_sensitive").notNull().default(false),
    // Storage-only integer precedence hint for later alias matching
    // (05_DOMAIN_DATA_MODEL.md §4 EntityAlias). 0 is the neutral default; no
    // ranking or matching behavior is implemented here.
    priority: integer("priority").notNull().default(0),
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `search_prompts` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
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

export const searchPrompts = pgTable(
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
    active: boolean("active").notNull().default(true),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the topic: the prompt's project_id must equal
    // the topic's project_id. Deleting a topic removes its prompts (the
    // referenced (project_id, id) pair is unique via the supporting
    // search_topics_project_id_id_idx index created in 0024).
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
// Search Growth V1.0 — Postgres mirror of the `geo_observation_runs` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
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
//   - Raw payloads are captured as raw text columns only: `raw_answer`, `raw_response`
//     and `usage_json`. The design-reference `raw_citations_json` and
//     `raw_response_ref` are NOT separate columns (citations stay inside the raw
//     response payload; the later Parse task extracts them; V1.0 has no external
//     raw-response store). No relationship is encoded in JSON.
//   - The reference/domain-types contextual fields `topic_id`, `country`,
//     `language` and `observed_at` are NOT shipped (see the SQLite mirror for
//     the full reconciliation). `created_at` is the append-only creation
//     timestamp the task requires.
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
//     search_market_profiles(project_id, id) keeps it same-Project.
//   - DELETE BEHAVIOR (no dangling run references): deleting a Prompt, a market
//     profile, or a whole Project cascades the run away. Cascade matches the
//     accepted tree-wide teardown convention.
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

export const geoObservationRuns = pgTable(
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
    webSearch: boolean("web_search"),
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
    applicationCacheBypassed: boolean("application_cache_bypassed").notNull(),
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
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `geo_observation_parses` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
//
// A geo observation parse is the immutable, versioned record of ONE parser run
// over an already stored raw geo_observation_run (05_DOMAIN_DATA_MODEL.md §7,
// ADR-005). A parser upgrade creates another row for the same run — v1/v2
// coexist and each row snapshots its parser version. Storage/contract only: no
// parser, reparse workflow, current-pointer selection, metrics, entity/citation
// extraction, recommendation logic or provider action is implemented here.
//
// FIELD RECONCILIATION (§7 is the direct field contract; see the SQLite mirror
// for the full reconciliation):
//   - §7 field list shipped verbatim: id, run_id, parser_version,
//     parse_status, accuracy_status, parsed_at, is_current, plus the append-only
//     `created_at` system timestamp.
//   - `project_id` is the explicit Project ownership key added by the
//     PO-approved Round 2 data-contract recovery (TASK T107 Round 2): it lets
//     the DB itself enforce that a Parse belongs to the same Project as its Run
//     (composite FK below) and that a GeoEntityMention is Project-consistent
//     with its Parse/Entity. It is an ownership fact on an already-append-only
//     row — no mutation/current-pointer/reparse behavior is enabled.
//   - `parser_version` is TEXT; `parse_status` is SUCCESS | PARTIAL | FAILED;
//     optional `accuracy_status` is ACCURATE | PARTIAL | INACCURATE | UNKNOWN;
//     `is_current` is a required boolean with documented storage default false.
//   - parser_model, recommendation, recommendation_confidence and parsed_json
//     are NOT shipped, and no entity/citation/relationship data is encoded in
//     JSON/text (later normalized GeoEntityMention/GeoCitation tasks own that).
//
// APPEND-ONLY SHAPE: no `updated_at`, no update/delete API, no repository/
// service and no mutation surface — immutability is by schema/contract shape,
// not a DB trigger (21_TEST_ACCEPTANCE_PLAN.md §6).
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE (the established Project-scoping FK). run_id references the
// immutable geo_observation_runs(id); the SAME-PROJECT composite FK
// (project_id, run_id) -> geo_observation_runs(project_id, id) carries this
// row's project_id as its leading column, so a parse on project A can never be
// attached to a run on project B. Deleting a run (or, through the run's own
// Project/Prompt cascade, a whole project/prompt) CASCADES its parses away. The
// `(run_id, parser_version)` unique index is the SOLE version-identity rule:
// it permits v1/v2 coexistence and rejects a duplicate parser version per run.
// The `geo_observation_parses_project_id_id_idx` unique index on (project_id,
// id) exists ONLY as the required unique target of the geo_entity_mentions
// composite FK; it adds no business uniqueness (id is already the PK). No
// global or current-pointer uniqueness rule exists.
// ============================================================================

export const geoObservationParses = pgTable(
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
    // Parse outcome (SUCCESS | PARTIAL | FAILED). DB text-enum column; the Zod
    // boundary rejects unsupported/case-mismatched/empty values at runtime.
    parseStatus: text("parse_status", {
      enum: ["SUCCESS", "PARTIAL", "FAILED"],
    }).notNull(),
    // Optional accuracy assessment (ACCURATE | PARTIAL | INACCURATE | UNKNOWN).
    // DB text-enum column; NULL means no accuracy assessment was made.
    accuracyStatus: text("accuracy_status", {
      enum: ["ACCURATE", "PARTIAL", "INACCURATE", "UNKNOWN"],
    }),
    // The application-supplied moment this parse was produced (§7). Distinct
    // from the append-only system `created_at` insert timestamp below.
    parsedAt: text("parsed_at").notNull(),
    // Current-marker fact/default only (documented storage default false).
    // Required typed boolean; selecting/switching the pointer is later workflow
    // logic and is NOT implemented here.
    isCurrent: boolean("is_current").notNull().default(false),
    // Append-only creation timestamp (system insert time). No updated_at column
    // exists — the row is immutable once written.
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `geo_entity_mentions` table in
// ../search-growth.schema.ts (keep the two files structurally identical).
//
// A geo entity mention is one normalized mention/recommendation fact extracted
// from a specific versioned parse (05_DOMAIN_DATA_MODEL.md §7 GeoEntityMention,
// ADR-004/ADR-005). Storage and contract only — no parsing, extraction,
// matching, scoring, reparse/current-pointer workflow, CRUD or provider action.
// See the SQLite mirror for the full field reconciliation; the direct §7 field
// list is shipped with only the additions the established schema convention
// requires (stable `id` PK and the append-only `created_at` system timestamp)
// and the explicit `project_id` ownership key the PO-approved Round 2 data-
// contract recovery adds so the DB itself can enforce same-Project integrity.
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE (the established Project-scoping FK). `parse_id` references
// the immutable `geo_observation_parses(id)` row this mention was computed from
// and `entity_id` references `tracked_entities(id)` (ADR-004). Two SAME-PROJECT
// composite FKs lead with the row's project_id —
// (project_id, parse_id) -> geo_observation_parses(project_id, id) and
// (project_id, entity_id) -> tracked_entities(project_id, id) — so the DB (not
// application convention) rejects a mention whose Parse and TrackedEntity
// belong to different Projects, or whose own project_id does not match either.
// Parse-version isolation is structural — mentions attach to the concrete
// source Parse, never to a mutable current pointer. Deleting a parse, an
// entity, or (through the Project/parse/run cascade) a whole project can never
// leave a dangling mention. No business-unique index exists; the two non-unique
// indexes serve the parse -> mentions / entity -> mentions read and cascade
// paths.
// ============================================================================

export const geoEntityMentions = pgTable(
  "geo_entity_mentions",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable, versioned parse this mention was computed from
    // (geo_observation_parses.id, ADR-005). Bound to the row's project by the
    // composite FK below, which cascades mentions away when the parse (or,
    // through the run/parse cascade, a whole project) is deleted.
    parseId: text("parse_id").notNull(),
    // The tracked entity this mention is about (tracked_entities.id, ADR-004).
    // Bound to the row's project by the composite FK below, which cascades
    // mentions away when the entity is deleted.
    entityId: text("entity_id").notNull(),
    // Required mention verdict boolean; no storage default.
    mentioned: boolean("mentioned").notNull(),
    // Optional recommendation verdict (nullable boolean).
    recommended: boolean("recommended"),
    // Optional mention position in the source answer (nullable integer).
    mentionPosition: integer("mention_position"),
    // Optional nuanced sentiment (nullable free text; §7 `sentiment?`). V1.0
    // defines no sentiment enum/scale — no sentiment enum is invented.
    sentiment: text("sentiment"),
    // Optional evidence-span reference realised as the evidence span's literal
    // text (nullable; domain-types `evidenceText`, migrations-reference
    // `evidence_text`).
    evidenceText: text("evidence_text"),
    // Append-only creation timestamp (system insert time). No updated_at column.
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — normalized geo citations (Postgres mirror).
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
//     duplicated here. The reference/domain-types `run_id` is reconciled as that
//     transitive run binding.
//   - `raw_url` (NOT NULL) is the citation URL exactly as the answer cited it
//     and `normalized_url` (NOT NULL) is its normalized identity key
//     (migrations-reference.sql normalized_url; 07_GEO_MEASUREMENT_SPEC.md §8).
//     No normalization algorithm exists in this slice.
//   - `domain` (NOT NULL) is the citation site domain; `title` (nullable) and
//     `position` (nullable integer) are the optional citation title and ordinal
//     position in the answer. `position` follows §7's direct field name (the
//     reference `citation_position` is a design-artifact rename).
//   - `source_ownership` is exactly the V1.0 CitationOwnership union
//     (OWNED_DOMAIN | CONTROLLED_PUBLICATION | EARNED_THIRD_PARTY | COMPETITOR
//     | UNKNOWN — schemas/domain-types.ts CitationOwnership). DB text-enum
//     column; the Zod boundary in src/types/schemas/geo-citation.ts rejects
//     unsupported/case-mismatched/empty values. No classification logic runs
//     here.
//   - `matched_publication_receipt_id` is the optional publication-receipt
//     relation (§7 `matched_publication_receipt_id?`; migrations-reference.sql
//     declares the same unconstrained nullable column). The publication_receipts
//     table does not exist in the accepted schema yet, so this slice stores the
//     scalar reference exactly as the reference SQL does; the same-Project
//     composite FK is added by that later task's migration alongside the table
//     itself.
//   - The reference-only context fields `source_type` and `safe_url_status` are
//     NOT shipped: the TASK field list names no source-type/safe-URL column.
//
// PROJECT SCOPING / DELETE BEHAVIOR: ownership is EXPLICIT on the row and
// database-enforced — project_id is a NOT NULL FK to projects(id) ON DELETE
// CASCADE, and the SAME-PROJECT composite FK
// (project_id, parse_id) -> geo_observation_parses(project_id, id) rejects a
// citation whose concrete Parse belongs to another Project or whose own
// project_id does not match its Parse. Parse-version isolation is structural:
// citations stay attached to the exact source Parse row (v1 or v2), never to a
// mutable "current" parse pointer. Deleting a Project or a parse cascades the
// citation away, so a citation can never dangle.
//
// NO BUSINESS UNIQUENESS: the migration reference's `(run_id, normalized_url)`
// unique index is intentionally NOT shipped — the TASK forbids business
// uniqueness, and the same URL can legitimately be cited at several positions /
// by several parse versions. The single non-unique index below serves the
// parse -> citations read path and its cascade delete path only.
// ============================================================================

export const geoCitations = pgTable(
  "geo_citations",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable, versioned parse that extracted/reconciled this citation
    // (geo_observation_parses.id, ADR-005). Bound to the row's project by the
    // composite FK below, which cascades citations away when the parse (or,
    // through the run/parse cascade, a whole project) is deleted.
    parseId: text("parse_id").notNull(),
    // The citation URL exactly as cited in the source answer. No normalization
    // is performed in this slice.
    rawUrl: text("raw_url").notNull(),
    // The normalized identity key of the citation URL (later URL-normalization
    // task output).
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
    // CitationOwnership union). No classification logic exists in this slice.
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
    // Append-only creation timestamp (system insert time). No updated_at column.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the concrete parse: the citation's project_id
    // must equal the parse's project_id. Deleting a parse removes its citations
    // (the referenced (project_id, id) pair is unique via the supporting
    // geo_observation_parses_project_id_id_idx unique index above). A citation
    // whose parse lives on another Project has no matching parent row and is
    // rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.parseId],
      foreignColumns: [geoObservationParses.projectId, geoObservationParses.id],
    }).onDelete("cascade"),
    // Parse -> citations reads and the parse-delete cascade path.
    index("geo_citations_parse_idx").on(table.parseId),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `search_growth_opportunities`
// table in ../search-growth.schema.ts (keep the two files structurally
// identical; schema-parity.test.ts fails on drift).
//
// A search growth opportunity is the stored result of the later deterministic
// Opportunity/PageFit services (08_OPPORTUNITY_ENGINE_SPEC.md;
// 05_DOMAIN_DATA_MODEL.md §8 SearchGrowthOpportunity;
// schemas/domain-types.ts SearchGrowthOpportunity). Storage and contract ONLY —
// no opportunity computation, scoring engine, profile/PageFit calculation,
// ranking, recommendation runtime, CRUD, UI or external action is implemented
// here. See the SQLite mirror for the full field reconciliation; the direct §8
// field list is shipped with the required additions (stable `id`, explicit
// `project_id`, `created_at`/`updated_at`) and the required optional
// MarketProfile relation, and the score/data-quality/evidence payloads are
// opaque immutable JSON snapshot columns exactly as the migration reference
// declares them (`score_json`, `data_quality_json`, `evidence_snapshot_json`).
// The reference-only `status` lifecycle column is NOT shipped (no canonical
// union exists in §8/domain-types/the TASK field list; no workflow is
// authorized here).
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE (the established Project-scoping FK). The SAME-PROJECT
// composite FKs below lead with this row's project_id —
// (project_id, topic_id) -> search_topics(project_id, id) and
// (project_id, market_profile_id) -> search_market_profiles(project_id, id) —
// so the DB rejects an opportunity whose Topic or MarketProfile belongs to
// another Project or whose own project_id does not match them. The referenced
// (project_id, id) pairs are unique via the supporting
// `search_topics_project_id_id_idx` / `search_market_profiles_project_id_id_idx`
// target indexes accepted by earlier tasks (no new supporting target index is
// added for those two FKs). The `search_growth_opportunities_project_id_id_idx`
// unique index in the table callback below exists ONLY as the required
// referential target of the T117 content_packages same-Project composite FK
// ((project_id, opportunity_id) -> search_growth_opportunities(project_id, id),
// added below by the T117 0040 migration) — id is already the PK, so the
// composite accepts exactly the rows the PK accepts and adds no business
// uniqueness. Deleting a Topic, a MarketProfile, or a whole Project cascades the
// opportunity away. The two non-unique indexes serve the topic -> opportunities
// and market profile -> opportunities read/cascade paths. No business-rule
// unique index exists (no V1.0 artifact constrains or dedupes opportunities per
// Topic/MarketProfile). The two named CHECK constraints below make the
// canonical OpportunityProfile/PageFitAction enum rejection database-backed in
// both dialects (the Zod boundary enforces the same lists at runtime).
// ============================================================================

export const searchGrowthOpportunities = pgTable(
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
    // The opportunity profile (the exact canonical OpportunityProfile union).
    // DB text-enum column + the named CHECK below; the Zod boundary validates
    // it. No profile computation exists in this slice.
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
    // The page-fit action (the exact canonical PageFitAction union). DB
    // text-enum column + the named CHECK below; the Zod boundary validates it.
    // No PageFit computation exists in this slice.
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
    // action does not target an existing page).
    targetPageUrl: text("target_page_url"),
    // Immutable score snapshot (the whole canonical `scores` object incl. the
    // optional finalScore). Opaque JSON text; never parsed/queried here.
    scoreJson: text("score_json").notNull(),
    // Immutable DataQuality snapshot (status + warnings[] + optional sample
    // counts). Opaque JSON text; the DataQuality status/warning enums are the
    // Zod boundary.
    dataQualityJson: text("data_quality_json").notNull(),
    // Immutable evidence payload snapshot (opaque JSON text).
    evidenceSnapshotJson: text("evidence_snapshot_json").notNull(),
    // The human-readable explanation of why this opportunity exists (§8).
    reason: text("reason").notNull(),
    // The concrete recommended action text (§8).
    recommendedAction: text("recommended_action").notNull(),
    // The application-supplied moment the source-data snapshot was taken
    // (domain-types `sourceSnapshotAt`). Distinct from the system timestamps.
    sourceSnapshotAt: text("source_snapshot_at").notNull(),
    // System insert/update timestamps (mutable lifecycle row).
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the topic: the opportunity's project_id must
    // equal the topic's project_id. Deleting a topic removes its opportunities
    // (the referenced (project_id, id) pair is unique via the supporting
    // search_topics_project_id_id_idx index).
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the optional market profile: when set, the
    // opportunity's project_id must equal the profile's project_id. Deleting a
    // profile removes the opportunities scoped to it (the referenced
    // (project_id, id) pair is unique via the supporting
    // search_market_profiles_project_id_id_idx index). NULL market_profile_id
    // means no profile is attached and the FK is not enforced.
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
    // search_growth_opportunities(project_id, id), added below by the T117 0040
    // migration). id is already the PK, so this composite accepts exactly the
    // rows the PK accepts and adds no business uniqueness.
    uniqueIndex("search_growth_opportunities_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `source_refs` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// A source reference is one captured evidence source behind a later Claim or
// ContentPackageVersion (05_DOMAIN_DATA_MODEL.md §9 SourceRef). Storage and
// contract ONLY — no claim, verification, crawling, URL fetching, content,
// reachability/URL validation, source-content classification or inference, CRUD
// or UI is implemented here. See the SQLite mirror for the full field
// reconciliation; the direct §9 field list is shipped with only the additions
// the established schema convention requires (stable `id` PK, explicit
// `project_id`, append-only `created_at`) and the legacy reference-only
// `title`/`classification`/`url`/`evidence_ref`/`source_kind` fields are
// reconciled OUT (no classification union is invented on the row).
//
// RELATIONSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id)
// ON DELETE CASCADE (the established Project-scoping FK every Search Growth row
// carries). source_refs is also the parent of the claim_source_refs relation
// added in T111 (0035): that relation's same-Project composite FK
// ((project_id, source_ref_id) -> source_refs(project_id, id)) requires the
// supporting composite unique index below. Deleting a whole Project cascades
// its source references away and a source reference can never dangle.
//
// APPEND-ONLY SHAPE: no `updated_at`, no update/delete API, no repository/
// service and no mutation surface — a captured source reference is written once
// and never changed (immutability by schema/contract shape). NO BUSINESS
// UNIQUENESS: no V1.0 artifact defines an identity rule for source refs, so no
// business-unique index exists. The composite unique index below exists ONLY as
// the required referential target of the claim_source_refs same-Project FK
// ((project_id, id) is already unique because id is the PK, so the composite
// adds no business uniqueness). The single non-unique index serves the project
// -> source-refs read/cascade path. The named CHECK below makes the exact V1.0
// SourceRef type-union enum rejection database-backed in both dialects (the Zod
// boundary enforces the same list at runtime).
// ============================================================================

export const sourceRefs = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `claims` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// A claim is one verifiable factual assertion a later ContentPackageVersion or
// content gate will rely on (05_DOMAIN_DATA_MODEL.md §9 Claim;
// 21_TEST_ACCEPTANCE_PLAN.md §10 "UNVERIFIED hard claim -> BLOCKED"). Storage
// and contract ONLY — no verification/reverification, blocking logic, content/
// publication gate, provider call or runtime status transition. See the SQLite
// mirror for the full field reconciliation; the direct §9/TASK field list is
// shipped with only the additions the established schema convention requires
// (stable `id` PK, explicit `project_id`, `created_at`/`updated_at` system
// timestamps for the mutable lifecycle row). The legacy reference-only
// `allowed_markets`/`allowed_languages` JSON lists are never JSON/text on this
// row: each is modeled as a normalized same-Project relation table
// (claim_allowed_market_profiles in T112, claim_allowed_languages in T113); the
// legacy scalar `evidence_type`/`evidence_ref`/`source_url` evidence fields are
// reconciled OUT into the normalized claim_source_refs relation below; the
// legacy `normalized_claim` column is NOT shipped (no normalization in this
// slice).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) ON
// DELETE CASCADE. The composite unique index below exists ONLY as the required
// referential target of the claim_source_refs same-Project FK
// ((project_id, claim_id) -> claims(project_id, id)); id is already the PK, so
// it adds no business uniqueness. NO BUSINESS UNIQUENESS otherwise: no V1.0
// artifact constrains claim_text/status uniqueness per project. The named CHECK
// constraints make the ClaimStatus and Claim classification unions
// database-backed enum rejections in both dialects.
// ============================================================================

export const claims = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `claim_source_refs` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// Each row is ONE normalized, same-Project link between a claim and a source
// reference that backs it (05_DOMAIN_DATA_MODEL.md §9 `source_refs[]`; TASK
// item 2). The row carries no mutable evidence payload — provenance stays on
// the linked source_refs rows. Same-Project integrity is enforced by two
// composite FKs carrying this row's own project_id as their leading column
// ((project_id, claim_id) -> claims(project_id, id) and
// (project_id, source_ref_id) -> source_refs(project_id, id)), so the DB
// rejects a link whose claim and source reference belong to different Projects
// in either direction. The unique index is the link identity that rejects
// duplicate Claim/SourceRef edges (TASK item 3); the reverse index serves the
// source_ref -> claims read path. A link is append-only (`created_at` only) and
// cascades away when its claim, source reference, or whole Project is deleted.
// ============================================================================

export const claimSourceRefs = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `claim_allowed_market_profiles`
// table in ../search-growth.schema.ts (keep the two files structurally
// identical; schema-parity.test.ts fails on drift).
//
// Each row is ONE normalized, same-Project allowed-market edge of a claim
// (05_DOMAIN_DATA_MODEL.md §9 `allowed_markets[]`; TASK item 1). The relation
// is a normalized table — never a JSON/text array on the claim row — and stores
// only identity plus an append-only created_at (the linked SearchMarketProfile
// already carries the concrete market identity). Schema/contract only: no
// market-selection, primary-market, ranking or policy-evaluation behavior
// (TASK item 3). Same-Project integrity is enforced by two composite FKs
// carrying this row's own project_id as their leading column
// ((project_id, claim_id) -> claims(project_id, id) and
// (project_id, market_profile_id) -> search_market_profiles(project_id, id)),
// so the DB rejects a link whose claim and market profile belong to different
// Projects in either direction. Both parents already expose the required unique
// (project_id, id) target index, so no new referential index is added to a
// parent. The unique index is the link identity that rejects duplicate
// Claim/MarketProfile edges (TASK item 3); the reverse index serves the
// market_profile -> claims read path. A link is append-only (`created_at` only)
// and cascades away when its claim, market profile, or whole Project is
// deleted.
// ============================================================================

export const claimAllowedMarketProfiles = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `claim_allowed_languages` table
// in ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// Each row is ONE normalized, same-Project allowed-language edge of a claim
// (05_DOMAIN_DATA_MODEL.md §9 `allowed_languages[]`; TASK item 1). The relation
// is a normalized table — never a JSON/text array on the claim row — and stores
// only identity plus the opaque language tag plus an append-only created_at. The
// language value is stored verbatim as an explicit tag consistent with the
// existing V1.0 language fields; no language catalog, locale inference/
// normalization, enum/format rule, policy-evaluation or Claim-verification
// behavior is added (TASK item 3). Same-Project integrity is enforced by the
// composite FK carrying this row's own project_id as its leading column
// ((project_id, claim_id) -> claims(project_id, id)), so the DB rejects a link
// whose claim belongs to another Project. The claim parent already exposes the
// required unique (project_id, id) target index, so no new referential index is
// added to the parent. The unique index is the link identity that rejects
// duplicate Claim/language edges (TASK item 4); the reverse index serves the
// language -> claims read path. A link is append-only (`created_at` only) and
// cascades away when its claim or whole Project is deleted.
// ============================================================================

export const claimAllowedLanguages = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
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
// Search Growth V1.0 — Postgres mirror of the `media_assets` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// A media asset is the R2 source asset metadata record (05_DOMAIN_DATA_MODEL.md
// §11 MediaAsset; 15_MEDIA_ASSET_SPEC.md §2; TASK item 1). Schema/contract
// ONLY — no upload, object storage, media processing, CRUD/UI, ContentVersion
// links, Rights Gate runtime or publishing behavior is implemented here. The
// direct metadata columns `media_type`/`mime_type`/`bytes`/`sha256`/
// `rights_status`/`classification` exactly match the §11/§15/TASK field list and
// the legacy reference MediaAsset fields minus the out-of-scope storage/filename/
// dimensional/alt/source fields (see the SQLite schema comment for the full field
// reconciliation). The three direct unions are enforced by DB text-enum columns
// plus the named CHECKs below (Zod boundary in
// src/types/schemas/media-asset.ts enforces the same unions at runtime). The only
// audit column is the append-only `created_at` (the TASK limits additions to the
// established creation-metadata convention; the legacy reference carries no
// `updated_at`). Ownership is a NOT NULL FK to projects(id) ON DELETE CASCADE;
// the non-unique `media_assets_project_idx` serves Project lookup/cascade. The
// composite unique index below (`media_assets_project_id_id_idx` on
// (project_id, id)) exists ONLY as the required referential target of the T115
// published_media_refs same-Project composite FK
// ((project_id, media_asset_id) -> media_assets(project_id, id)) — id is already
// the PK, so it adds no business uniqueness. No other business uniqueness is
// added: sha256 is a plain non-unique column (no content-hash/dedup rule — TASK
// item 3).
// ============================================================================

export const mediaAssets = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Project -> media-asset reads and the project-delete cascade path (the
    // non-unique Project lookup index; TASK item 3).
    index("media_assets_project_idx").on(table.projectId),
    // Supporting unique target for the published_media_refs same-Project
    // composite FK ((project_id, media_asset_id) -> media_assets(project_id, id),
    // added below by the T115 0039 migration). id is already the PK, so this
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
// Search Growth V1.0 — Postgres mirror of the `published_media_refs` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// A published media reference records ONE media asset's opaque remote reference
// on an external creator/CMS platform after a later publisher adapter uploads/
// transfers it (05_DOMAIN_DATA_MODEL.md §11 PublishedMediaRef;
// 15_MEDIA_ASSET_SPEC.md §3–4; ADR-007). Schema/contract ONLY — no publisher
// connector, account authorization, upload, external request, URL reachability
// or public-verification behavior, and no invented success/status semantics: a
// row is only a STORED REFERENCE, never proof of public success. See the SQLite
// mirror for the full field reconciliation; the direct §11/TASK field list is
// shipped verbatim — `media_asset_id` (§11 `asset_id`), opaque `platform`,
// nullable opaque `account_id`, nullable `external_media_id` (§11 `?`), nullable
// `public_url` (§11 `?`), optional remote `sha256` and the append-only
// `created_at` — plus the stable `id` PK and the explicit `project_id` ownership
// key the established schema convention requires. The legacy/§15
// `adapter_version` is NOT shipped (no adapter-version column is authorized), and
// no status/success/verification/credential field or publication-uniqueness rule
// exists (TASK item 3).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) ON
// DELETE CASCADE. Same-Project ownership against the source asset is
// database-enforced by the composite FK
// (project_id, media_asset_id) -> media_assets(project_id, id), whose leading
// column is this row's project_id, so a reference whose MediaAsset lives on
// another Project (in either direction) is rejected by the DB. The referenced
// (project_id, id) pair is made unique by the `media_assets_project_id_id_idx`
// supporting unique index this task adds to mediaAssets (the only referential
// parent key this FK requires). Deleting a MediaAsset or a whole Project cascades
// its references away, so a reference can never dangle; the cascade removes only
// the local pointer, never externally published media
// (15_MEDIA_ASSET_SPEC.md §7). The two non-unique indexes serve the project ->
// references and asset -> references read/cascade paths. No business-unique index
// exists (no "one published ref per asset/platform" or dedup rule is authorized).
// ============================================================================

export const publishedMediaRefs = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the source media asset: this row's
    // project_id must equal the asset's project_id. Deleting an asset removes
    // its references (the referenced (project_id, id) pair is unique via the
    // supporting media_assets_project_id_id_idx unique index added to
    // mediaAssets by this task's 0039 migration). A reference whose asset lives
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
// Search Growth V1.0 — Postgres mirror of the `content_packages` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// A content package is the stable topic container (05_DOMAIN_DATA_MODEL.md §10
// ContentPackage — "主题容器"; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §2) that later
// ContentVersion/variant/rendering/publishing slices attach to. Schema/contract
// ONLY — no ContentVersion, ContentVariant, brief/canonical content,
// metadata/WebPageSpec JSON, claims/sources/assets mappings, keywords/prompts,
// market/persona modeling, search intent/PageFit behavior,
// immutable/version/gate runtime, renderers, CRUD/UI, connector or publishing
// behavior. See the SQLite mirror for the full field reconciliation; the direct
// TASK field list is shipped — stable `id` PK, explicit NOT NULL `project_id`,
// required `topic_id`, nullable `opportunity_id`, required opaque
// `title`/`locale`/`status`, and the `created_at`/`updated_at` system
// timestamps. No JSON column exists on the row (no Market/Persona/keyword/prompt
// relation is inferred from JSON — TASK item 2), and `status` stays opaque
// (TASK item 3: no lifecycle enum/gate/release/publication-success semantics).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) ON
// DELETE CASCADE. Same-Project ownership against the required Topic and the
// optional Opportunity is database-enforced by the Project-leading composite FKs
// (project_id, topic_id) -> search_topics(project_id, id) and
// (project_id, opportunity_id) -> search_growth_opportunities(project_id, id),
// so the DB rejects a package whose Topic/Opportunity belongs to another
// Project (in either direction) or is dangling. The Topic target is unique via
// the accepted `search_topics_project_id_id_idx`; the Opportunity target is made
// unique by the `search_growth_opportunities_project_id_id_idx` supporting index
// the T117 slice added to the accepted T109 opportunities table (0040). Deleting
// a Topic, an Opportunity, or a whole Project cascades the package away, so a
// container can never dangle. No business uniqueness exists on this table: the
// one unique index it exposes (`content_packages_project_id_id_idx` on
// (project_id, id), added by the T118 0041 migration) is ONLY the required
// referential target of the T118 content_package_versions same-Project composite
// FK ((project_id, content_package_id) -> content_packages(project_id, id)) — id
// is already the PK, so it adds no business uniqueness. The non-unique indexes
// serve the project/topic/opportunity -> packages read/cascade paths.
// ============================================================================

export const contentPackages = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the required topic: this row's project_id
    // must equal the topic's project_id. Deleting a topic removes its packages
    // (the referenced (project_id, id) pair is unique via the supporting
    // search_topics_project_id_id_idx index). A package whose topic lives on
    // another Project has no matching parent row and is rejected by the DB.
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the optional opportunity: when set, this
    // row's project_id must equal the opportunity's project_id. Deleting an
    // opportunity removes the packages produced from it (the referenced
    // (project_id, id) pair is unique via the
    // search_growth_opportunities_project_id_id_idx supporting unique index
    // added by the T117 0040 migration). NULL opportunity_id means no
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
    // content_packages(project_id, id), added below by the T118 0041
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
// Search Growth V1.0 — Postgres mirror of the `content_package_versions` table
// in ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// A content version records ONE immutable snapshot of a content package's
// canonical content and its version identity (05_DOMAIN_DATA_MODEL.md §10
// ContentVersion; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §§1, 8). Schema/contract
// ONLY — no Claim/SourceRef/MediaAsset mapping, ContentVariant, Gate runtime,
// release/dry-run/approval or publishing behavior. See the SQLite mirror for the
// full field reconciliation; the direct TASK field list is shipped verbatim —
// stable `id` PK, explicit NOT NULL `project_id`, required `content_package_id`
// and `version_no`, required `canonical_markdown` / `canonical_metadata_json`,
// nullable `web_page_spec_json`, required opaque `content_hash`, required
// `gate_status` (DRAFT | BLOCKED | PASSED) and `classification`
// (PUBLIC_MARKETING | INTERNAL | RESTRICTED), and the append-only `created_at`
// timestamp only (TASK item 3: immutable-row shape — no `updated_at`, no
// mutable workflow/release/publishing state).
//
// OWNERSHIP / DELETE BEHAVIOR: `project_id` is a NOT NULL FK to projects(id) ON
// DELETE CASCADE. Same-Project ContentPackage ownership is database-enforced by
// the Project-leading composite FK (project_id, content_package_id) ->
// content_packages(project_id, id), so the DB rejects a version whose package
// belongs to another Project (in either direction) or is dangling. The parent
// (project_id, id) target is made unique by the
// `content_packages_project_id_id_idx` supporting unique index this task adds to
// the accepted T117 content_packages table (0041) — the only new referential
// parent index this slice requires. Deleting a content package or a whole
// Project cascades its versions away, so a version can never dangle. The only
// business uniqueness is the version identity (content_package_id, version_no);
// the one supporting referential index on this table,
// `content_package_versions_project_id_id_idx` (unique on (project_id, id)), is
// added by the T119 0042 migration purely as the composite-FK target of the
// content_package_version_claims same-Project FK (id is already the PK, so it
// accepts exactly the PK's rows and adds no business uniqueness). No other index
// or uniqueness rule exists on this table.
// ============================================================================

export const contentPackageVersions = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the owning content package: this row's
    // project_id must equal the package's project_id. Deleting a content package
    // removes its versions (the referenced (project_id, id) pair is unique via
    // the supporting content_packages_project_id_id_idx unique index added by
    // this task's 0041 migration). A version whose package lives on another
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
    // content_package_versions(project_id, id), added below by the T119 0042
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
// Search Growth V1.0 — Postgres mirror of the `content_package_version_claims`
// table in ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// Each row is ONE link between an immutable content package version and a claim
// that version relies on (05_DOMAIN_DATA_MODEL.md §10 ContentVersion
// `claim_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §§1, 10). Schema/contract
// ONLY — no Claim gate evaluation/override, mutable evidence payload, release/
// publishing behavior, or CRUD/UI. See the SQLite mirror for the full field
// reconciliation; the direct TASK field list is shipped verbatim — stable `id`
// PK, explicit NOT NULL `project_id`, required `content_package_version_id`,
// required `claim_id`, and the append-only `created_at` timestamp only (no
// `updated_at`, no evidence/verification payload on the link row).
//
// SAME-PROJECT INTEGRITY is database-enforced by two Project-leading composite
// FKs: (project_id, content_package_version_id) ->
// content_package_versions(project_id, id) and (project_id, claim_id) ->
// claims(project_id, id), so the DB rejects a link whose version and claim
// belong to different Projects (in either direction) or a dangling parent. The
// ContentVersion parent target `content_package_versions_project_id_id_idx` is
// the ONE new referential parent index this slice requires (added to the
// accepted T118 table in 0042); the Claim parent target is the accepted
// `claims_project_id_id_idx` from 0035 and is reused. Deleting a version, a
// claim, or a whole Project cascades its links away. The only business
// uniqueness is the link identity (content_package_version_id, claim_id); the
// claim_id reverse index serves the claim -> versions read path and no other
// index or uniqueness rule exists on this table.
// ============================================================================

export const contentPackageVersionClaims = pgTable(
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
    // mutable payload and no updated_at.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the content package version: this link's
    // project_id must equal the version's project_id. Deleting a content package
    // version removes its claim links (the referenced (project_id, id) pair is
    // unique via content_package_versions_project_id_id_idx added by this task's
    // 0042 migration).
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
    // claims_project_id_id_idx from 0035 — reused, not recreated).
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
// Search Growth V1.0 — Postgres mirror of the
// `content_package_version_source_refs` table in ../search-growth.schema.ts
// (keep the two files structurally identical; schema-parity.test.ts fails on
// drift).
//
// Each row is ONE link between an immutable content package version and a source
// reference that version relies on (05_DOMAIN_DATA_MODEL.md §10 ContentVersion
// `source_refs[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §§2–4, 10). Schema/contract
// ONLY — no source assessment/verification/revalidation, mutable evidence
// payload, Claim gate behavior, release/publishing behavior, or CRUD/UI. See the
// SQLite mirror for the full field reconciliation; the direct TASK field list is
// shipped verbatim — stable `id` PK, explicit NOT NULL `project_id`, required
// `content_package_version_id`, required `source_ref_id`, and the append-only
// `created_at` timestamp only (no `updated_at`, no evidence/verification payload
// on the link row).
//
// SAME-PROJECT INTEGRITY is database-enforced by two Project-leading composite
// FKs: (project_id, content_package_version_id) ->
// content_package_versions(project_id, id) and (project_id, source_ref_id) ->
// source_refs(project_id, id), so the DB rejects a link whose version and source
// reference belong to different Projects (in either direction) or a dangling
// parent. Both parent targets already exist on the accepted parents and are
// reused, so this slice adds NO parent index: the accepted
// `content_package_versions_project_id_id_idx` (T118/T119, PG 0042) and
// `source_refs_project_id_id_idx` (T110, PG 0035). Deleting a version, a source
// reference, or a whole Project cascades its links away. The only business
// uniqueness is the link identity (content_package_version_id, source_ref_id);
// the source_ref_id reverse index serves the source-ref -> versions read path and
// no other index or uniqueness rule exists on this table.
// ============================================================================

export const contentPackageVersionSourceRefs = pgTable(
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
    // mutable payload and no updated_at.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the content package version: this link's
    // project_id must equal the version's project_id. Deleting a content package
    // version removes its source links (the referenced (project_id, id) pair is
    // unique via the accepted content_package_versions_project_id_id_idx from
    // 0042 — reused, not recreated).
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
    // via the accepted source_refs_project_id_id_idx from 0035 — reused, not
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
// Search Growth V1.0 — Postgres mirror of the
// `content_package_version_media_assets` table in ../search-growth.schema.ts
// (keep the two files structurally identical; schema-parity.test.ts fails on
// drift).
//
// Each row is ONE link between an immutable content package version and a media
// asset that version references (05_DOMAIN_DATA_MODEL.md §10 ContentVersion
// `asset_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md §1 canonical source
// `asset://<id>`, §2). Schema/contract ONLY — no asset upload, object storage,
// transformation, rights evaluation, rendered/published behavior, release/
// publishing behavior, or CRUD/UI. See the SQLite mirror for the full field
// reconciliation; the direct TASK field list is shipped verbatim — stable `id`
// PK, explicit NOT NULL `project_id`, required `content_package_version_id`,
// required `media_asset_id`, and the append-only `created_at` timestamp only (no
// `updated_at`, no asset/rights payload on the link row).
//
// SAME-PROJECT INTEGRITY is database-enforced by two Project-leading composite
// FKs: (project_id, content_package_version_id) ->
// content_package_versions(project_id, id) and (project_id, media_asset_id) ->
// media_assets(project_id, id), so the DB rejects a link whose version and media
// asset belong to different Projects (in either direction) or a dangling parent.
// Both parent targets already exist on the accepted parents and are reused, so
// this slice adds NO parent index: the accepted
// `content_package_versions_project_id_id_idx` (T118/T119, PG 0042) and
// `media_assets_project_id_id_idx` (T114, PG 0039). Deleting a version, a media
// asset, or a whole Project cascades its links away (it does not delete the R2
// source asset — 15_MEDIA_ASSET_SPEC.md §7). The only business uniqueness is the
// link identity (content_package_version_id, media_asset_id); the media_asset_id
// reverse index serves the media-asset -> versions read path and no other index
// or uniqueness rule exists on this table.
// ============================================================================

export const contentPackageVersionMediaAssets = pgTable(
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
    // mutable payload and no updated_at.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the content package version: this link's
    // project_id must equal the version's project_id. Deleting a content package
    // version removes its media links (the referenced (project_id, id) pair is
    // unique via the accepted content_package_versions_project_id_id_idx from
    // 0042 — reused, not recreated).
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
    // media_assets_project_id_id_idx from 0039 — reused, not recreated).
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
// Search Growth V1.0 — Postgres mirror of the `content_variants` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// ONE immutable, Project-scoped platform-native ContentVariant renders one
// ContentVersion (05_DOMAIN_DATA_MODEL.md §10 ContentVariant; 09_CONTENT_
// EVIDENCE_WEBPAGE_SPEC.md §7 Platform Variants; ADR-006). Schema/contract ONLY
// — no platform-account/connector choice, target routing, asset mapping,
// tag/category normalization, renderer runtime, HTML conversion, release/
// approval/publishing behavior, or CRUD/UI. See the SQLite mirror for the full
// field reconciliation; the direct TASK field list is shipped verbatim — stable
// `id` PK, explicit NOT NULL `project_id`, required `content_package_version_id`,
// required opaque `platform`/`format`, required `title`/`body`, required opaque
// `metadata_json`, required `body_hash`, required `renderer_version`, and the
// append-only `created_at` timestamp only (no `updated_at`, no execution/
// approval/account/public-success state, no JSON asset/reference id container,
// no variant asset mapping).
//
// SAME-PROJECT INTEGRITY is database-enforced by the Project-leading composite FK
// (project_id, content_package_version_id) ->
// content_package_versions(project_id, id), so the DB rejects a variant whose
// version belongs to another Project (in either direction) or a dangling parent.
// The parent target already exists on the accepted content_package_versions table
// (`content_package_versions_project_id_id_idx`, T118/T119, PG 0042) and is
// REUSED, so this slice adds NO parent index. The later T123 relation adds the
// supporting `content_variants_project_id_id_idx` unique index below as the
// composite-FK target for content_variant_media_assets (id is already the PK, so
// it accepts exactly the PK's rows and adds no business uniqueness). Deleting a
// version or a whole Project cascades its variants away. `id` is the ONLY
// identity (TASK item 2): no business uniqueness rule and no extra lookup index
// exists on this table.
// ============================================================================

export const contentVariants = pgTable(
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
    // Opaque target platform identifier — free-form required string, no enum
    // invented in this slice (TASK item 1).
    platform: text("platform").notNull(),
    // Opaque platform-native format identifier — free-form required string, no
    // format enum invented in this slice (TASK item 1).
    format: text("format").notNull(),
    // The platform-native variant title (09 spec §7 title).
    title: text("title").notNull(),
    // The platform-native variant body (ADR-006 platform HTML/body), stored
    // verbatim as an opaque document payload.
    body: text("body").notNull(),
    // Opaque platform-native renderer metadata document (09 spec §7), stored
    // verbatim as a required JSON payload. Renderer metadata, NOT a relational id
    // container (TASK item 1).
    metadataJson: text("metadata_json").notNull(),
    // The required opaque body hash stored verbatim; plain non-unique column (no
    // body-hash matching/dedup rule is invented in this slice).
    bodyHash: text("body_hash").notNull(),
    // The required renderer version that produced this body, stored verbatim for
    // render provenance.
    rendererVersion: text("renderer_version").notNull(),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column (no updated_at, no mutable state).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the ContentVersion: this row's project_id must
    // equal the version's project_id. Deleting a content package version removes
    // its variants (the referenced (project_id, id) pair is unique via the
    // accepted content_package_versions_project_id_id_idx from 0042 — reused, not
    // recreated).
    foreignKey({
      columns: [table.projectId, table.contentPackageVersionId],
      foreignColumns: [
        contentPackageVersions.projectId,
        contentPackageVersions.id,
      ],
    }).onDelete("cascade"),
    // Supporting unique referential target for the content_variant_media_assets
    // same-Project composite FK ((project_id, content_variant_id) ->
    // content_variants(project_id, id), added by the T123 0046 migration). id is
    // already the PK, so this composite accepts exactly the rows the PK accepts
    // and adds no business uniqueness.
    uniqueIndex("content_variants_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `content_variant_media_assets`
// table in ../search-growth.schema.ts (keep the two files structurally
// identical; schema-parity.test.ts fails on drift).
//
// Each row is ONE link between an immutable platform-native ContentVariant and a
// media asset that variant references (05_DOMAIN_DATA_MODEL.md §10 ContentVariant
// derived from ContentVersion `asset_ids[]`; 09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md
// §1 `asset://<id>`, §2, §7; legacy `assetRefs: string[]` /
// `asset_refs_json`). Schema/contract ONLY — no asset upload, object storage,
// download, transformation, rights evaluation, rendered/published behavior,
// PublishedMediaRef behavior, release/publishing behavior, or CRUD/UI. See the
// SQLite mirror for the full field reconciliation; the direct TASK field list is
// shipped verbatim — stable `id` PK, explicit NOT NULL `project_id`, required
// `content_variant_id`, required `media_asset_id`, and the append-only
// `created_at` timestamp only (no `updated_at`, no asset/rights payload on the
// link row).
//
// SAME-PROJECT INTEGRITY is database-enforced by two Project-leading composite
// FKs: (project_id, content_variant_id) -> content_variants(project_id, id) and
// (project_id, media_asset_id) -> media_assets(project_id, id), so the DB rejects
// a link whose variant and media asset belong to different Projects (in either
// direction) or a dangling parent. The MediaAsset parent target already exists on
// the accepted media_assets table (`media_assets_project_id_id_idx`, T114, PG
// 0039) and is reused, so this slice adds NO index to `media_assets`. The
// ContentVariant parent target is the ONE new referential index this slice adds
// (`content_variants_project_id_id_idx`, from the T122 table in this same 0046
// migration). Deleting a variant, a media asset, or a whole Project cascades its
// links away (it does not delete the R2 source asset — 15_MEDIA_ASSET_SPEC.md
// §7). The only business uniqueness is the link identity (content_variant_id,
// media_asset_id); the media_asset_id reverse index serves the media-asset ->
// variants read path and no other index or uniqueness rule exists on this table.
// ============================================================================

export const contentVariantMediaAssets = pgTable(
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
    // mutable payload and no updated_at.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the ContentVariant: this link's project_id
    // must equal the variant's project_id. Deleting a content variant removes its
    // media links (the referenced (project_id, id) pair is unique via
    // content_variants_project_id_id_idx added by this task's 0046 migration).
    foreignKey({
      columns: [table.projectId, table.contentVariantId],
      foreignColumns: [contentVariants.projectId, contentVariants.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the media asset: this link's project_id must
    // equal the asset's project_id. Deleting a media asset removes its variant
    // links (the referenced (project_id, id) pair is unique via the accepted
    // media_assets_project_id_id_idx from 0039 — reused, not recreated).
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
// Search Growth V1.0 — Postgres mirror of the `release_bundles` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// The ONE immutable, Project-scoped ReleaseBundle business approval unit
// (05_DOMAIN_DATA_MODEL.md §12; 10_DISTRIBUTION_ARCHITECTURE.md §6; ADR-008;
// 21_TEST_ACCEPTANCE_PLAN.md §12; 18_WORKFLOW_STATE_MACHINES.md §1). Schema/
// contract ONLY — no state transition/CAS, approval action, dry-run execution,
// target/connector/account logic, publishing, paid action, or CRUD/UI (TASK
// item 4). See the SQLite mirror for the full field reconciliation; the direct
// TASK field list is shipped verbatim — stable `id` PK, explicit NOT NULL
// `project_id`, required `content_package_version_id`, required `release_version`,
// required `status`/`release_strategy` enums, required opaque `utm_policy_json`,
// required opaque `bundle_hash`, nullable `dry_run_report_json`, nullable
// `approved_by`/`approved_at`, and the append-only `created_at` timestamp only
// (no `updated_at`; the legacy `updated_at` is reconciled out because the TASK
// field list names the creation timestamp only and no state transition/CAS is
// implemented).
//
// SAME-PROJECT INTEGRITY is database-enforced by the Project-leading composite FK
// (project_id, content_package_version_id) ->
// content_package_versions(project_id, id), so the DB rejects a bundle whose
// ContentVersion belongs to another Project (in either direction) or a dangling
// parent. The parent target already exists on the accepted
// content_package_versions table (`content_package_versions_project_id_id_idx`,
// T119, PG 0042) and is REUSED, so this slice adds NO parent index. Deleting a
// ContentVersion or a whole Project cascades its bundles away. The only business
// uniqueness is the release identity (content_package_version_id,
// release_version), whose leading column also serves the ContentVersion ->
// release-bundles read path; no other index or uniqueness rule exists.
// ============================================================================

export const releaseBundles = pgTable(
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
    // The immutable release version number (R1/R2/...) within the ContentVersion;
    // the unique index below is the release identity.
    releaseVersion: integer("release_version").notNull(),
    // The direct V1.0 release lifecycle union (18 §1). DB text-enum column + the
    // named CHECK below; the Zod boundary validates the same list.
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
    // The direct source-defined release strategy union (domain-types.ts; 10 §5).
    releaseStrategy: text("release_strategy", {
      enum: ["WEBSITE_FIRST", "PARALLEL", "SOCIAL_ONLY"],
    }).notNull(),
    // Required opaque UTM policy document frozen with the bundle (ADR-008; 21
    // §12), stored verbatim.
    utmPolicyJson: text("utm_policy_json").notNull(),
    // Required opaque frozen-bundle hash (ADR-008; 21 §12), stored verbatim;
    // plain non-unique column.
    bundleHash: text("bundle_hash").notNull(),
    // Optional opaque dry-run report document; NULL = not attached yet. The
    // dry-run step is out of scope.
    dryRunReportJson: text("dry_run_report_json"),
    // Approval fields; NULL = not approved. Recording them does NOT implement an
    // approval action (TASK item 4).
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    // Append-only creation timestamp (system insert time) — the ONLY audit
    // column (no updated_at).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the ContentVersion: this row's project_id must
    // equal the version's project_id. Deleting a content package version removes
    // its release bundles (the referenced (project_id, id) pair is unique via the
    // accepted content_package_versions_project_id_id_idx from 0042 — reused, not
    // recreated).
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
    // release_bundles(project_id, id), added by the T125 0048 migration). id is
    // already the PK, so this composite accepts exactly the rows the PK accepts
    // and adds no business uniqueness.
    uniqueIndex("release_bundles_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // DB-level enum rejection for the two direct release unions (migration-backed
    // enum rejection; the Zod boundary enforces the same lists at the runtime
    // edge).
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
// Search Growth V1.0 — Postgres mirror of the `release_targets` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// The immutable, Project-scoped ReleaseTarget core (05_DOMAIN_DATA_MODEL.md §12;
// 10_DISTRIBUTION_ARCHITECTURE.md §2/§4; 16_ATTRIBUTION_EXPERIMENT_SPEC.md;
// 21_TEST_ACCEPTANCE_PLAN.md §14; legacy `schemas/domain-types.ts` ReleaseTarget
// and `schemas/migrations-reference.sql` release_targets). Schema/contract ONLY
// — no approve/execute/publish/spend/external-system/credential/account/connector
// behavior (TASK items 1, 3, 4). See the SQLite mirror for the full field and
// delete reconciliation; the direct TASK field list is shipped verbatim — stable
// `id` PK, explicit NOT NULL `project_id`, required `release_bundle_id` and
// `content_variant_id`, opaque free-form `platform`, source-defined
// `target_intent` enum, `required` flag (default true), nullable `scheduled_at`,
// nullable `dependency_target_id`, nullable `utm_url`, required opaque
// `target_hash`, and the append-only `created_at` timestamp only. The legacy
// `publisher_connection_id` is DELIBERATELY NOT persisted (TASK item 3), and
// there is no `updated_at` (an immutable target row has no mutable state).
//
// SAME-PROJECT INTEGRITY is database-enforced by two Project-leading composite
// FKs — (project_id, release_bundle_id) -> release_bundles(project_id, id) and
// (project_id, content_variant_id) -> content_variants(project_id, id) — both
// ON DELETE CASCADE. The ReleaseBundle parent target
// `release_bundles_project_id_id_idx` is added by this migration (the accepted
// T124 table gains its referential supporting index); the ContentVariant target
// `content_variants_project_id_id_idx` is reused from the accepted T123 0046
// migration. The optional dependency is a Project-leading composite self-FK
// (project_id, dependency_target_id) -> release_targets(project_id, id) with
// ON DELETE no action (restrictive on both dialects). No source-defined business
// uniqueness exists, so none is invented: the only unique indexes are the
// referential supporting targets the composite FKs require.
// ============================================================================

export const releaseTargets = pgTable(
  "release_targets",
  {
    id: text("id").primaryKey(),
    // The owning Project; explicit so ownership is never inferred and the
    // Project FK + same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The immutable ReleaseBundle this target is frozen inside; bound to the
    // row's project by the composite FK below (cascades targets away on delete).
    releaseBundleId: text("release_bundle_id").notNull(),
    // The immutable ContentVariant this target publishes; bound to the row's
    // project by the composite FK below (cascades targets away on delete).
    contentVariantId: text("content_variant_id").notNull(),
    // Opaque free-form platform slug; no platform enum is invented in this core
    // slice (TASK item 3).
    platform: text("platform").notNull(),
    // The direct source-defined target intent union (domain-types.ts
    // TargetIntent; 10 §2 targetIntent), DB-checked below and narrowed by the Zod
    // boundary.
    targetIntent: text("target_intent", {
      enum: ["DRAFT", "PUBLIC", "SUBMIT_FOR_REVIEW", "PAID_SUBMIT"],
    }).notNull(),
    // Source-defined required flag (16 spec; legacy DEFAULT 1).
    required: boolean("required").notNull().default(true),
    // Optional schedule; NULL = not scheduled. No scheduler exists in this slice.
    scheduledAt: text("scheduled_at"),
    // Optional same-Project target dependency; NULL = no dependency.
    dependencyTargetId: text("dependency_target_id"),
    // Optional UTM URL stored verbatim; NULL = none.
    utmUrl: text("utm_url"),
    // Required opaque target hash stored verbatim; plain non-unique column.
    targetHash: text("target_hash").notNull(),
    // Append-only creation timestamp (the ONLY audit column; no updated_at).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the ReleaseBundle (cascade); the referenced
    // (project_id, id) pair is unique via `release_bundles_project_id_id_idx`
    // added by this migration.
    foreignKey({
      columns: [table.projectId, table.releaseBundleId],
      foreignColumns: [releaseBundles.projectId, releaseBundles.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the ContentVariant (cascade), reusing the
    // accepted content_variants_project_id_id_idx from T123 0046.
    foreignKey({
      columns: [table.projectId, table.contentVariantId],
      foreignColumns: [contentVariants.projectId, contentVariants.id],
    }).onDelete("cascade"),
    // Optional same-Project dependency self-reference. A NULL dependency is
    // unconstrained (MATCH SIMPLE); a non-NULL one must name a same-Project
    // target. Deleting a referenced target is blocked (no action) rather than
    // SET NULL, which a composite FK cannot do for the NOT NULL project_id.
    foreignKey({
      columns: [table.projectId, table.dependencyTargetId],
      foreignColumns: [table.projectId, table.id],
    }).onDelete("no action"),
    // Supporting unique referential target for the dependency self-FK; id is
    // already the PK, so it adds no business uniqueness.
    uniqueIndex("release_targets_project_id_id_idx").on(
      table.projectId,
      table.id,
    ),
    // DB-level enum rejection for the source-defined target intent.
    check(
      "release_targets_target_intent_valid",
      sql`(${table.targetIntent} IN ('DRAFT','PUBLIC','SUBMIT_FOR_REVIEW','PAID_SUBMIT'))`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — append-only, Project-scoped audit events (Postgres mirror
// of ../search-growth.schema.ts; keep the two structurally identical and note
// that schema-parity compares CHECK NAMES, so the metadata validity check has
// the same name with a dialect-native JSON expression). See the SQLite table for
// the full field/ownership/append-only reconciliation. The append-only UPDATE/
// DELETE triggers are not expressible in a Drizzle schema; they are added by
// this task's forward migration (PostgreSQL 0049) exactly as on D1 (0071).
// ============================================================================

export const searchGrowthAuditEvents = pgTable(
  "search_growth_audit_events",
  {
    id: text("id").primaryKey(),
    // The owning Project; explicit so ownership is never inferred and the
    // Project FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Opaque actor identity; deliberately not a foreign key (TASK item 3).
    actorId: text("actor_id").notNull(),
    // Opaque action label; no action taxonomy/enum is invented (TASK item 3).
    action: text("action").notNull(),
    // Opaque object type/id; not foreign keys (TASK item 3).
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    // Optional opaque before/after references; NULL = none. Not foreign keys.
    beforeRef: text("before_ref"),
    afterRef: text("after_ref"),
    // Required metadata document as JSON text; the CHECK below rejects malformed
    // JSON on this dialect via an equivalent JSON cast.
    metadataJson: text("metadata_json").notNull(),
    // Opaque correlation id; not a foreign key (TASK item 3).
    correlationId: text("correlation_id").notNull(),
    // Append-only creation timestamp (the ONLY audit column; no updated_at).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Project-scoped audit reads; no business-rule unique index.
    index("search_growth_audit_events_project_idx").on(table.projectId),
    // Metadata validity (same name as the SQLite JSON check): casting malformed
    // text to jsonb raises and rejects the insert.
    check(
      "search_growth_audit_events_metadata_valid",
      sql`(${table.metadataJson})::jsonb IS NOT NULL`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — mutable global runtime controls (Postgres mirror of
// ../search-growth.schema.ts; keep the two structurally identical). Note that
// schema-parity compares CHECK NAMES, so the value validity check has the same
// name with a dialect-native JSON expression. See the SQLite table for the full
// field/mutability/scope reconciliation. There is deliberately NO append-only
// trigger: RuntimeControl is mutable configuration this task records only.
// ============================================================================

export const runtimeControls = pgTable(
  "runtime_controls",
  {
    // Stable control identity; the PRIMARY KEY gives key identity and rejects a
    // duplicate key. Opaque text — no control-key enum/taxonomy is invented.
    controlKey: text("control_key").primaryKey(),
    // The control value as JSON text carrying exactly boolean|number|string
    // (TASK item 2); required.
    valueJson: text("value_json").notNull(),
    // Optional operator reason; NULL = no reason recorded. Opaque text.
    reason: text("reason"),
    // Required updater identity; opaque, not a foreign key (TASK item 3).
    updatedBy: text("updated_by").notNull(),
    // Mutable update timestamp, defaulted on insert; no append-only trigger and
    // no CAS/version column (TASK item 3).
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // Value validity (same name as the SQLite check): casting malformed text to
    // jsonb raises and rejects the insert, and jsonb_typeof rejects every
    // unsupported JSON kind (null/array/object), admitting only the
    // boolean|number|string union.
    check(
      "runtime_controls_value_valid",
      sql`jsonb_typeof((${table.valueJson})::jsonb) IN ('boolean','number','string')`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Project-scoped index observation facts (Postgres mirror
// of ../search-growth.schema.ts; keep the two structurally identical). The
// only dialect differences are the jsonb-cast details validity check and the
// isoNow timestamp default; both CHECK names match the SQLite side.
// See the SQLite table for the full field/enum/JSON/scope reconciliation.
//
// `url` stays opaque (no normalization/identity/dedup) and the legacy
// `publication_receipt_id` is deliberately not shipped (TASK items 2–3).
// ============================================================================

export const indexingObservations = pgTable(
  "indexing_observations",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The observed URL, OPAQUE in this slice (TASK item 2).
    url: text("url").notNull(),
    // The exact SearchEngine union (GOOGLE | BAIDU | BING | OTHER). DB text-enum
    // column + the named CHECK below.
    searchEngine: text("search_engine", {
      enum: ["GOOGLE", "BAIDU", "BING", "OTHER"],
    }).notNull(),
    // Optional same-Project SearchMarketProfile; NULL means no profile attached.
    marketProfileId: text("market_profile_id"),
    // Required opaque observation-kind label; no authoritative enum exists.
    observationType: text("observation_type").notNull(),
    // Required opaque status label; no authoritative enum/lifecycle exists.
    status: text("status").notNull(),
    // Required observation-details JSON document; validated at the DB boundary.
    detailsJson: text("details_json").notNull(),
    // The application-supplied observation moment, distinct from created_at.
    observedAt: text("observed_at").notNull(),
    // Append-only system insert timestamp; no updated_at (point-in-time fact).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the optional market profile (see the SQLite
    // table). Deleting the profile cascades scoped observations away.
    foreignKey({
      columns: [table.projectId, table.marketProfileId],
      foreignColumns: [searchMarketProfiles.projectId, searchMarketProfiles.id],
    }).onDelete("cascade"),
    // DB-level enum rejection for the one authoritative enum (same check name
    // as the SQLite side).
    check(
      "indexing_observations_search_engine_valid",
      sql`(${table.searchEngine} IN ('GOOGLE','BAIDU','BING','OTHER'))`,
    ),
    // Details-document validity: casting malformed text to jsonb raises and
    // rejects the insert. Same check name as the SQLite json_valid() CHECK.
    check(
      "indexing_observations_details_valid",
      sql`((${table.detailsJson})::jsonb) IS NOT NULL`,
    ),
    // Project-scoped observation reads.
    index("indexing_observations_project_idx").on(table.projectId),
    // Market profile -> observations reads and the profile cascade delete path.
    index("indexing_observations_market_profile_idx").on(table.marketProfileId),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `experiments` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift). See the SQLite table for the full
// field/enum/JSON/ownership/delete reconciliation. The dialect differences are
// the jsonb-cast validity checks (Postgres has no json_valid()) and the isoNow
// timestamp default; every CHECK name and every FK/index shape matches.
//
// `url`-style opaque documents stay text here (no jsonb column type) so the
// schema-parity type comparison and the SQLite mirror agree. There is no
// business unique index; the referenced (project_id, id) pairs the three
// composite FKs need already exist on the accepted parent tables.
// ============================================================================

export const experiments = pgTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FKs below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The REQUIRED same-Project SearchTopic relation; bound by the composite FK
    // below (cascades experiments away when the topic is deleted).
    topicId: text("topic_id").notNull(),
    // The OPTIONAL same-Project Opportunity relation; NULL = none attached.
    opportunityId: text("opportunity_id"),
    // The OPTIONAL same-Project ReleaseBundle relation; NULL = none attached.
    releaseBundleId: text("release_bundle_id"),
    // Required human-facing title; carried verbatim.
    title: text("title").notNull(),
    // Required written hypothesis; carried verbatim.
    hypothesis: text("hypothesis").notNull(),
    // Required opaque lifecycle label; no authoritative union exists (TASK item
    // 3), so no enum/lifecycle is invented.
    status: text("status").notNull(),
    // The one authoritative enum: the source-defined activation policy
    // (FIRST_REQUIRED_PUBLIC | ALL_REQUIRED_TERMINAL —
    // 16_ATTRIBUTION_EXPERIMENT_SPEC.md §4), DB-checked below.
    activationPolicy: text("activation_policy", {
      enum: ["FIRST_REQUIRED_PUBLIC", "ALL_REQUIRED_TERMINAL"],
    }).notNull(),
    // Optional activation timestamp; NULL = not activated. Stored only.
    activationAt: text("activation_at"),
    // Required opaque reference/policy documents as JSON text; each validated at
    // the DB boundary by its named jsonb-cast CHECK below.
    targetKeywordRefsJson: text("target_keyword_refs_json").notNull(),
    targetPromptRefsJson: text("target_prompt_refs_json").notNull(),
    targetSurfaceRefsJson: text("target_surface_refs_json").notNull(),
    recheckPolicyJson: text("recheck_policy_json").notNull(),
    // Append-only creation timestamp (system insert time); no updated_at.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the REQUIRED topic (cascade). The referenced
    // (project_id, id) pair is unique via search_topics_project_id_id_idx.
    foreignKey({
      columns: [table.projectId, table.topicId],
      foreignColumns: [searchTopics.projectId, searchTopics.id],
    }).onDelete("cascade"),
    // Same-Project composite FK to the OPTIONAL opportunity (cascade). The
    // referenced (project_id, id) pair is unique via
    // search_growth_opportunities_project_id_id_idx. NULL is unconstrained.
    foreignKey({
      columns: [table.projectId, table.opportunityId],
      foreignColumns: [
        searchGrowthOpportunities.projectId,
        searchGrowthOpportunities.id,
      ],
    }).onDelete("cascade"),
    // Same-Project composite FK to the OPTIONAL release bundle (cascade). The
    // referenced (project_id, id) pair is unique via
    // release_bundles_project_id_id_idx. NULL is unconstrained.
    foreignKey({
      columns: [table.projectId, table.releaseBundleId],
      foreignColumns: [releaseBundles.projectId, releaseBundles.id],
    }).onDelete("cascade"),
    // DB-level enum rejection for the one authoritative enum (same check name
    // as the SQLite side).
    check(
      "experiments_activation_policy_valid",
      sql`(${table.activationPolicy} IN ('FIRST_REQUIRED_PUBLIC','ALL_REQUIRED_TERMINAL'))`,
    ),
    // Reference/policy document validity: casting malformed text to jsonb raises
    // and rejects the insert. Same check names as the SQLite json_valid() CHECKs.
    check(
      "experiments_target_keyword_refs_valid",
      sql`((${table.targetKeywordRefsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiments_target_prompt_refs_valid",
      sql`((${table.targetPromptRefsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiments_target_surface_refs_valid",
      sql`((${table.targetSurfaceRefsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiments_recheck_policy_valid",
      sql`((${table.recheckPolicyJson})::jsonb) IS NOT NULL`,
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
    // added by the T130 0053 migration). id is already the PK, so this composite
    // accepts exactly the rows the PK accepts and adds NO business uniqueness.
    uniqueIndex("experiments_project_id_id_idx").on(table.projectId, table.id),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `experiment_snapshots` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift). See the SQLite table for the full
// field/taxonomy/JSON/ownership/append-only reconciliation. The dialect
// differences are the jsonb-cast validity checks (Postgres has no json_valid())
// and the isoNow timestamp default; every CHECK name and every FK/index shape
// matches. The append-only UPDATE/DELETE triggers are not expressible in a
// Drizzle schema; they are added by this task's forward migration (PostgreSQL
// 0053) exactly as on D1 (0075), following the accepted AuditEvent pattern.
//
// No business unique index exists: the only unique index is the referential
// supporting target `experiments_project_id_id_idx` this task adds to the parent
// `experiments` table for the same-Project composite FK.
// ============================================================================

export const experimentSnapshots = pgTable(
  "experiment_snapshots",
  {
    id: text("id").primaryKey(),
    // The owning Project. Explicit typed column so ownership is never inferred
    // and the Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The Experiment this snapshot measures; bound same-Project by the composite
    // FK below (cascades snapshots away on delete, subject to the append-only
    // DELETE trigger guard).
    experimentId: text("experiment_id").notNull(),
    // The source-defined snapshot taxonomy (BASELINE | D7 | D14 | D30 | MANUAL),
    // DB-checked below and narrowed by the Zod boundary.
    snapshotType: text("snapshot_type", {
      enum: ["BASELINE", "D7", "D14", "D30", "MANUAL"],
    }).notNull(),
    // The application-supplied capture moment; distinct from system created_at.
    capturedAt: text("captured_at").notNull(),
    // Optional measurement window context; NULL = none recorded. Stored only.
    windowStart: text("window_start"),
    windowEnd: text("window_end"),
    timezone: text("timezone"),
    // The five REQUIRED metric documents plus the data-quality document, each
    // persisted as JSON text and validated by its named jsonb-cast CHECK below.
    seoMetricsJson: text("seo_metrics_json").notNull(),
    geoMetricsJson: text("geo_metrics_json").notNull(),
    ga4MetricsJson: text("ga4_metrics_json").notNull(),
    publicationMetricsJson: text("publication_metrics_json").notNull(),
    indexingMetricsJson: text("indexing_metrics_json").notNull(),
    dataQualityJson: text("data_quality_json").notNull(),
    // Optional free-text note; NULL = no note recorded.
    notes: text("notes"),
    // Append-only creation timestamp (the ONLY audit column; no updated_at).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the Experiment (cascade), reusing the
    // supporting experiments_project_id_id_idx unique index this task's 0053
    // migration adds to the parent. A snapshot whose Experiment belongs to
    // another Project has no matching parent row.
    foreignKey({
      columns: [table.projectId, table.experimentId],
      foreignColumns: [experiments.projectId, experiments.id],
    }).onDelete("cascade"),
    // DB-level rejection for the source-defined taxonomy (same check name as the
    // SQLite side).
    check(
      "experiment_snapshots_snapshot_type_valid",
      sql`(${table.snapshotType} IN ('BASELINE','D7','D14','D30','MANUAL'))`,
    ),
    // Required-document validity: casting malformed text to jsonb raises and
    // rejects the insert. Same check names as the SQLite json_valid() CHECKs.
    check(
      "experiment_snapshots_seo_metrics_valid",
      sql`((${table.seoMetricsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiment_snapshots_geo_metrics_valid",
      sql`((${table.geoMetricsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiment_snapshots_ga4_metrics_valid",
      sql`((${table.ga4MetricsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiment_snapshots_publication_metrics_valid",
      sql`((${table.publicationMetricsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiment_snapshots_indexing_metrics_valid",
      sql`((${table.indexingMetricsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "experiment_snapshots_data_quality_valid",
      sql`((${table.dataQualityJson})::jsonb) IS NOT NULL`,
    ),
    // Experiment -> snapshots reads and the experiment cascade delete path.
    index("experiment_snapshots_experiment_idx").on(table.experimentId),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the `search_growth_targets` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift). See the SQLite table for the full
// field/identity/JSON/provenance reconciliation. `project_id` is the primary
// key and the NOT NULL FK to projects(id) ON DELETE CASCADE, preserving the
// reference table's one-row-per-Project identity; `config_json` is the required
// configuration document with the openapi SearchGrowthTarget shape matched by
// the Zod boundary; `updated_by`/`updated_at` are the required provenance and
// update timestamp. The only dialect differences are the jsonb-cast validity
// CHECK (Postgres has no json_valid(); same check name) and the isoNow
// timestamp default. This mutable configuration row has no append-only trigger,
// no CAS/version column and no created_at. project_id is the SOLE identity rule
// (one row per Project); there is no business unique index and no separate
// index beyond the primary key.
// ============================================================================

export const searchGrowthTargets = pgTable(
  "search_growth_targets",
  {
    // One-row-per-Project identity: PRIMARY KEY + FK to the existing Project.
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Required targeting configuration document (openapi SearchGrowthTarget
    // shape) as JSON text, validated by the named CHECK below.
    configJson: text("config_json").notNull(),
    // Required configuration provenance, opaque text (not a foreign key).
    updatedBy: text("updated_by").notNull(),
    // Required mutable update timestamp, defaulted to insert time.
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // Required-document validity: casting malformed text to jsonb raises and
    // rejects the insert. Same check name as the SQLite json_valid() CHECK.
    check(
      "search_growth_targets_config_valid",
      sql`((${table.configJson})::jsonb) IS NOT NULL`,
    ),
  ],
);

// ============================================================================
// Search Growth V1.0 — Postgres mirror of the
// `search_growth_target_preferred_market_profiles` table in
// ../search-growth.schema.ts (keep the two files structurally identical;
// schema-parity.test.ts fails on drift).
//
// One row is ONE preferred-market reference of a Project's search growth target
// (05_DOMAIN_DATA_MODEL.md §1 SearchGrowthTarget `preferred_market_profile_ids[]`),
// realizing the relation T131 deferred. See the SQLite table for the full
// field/identity reconciliation: the row ships only the normalized relation
// identity (stable `id`, explicit `project_id`, referenced `market_profile_id`)
// plus the append-only `created_at`, and no ordering/priority/primary-market or
// market-payload column is invented.
//
// RELATIONSHIP / DELETE BEHAVIOR: project_id is a NOT NULL FK to projects(id)
// ON DELETE CASCADE (the established Project-scoping FK). The one-column FK
// project_id -> search_growth_targets(project_id) binds the relation to that
// Project's existing target row (the target's PRIMARY KEY is project_id), so a
// relation can never exist without its target and a target row and its market
// relation always share the Project. The SAME-PROJECT composite FK
// (project_id, market_profile_id) -> search_market_profiles(project_id, id)
// rejects a market profile on another Project. The unique index on
// (project_id, market_profile_id) is the natural-pair identity that rejects
// duplicate target/market references; the reverse index serves the
// market_profile -> targets read and cascade paths. Deleting a Project, the
// target row, or a market profile cascades the relation away.
// ============================================================================

export const searchGrowthTargetPreferredMarketProfiles = pgTable(
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
    // carries no mutable payload and no updated_at — it is a preference edge.
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // The relation belongs to the Project's existing search_growth_targets row;
    // the target table's PRIMARY KEY is project_id. Deleting the target row
    // cascades its preferred-market references away.
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [searchGrowthTargets.projectId],
    }).onDelete("cascade"),
    // Same-Project composite FK to the market profile: this relation's
    // project_id must equal the profile's project_id. Deleting a profile removes
    // the relations that prefer it (the referenced (project_id, id) pair is
    // unique via search_market_profiles_project_id_id_idx).
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
// Search Growth V1.0 — immutable, Project-scoped PublicationExecutionPlan core
// (Postgres mirror of ../search-growth.schema.ts; keep the two structurally
// identical and note that schema-parity compares CHECK NAMES, so the plan
// document validity checks have the same name with a dialect-native JSON
// expression). See the SQLite table for the full field/ownership/uniqueness/
// immutability reconciliation. Dialect differences: the jsonb-cast document
// validity checks (Postgres has no json_valid()) and the isoNow timestamp
// default. Every column, enum, FK, index, uniqueness rule and CHECK name matches
// the SQLite side. The parent (project_id, id) composite-FK target is the
// accepted `release_targets_project_id_id_idx` (T125, PG 0048), reused.
// ============================================================================

export const publicationExecutionPlans = pgTable(
  "publication_execution_plans",
  {
    id: text("id").primaryKey(),
    // The owning Project; explicit so ownership is never inferred and the
    // Project FK + same-Project composite FK below can be enforced.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The ONE ReleaseTarget this fixed plan resolves; bound to this row's project
    // by the composite FK below (cascades the plan away when the target is
    // deleted). The UNIQUE index below enforces at most one plan per target.
    releaseTargetId: text("release_target_id").notNull(),
    // The source-defined distribution route union (domain-types.ts
    // DistributionRoute; 10 §§2–3), DB-checked below and narrowed by the Zod
    // boundary.
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
    // Optional opaque draft-stager identifier; NULL = no stager for the route.
    draftStagerId: text("draft_stager_id"),
    // Optional opaque finalizer identifier; NULL = no finalizer.
    finalizerId: text("finalizer_id"),
    // Optional source-defined finalizer strategy union (DB-checked, NULL
    // admitted); NULL = no strategy attached.
    finalizerStrategy: text("finalizer_strategy", {
      enum: ["OFFICIAL_API", "IN_PAGE_WEB_API", "SERVICE_CLI", "FIXED_DOM"],
    }),
    // Required opaque executor version pinned into the plan; stored verbatim.
    executorVersion: text("executor_version").notNull(),
    // Required plan documents, each a JSON text document validated at the
    // storage boundary below and shape-validated at the Zod boundary.
    requiredFieldsJson: text("required_fields_json").notNull(),
    constraintsSnapshotJson: text("constraints_snapshot_json").notNull(),
    verificationPolicyJson: text("verification_policy_json").notNull(),
    // Optional source-defined fallback route (DB-checked, NULL admitted); NULL =
    // no fallback.
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
    // Required opaque plan hash stored verbatim; plain non-unique column.
    planHash: text("plan_hash").notNull(),
    // Append-only creation timestamp (the ONLY audit column; no updated_at).
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    // Same-Project composite FK to the ReleaseTarget (cascade); the referenced
    // (project_id, id) pair is unique via the accepted
    // `release_targets_project_id_id_idx` from T125 PG 0048.
    foreignKey({
      columns: [table.projectId, table.releaseTargetId],
      foreignColumns: [releaseTargets.projectId, releaseTargets.id],
    }).onDelete("cascade"),
    // One plan per ReleaseTarget: a duplicate plan for the same target is
    // rejected by the DB.
    uniqueIndex("publication_execution_plans_release_target_id_idx").on(
      table.releaseTargetId,
    ),
    // DB-level route rejection for the source-defined route union (same check
    // name as the SQLite side).
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
    // Plan-document validity (same check names as the SQLite json_valid()
    // checks): casting malformed text to jsonb raises and rejects the insert.
    check(
      "publication_execution_plans_required_fields_valid",
      sql`((${table.requiredFieldsJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "publication_execution_plans_constraints_snapshot_valid",
      sql`((${table.constraintsSnapshotJson})::jsonb) IS NOT NULL`,
    ),
    check(
      "publication_execution_plans_verification_policy_valid",
      sql`((${table.verificationPolicyJson})::jsonb) IS NOT NULL`,
    ),
  ],
);
