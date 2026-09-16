// ============================================================================
// GeoEntityMention recording port (ADR-005, 05_DOMAIN_DATA_MODEL.md §7,
// 07_GEO_MEASUREMENT_SPEC.md §5, 21_TEST_ACCEPTANCE_PLAN.md §3)
// ============================================================================
//
// The narrow, storage-free contract between whatever produces one normalized
// entity-mention fact and the append-only adapter that records it (mirrors the
// T140 `GeoObservationParseRecorder` port in ./geoObservationParseRecorder.ts).
//
// A `GeoEntityMentionFact` is one entity's mention verdict inside one concrete,
// immutable versioned parse: the required `mentioned` boolean, the optional
// `recommended` verdict, the optional `mentionPosition`, and the optional
// verbatim `sentiment` / `evidenceText`. The fact binds the CONCRETE
// `parseId` — never a run and never a mutable "current" parse pointer — so a
// parser upgrade appends a new version's mentions beside the prior version's
// rather than rewriting them (ADR-005, Parse-version isolation).
//
// Every optional member is an explicit `null` when the parser recorded no
// value; there is no absent-means-default. `sentiment` is §7's `sentiment?`
// and V1.0 defines no sentiment enum or scale, so it stays free text and no
// value is inferred. Entity matching, alias lookup, raw-response inspection,
// recommendation/sentiment/position computation, reparse/current-pointer
// workflow and every provider/cache concern are later or out-of-scope tasks —
// a fact never carries their inputs or outputs.
//
// The port is deliberately DB-free: it names no table, driver, or schema, so a
// parser can be exercised against an in-process fake recorder. The storage
// adapter re-validates the runtime boundary before INSERT, because these
// TypeScript types do not exist at runtime.

/**
 * One recordable entity-mention fact. Structurally aligned with the accepted
 * `geo_entity_mentions` columns the adapter writes, so storage maps it without
 * deriving anything; `created_at` is the only value the database adds.
 */
export type GeoEntityMentionFact = {
  /** Stable mention identity. Owned by the caller, never generated here. */
  id: string;
  /** The owning Project (never inferred from the parse or the entity). */
  projectId: string;
  /** The concrete, immutable versioned parse this mention came from. */
  parseId: string;
  /** The tracked entity this mention is about (ADR-004). */
  entityId: string;
  /** The parse's verdict: true = mentioned, false = explicitly not mentioned. */
  mentioned: boolean;
  /** `null` means no recommendation was recorded; it is never inferred. */
  recommended: boolean | null;
  /** `null` means no position was recorded; it is never inferred or ranked. */
  mentionPosition: number | null;
  /** Verbatim parser sentiment text, or `null` when none was recorded. */
  sentiment: string | null;
  /** Verbatim evidence span text, or `null` when none was recorded. */
  evidenceText: string | null;
};

/**
 * One fact in, one append-only `geo_entity_mentions` row out. There is no
 * update, upsert, dedupe, retry, delete, or entity-matching operation: any
 * storage failure (same-Project or dangling parse/entity FK, duplicate id)
 * surfaces to the caller.
 */
export type GeoEntityMentionRecorder = {
  record(mentionFact: GeoEntityMentionFact): Promise<void>;
};
