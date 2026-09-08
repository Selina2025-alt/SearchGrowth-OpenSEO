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
