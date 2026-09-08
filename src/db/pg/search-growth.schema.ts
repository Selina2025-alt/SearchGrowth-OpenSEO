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
